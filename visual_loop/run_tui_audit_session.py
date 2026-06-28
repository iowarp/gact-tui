#!/usr/bin/env python3
"""Run a real CLIO-backed TUI session and preserve audit artifacts.

Artifacts:
  a_clio_trace.jsonl    backend SSE stream plus final backend snapshots
  b_tui_rendered.txt   latest ANSI-stripped conversation pane rendered by the TUI
  b_tui_frames.jsonl   every distinct ANSI-stripped conversation frame, in order
  b_full_tui_rendered.txt latest ANSI-stripped full terminal frame
  b_full_tui_frames.jsonl every distinct ANSI-stripped full terminal frame, in order
  c_tui_received.jsonl raw/normalized messages and SSE events seen by the TUI

This intentionally drives the TUI through a PTY and types the prompt into the
input box so the resulting files distinguish backend order, TUI ingestion, and
TUI presentation.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import uuid

from tui_audit_backend import (
    append_final_snapshots,
    configure_provider,
    create_workspace_and_session,
    request_json,
    start_backend,
    write_workspace_mcp_override,
)
from tui_audit_pty import PtyDriver, terminate_process
from tui_audit_session_interactions import (
    capture_expanded_artifact,
    post_prompt_via_tui,
    settle_tui_on_final_artifact,
    wait_for_tui_received_completion,
)
from tui_audit_sse import SSERecorder, now, write_jsonl


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CLIO_ROOT = pathlib.Path("/home/jcernuda/clio-agent")
DEFAULT_BACKEND_BIN = DEFAULT_CLIO_ROOT / ".venv" / "bin" / "clio-agent-gact"
DEFAULT_MARKETPLACE_SOURCE = DEFAULT_CLIO_ROOT / "external" / "clio-agent-marketplace"
DEFAULT_BLUEPRINT_ID = "earthscope-gnss-region"
DEFAULT_CLIO_KIT_ROOT = pathlib.Path("/home/jcernuda/clio-kit")
DEFAULT_PROMPT = "Find the nearest station to San Diego on earthscope, download and analyze the data and plot it"
__all__ = [
    "approve_pending_permissions",
    "build_tui",
    "capture_expanded_artifact",
    "main",
    "parse_args",
    "post_prompt_via_tui",
    "settle_tui_on_final_artifact",
    "wait_for_tui_received_completion",
    "wait_for_turn",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(ROOT / "visual_loop" / "tui_audit_san_diego"))
    parser.add_argument(
        "--workspace-root",
        default="",
        help="empty workspace root to create; default is a fresh /tmp/gact-tui-audit-* directory",
    )
    parser.add_argument("--clio-root", default=str(DEFAULT_CLIO_ROOT))
    parser.add_argument("--backend-bin", default=str(DEFAULT_BACKEND_BIN))
    parser.add_argument("--backend-url", default="", help="reuse an already-owned backend URL")
    parser.add_argument("--port", type=int, default=17931)
    parser.add_argument("--provider", default="argonne")
    parser.add_argument("--model", default="openai/gpt-oss-120b", help="defaults to provider preset suggested_model")
    parser.add_argument("--marketplace-source", default=str(DEFAULT_MARKETPLACE_SOURCE))
    parser.add_argument("--blueprint-id", default=DEFAULT_BLUEPRINT_ID)
    parser.add_argument("--local-clio-kit-root", default=str(DEFAULT_CLIO_KIT_ROOT))
    parser.add_argument("--no-local-mcp-override", action="store_true")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--timeout-s", type=float, default=1200)
    parser.add_argument("--cols", type=int, default=150)
    parser.add_argument("--rows", type=int, default=48)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--keep-backend", action="store_true")
    parser.add_argument(
        "--capture-expanded-artifact",
        action="store_true",
        help="after the final artifact is visible, press Ctrl+E and save the expanded detail frame",
    )
    return parser.parse_args()


def build_tui(skip: bool) -> pathlib.Path:
    binary = ROOT / "tui" / "gact"
    if skip:
        if not binary.exists():
            raise RuntimeError(f"missing TUI binary: {binary}")
        return binary
    subprocess.run(["go", "build", "-p", "1", "-o", str(binary), "./tui"], cwd=ROOT, check=True)
    return binary


def wait_for_turn(base_url: str, session_id: str, timeout_s: float, driver: PtyDriver) -> dict:
    deadline = time.time() + timeout_s
    saw_running = False
    last_session: dict = {}
    approved_permissions: set[str] = set()
    while time.time() < deadline:
        driver.read_available(0.1)
        try:
            last_session = request_json("GET", base_url + f"/v1/sessions/{session_id}", timeout=5)
        except Exception:
            time.sleep(1)
            continue
        status = str(last_session.get("status") or "")
        if status in {"running", "waiting_permission"}:
            saw_running = True
        if status == "waiting_permission":
            approved_permissions.update(approve_pending_permissions(base_url, session_id, approved_permissions))
        if saw_running and status in {"idle", "error", "cancelled"}:
            return last_session
        time.sleep(1)
    raise TimeoutError(f"session {session_id} did not finish within {timeout_s}s; last={last_session}")


def approve_pending_permissions(base_url: str, session_id: str, already_approved: set[str]) -> set[str]:
    try:
        raw = request_json(
            "GET",
            base_url + f"/v1/permissions?session_id={session_id}&status=pending",
            timeout=10,
        )
    except Exception:
        return set()
    rows = raw.get("permissions") if isinstance(raw.get("permissions"), list) else []
    newly_approved: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        pid = str(row.get("id") or "")
        if not pid or pid in already_approved:
            continue
        request_json("POST", base_url + f"/v1/permissions/{pid}", {"action": "allow_workspace"}, timeout=10)
        newly_approved.add(pid)
    return newly_approved


def main() -> int:
    args = parse_args()
    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    a_trace = out_dir / "a_clio_trace.jsonl"
    b_rendered = out_dir / "b_tui_rendered.txt"
    b_frames = out_dir / "b_tui_frames.jsonl"
    b_full_rendered = out_dir / "b_full_tui_rendered.txt"
    b_full_frames = out_dir / "b_full_tui_frames.jsonl"
    c_received = out_dir / "c_tui_received.jsonl"
    for path in (a_trace, b_rendered, b_frames, b_full_rendered, b_full_frames, c_received, out_dir / "tui_pty.ansi"):
        path.write_bytes(b"")

    if args.workspace_root:
        workspace_root = pathlib.Path(args.workspace_root).resolve()
    else:
        workspace_root = pathlib.Path("/tmp") / f"gact-tui-audit-earthscope-san-diego-{uuid.uuid4().hex[:12]}"
    marketplace_source = pathlib.Path(args.marketplace_source).resolve()
    if not marketplace_source.exists():
        raise RuntimeError(f"marketplace source not found: {marketplace_source}")
    if shutil.which("go") is None:
        raise RuntimeError("go not found on PATH")
    mcp_override = write_workspace_mcp_override(
        workspace_root,
        pathlib.Path(args.local_clio_kit_root).resolve(),
        args.no_local_mcp_override,
    )

    manifest = {
        "started_at": now(),
        "prompt": args.prompt,
        "out_dir": str(out_dir),
        "workspace_root": str(workspace_root),
        "blueprint_id": args.blueprint_id,
        "marketplace_source": str(marketplace_source),
        "local_mcp_override": mcp_override,
        "provider": args.provider,
        "requested_model": args.model,
    }
    backend_proc: subprocess.Popen | None = None
    tui: PtyDriver | None = None
    sse: SSERecorder | None = None
    try:
        tui_bin = build_tui(args.skip_build)
        backend_proc, backend_url = start_backend(args, out_dir, workspace_root)
        provider_info = configure_provider(backend_url, args.provider, args.model)
        ws_id, sid, blueprint = create_workspace_and_session(
            backend_url,
            workspace_root,
            out_dir,
            args.prompt,
            marketplace_source,
            args.blueprint_id,
            a_trace,
        )
        manifest.update(
            {
                "backend_url": backend_url,
                "workspace_id": ws_id,
                "session_id": sid,
                "provider_info": provider_info,
                "blueprint_activation": blueprint,
                "tui_binary": str(tui_bin),
            }
        )
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str), encoding="utf-8")

        sse = SSERecorder(backend_url, sid, a_trace)
        sse.start()

        env = os.environ.copy()
        env.update(
            {
                "GACT_BACKEND": backend_url,
                "GACT_WORKSPACE": ws_id,
                "GACT_ATTACH_SESSION_ID": sid,
                "GACT_NO_INTRO": "1",
                "GACT_TUI_AUDIT_CONVERSATION_PATH": str(b_rendered),
                "GACT_TUI_AUDIT_CONVERSATION_FRAMES_PATH": str(b_frames),
                "GACT_TUI_AUDIT_RENDER_PATH": str(b_full_rendered),
                "GACT_TUI_AUDIT_RENDER_FRAMES_PATH": str(b_full_frames),
                "GACT_TUI_AUDIT_RECEIVED_PATH": str(c_received),
                "TERM": env.get("TERM", "xterm-256color"),
            }
        )
        tui = PtyDriver(
            [str(tui_bin), "--backend", backend_url, "--workspace", ws_id, "--no-intro"],
            env,
            args.rows,
            args.cols,
            out_dir / "tui_pty.ansi",
            cwd=ROOT,
        )
        tui.start_background_drain()
        post_prompt_via_tui(tui, args.prompt, out_dir)
        final_session = wait_for_turn(backend_url, sid, args.timeout_s, tui)
        tui_observed_completion = wait_for_tui_received_completion(tui, c_received)
        manifest["tui_observed_completion"] = tui_observed_completion
        time.sleep(3)
        tui.read_available(0.2)
        settle_tui_on_final_artifact(tui, [b_rendered, b_full_rendered])
        if args.capture_expanded_artifact:
            manifest["expanded_artifact_captured"] = capture_expanded_artifact(tui, out_dir, b_full_rendered)
        append_final_snapshots(backend_url, sid, a_trace)
        manifest.update({"finished_at": now(), "final_session": final_session})
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str), encoding="utf-8")
        print(json.dumps({"out_dir": str(out_dir), "session_id": sid, "backend_url": backend_url}, indent=2))
        return 0
    except Exception as exc:  # noqa: BLE001
        manifest.update({"failed_at": now(), "error": repr(exc)})
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str), encoding="utf-8")
        write_jsonl(a_trace, {"observed_at": now(), "kind": "runner.error", "error": repr(exc)})
        print(f"run_tui_audit_session failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if sse is not None:
            sse.stop()
        if tui is not None:
            tui.close()
        if backend_proc is not None and not args.keep_backend:
            terminate_process(backend_proc)


if __name__ == "__main__":
    raise SystemExit(main())
