#!/usr/bin/env python3
"""Capture TUI mouse latency by sending terminal mouse events through a PTY.

VHS cannot script mouse primitives in the version used by this repo. This
helper drives the real TUI in a pseudo-terminal and emits SGR mouse sequences so
the Bubble Tea input path receives actual terminal mouse click/wheel messages.
It writes the same GACT_TUI_LATENCY_REPORT JSON that live captures use.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request

from tui_mouse_latency_report import read_json, validate_report
from tui_audit_pty import PtyDriver


ROOT = pathlib.Path(__file__).resolve().parents[1]
__all__ = [
    "active_stream_manifest_fields",
    "count_backend_latency_samples",
    "get_backend_json",
    "main",
    "read_json",
    "validate_report",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", default="", help="existing owned backend URL")
    parser.add_argument("--session", default="", help="session id to attach")
    parser.add_argument("--out-dir", default="visual_loop/screenshots")
    parser.add_argument("--report-name", default="", help="latency JSON filename")
    parser.add_argument("--manifest-name", default="", help="manifest JSON filename")
    parser.add_argument("--port", type=int, default=41932, help="ephemeral emulator port")
    parser.add_argument("--cols", type=int, default=140)
    parser.add_argument("--rows", type=int, default=40)
    parser.add_argument(
        "--live-clio",
        action="store_true",
        help="write live CLIO artifact names and include active-stream manifest fields",
    )
    parser.add_argument(
        "--require-active-stream",
        action="store_true",
        help="fail unless the owned session is still active and backend metrics are non-empty",
    )
    parser.add_argument(
        "--own-backend",
        action="store_true",
        help="acknowledge that --backend points at an isolated backend you own",
    )
    parser.add_argument(
        "--keep-ansi",
        action="store_true",
        help="preserve raw terminal output for debugging",
    )
    return parser.parse_args()


def wait_http(url: str, timeout_s: float = 10) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url.rstrip("/") + "/v1/sessions", timeout=1) as resp:
                if resp.status < 500:
                    return
        except Exception as exc:  # noqa: BLE001 - diagnostic helper
            last_error = exc
        time.sleep(0.1)
    raise RuntimeError(f"backend did not become ready at {url}: {last_error}")


def get_backend_json(backend: str, path: str) -> dict:
    if not backend:
        return {}
    try:
        req = urllib.request.Request(
            backend.rstrip("/") + path,
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - diagnostic helper
        return {}


def count_backend_latency_samples(metrics: dict) -> int:
    latencies = metrics.get("latencies") if isinstance(metrics, dict) else {}
    if not isinstance(latencies, dict):
        return 0
    sample_count = 0
    for row in latencies.values():
        if not isinstance(row, dict):
            continue
        try:
            sample_count += int(row.get("count") or 0)
        except (TypeError, ValueError):
            pass
    return sample_count


def message_rows_from_response(messages: dict) -> list:
    if not isinstance(messages, dict):
        return []
    rows = messages.get("messages")
    return rows if isinstance(rows, list) else []


def active_stream_manifest_fields(backend: str, session_id: str) -> dict:
    metrics = get_backend_json(backend, "/v1/metrics")
    session = get_backend_json(backend, f"/v1/sessions/{session_id}") if session_id else {}
    messages = get_backend_json(backend, f"/v1/sessions/{session_id}/messages") if session_id else {}
    rows = message_rows_from_response(messages)
    metadata_blob = json.dumps(rows, sort_keys=True)
    provider_streaming_limitation = "provider_streaming_limitation" in metadata_blob
    live_streaming_false = '"live_streaming": false' in metadata_blob
    session_status = str(session.get("status", "")).strip()

    blockers = []
    if not session_id:
        blockers.append("missing_session_id")
    if session_status not in {"running", "waiting_permission"}:
        blockers.append(f"session_status_{session_status or 'unknown'}")
    if not rows:
        blockers.append("no_session_messages")
    backend_sample_count = count_backend_latency_samples(metrics)
    if backend_sample_count <= 0:
        blockers.append("backend_metrics_sample_count_zero")
    if provider_streaming_limitation:
        blockers.append("provider_streaming_limitation")
    if live_streaming_false:
        blockers.append("live_streaming_false")

    return {
        "session_status": session_status,
        "session_message_count": len(rows),
        "backend_metrics_sample_count": backend_sample_count,
        "active_stream_evidence": not blockers,
        "active_stream_blockers": blockers,
        "provider_streaming_limitation": provider_streaming_limitation,
        "live_streaming_false": live_streaming_false,
    }


def start_emulator(port: int, session_id: str, log_path: pathlib.Path) -> tuple[subprocess.Popen, str, str]:
    binary = ROOT / ".tools" / "emulator-server"
    if not binary.exists():
        raise RuntimeError("missing .tools/emulator-server; run: go build -p 1 -o .tools/emulator-server ./emulator/cmd/emulator-server")
    sid = session_id or "ses_seed_ws_default_1"
    log = log_path.open("wb")
    proc = subprocess.Popen(
        [
            str(binary),
            "-port",
            str(port),
            "-timing",
            "fast",
            "-seed-sessions",
            "ws_default=4",
            "-seed-messages",
            f"{sid}=1",
        ],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    backend = f"http://127.0.0.1:{port}"
    try:
        wait_http(backend)
    except Exception:
        proc.terminate()
        raise
    return proc, backend, sid


def main() -> int:
    args = parse_args()
    out_dir = (ROOT / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    live_mode = args.live_clio or args.require_active_stream
    if live_mode and not args.backend.strip():
        raise SystemExit("--live-clio/--require-active-stream requires --backend pointing at an owned CLIO instance")
    report_name = args.report_name or ("live_clio_tui_mouse_latency_report.json" if live_mode else "tui_mouse_latency_pty_report.json")
    manifest_name = args.manifest_name or ("live_clio_tui_mouse_latency_manifest.json" if live_mode else "tui_mouse_latency_pty_manifest.json")
    report_path = out_dir / report_name
    manifest_path = out_dir / manifest_name
    ansi_path = out_dir / "tui_mouse_latency_pty_output.ansi"
    emulator_log = pathlib.Path(tempfile.gettempdir()) / "gact-tui-mouse-latency-emulator.log"

    backend = args.backend.strip()
    session_id = args.session.strip()
    emulator_proc: subprocess.Popen | None = None
    if backend:
        if not args.own_backend and os.environ.get("GACT_TUI_MOUSE_LATENCY_OWN_BACKEND") != "1":
            raise SystemExit("refusing to run against --backend without --own-backend or GACT_TUI_MOUSE_LATENCY_OWN_BACKEND=1")
        wait_http(backend)
    else:
        emulator_proc, backend, session_id = start_emulator(args.port, session_id, emulator_log)

    binary = ROOT / "tui" / "gact"
    if not binary.exists():
        raise SystemExit("missing tui/gact; run: go build -p 1 -o tui/gact ./tui")

    env = os.environ.copy()
    env["GACT_TUI_LATENCY_REPORT"] = str(report_path)
    env["GACT_ATTACH_SESSION_ID"] = session_id
    env["TERM"] = env.get("TERM") or "xterm-256color"
    argv = [str(binary), "--backend", backend, "--no-intro"]
    driver = PtyDriver(argv, env, args.rows, args.cols, cwd=ROOT)
    try:
        if not driver.wait_screen("CONVERSATION", timeout_s=12):
            raise RuntimeError("timed out waiting for screen pattern 'CONVERSATION'")
        # Hit distinct semantic targets. Coordinates are SGR 1-based cells.
        driver.click(max(2, args.cols - 28), 1)  # header help
        driver.escape()
        driver.click(max(2, args.cols - 16), 1)  # header settings
        driver.escape()
        driver.click(5, 5)  # left sidebar selected session
        driver.click(args.cols // 2, 9)  # conversation body
        driver.click(8, max(3, args.rows - 2))  # input command/focus area
        driver.wheel_down(args.cols // 2, 9)
        driver.ctrl_c()
        driver.ctrl_c()
        code = driver.terminate()
        if code != 0:
            raise RuntimeError(f"TUI exited with status {code}")
    finally:
        if args.keep_ansi:
            ansi_path.write_bytes(bytes(driver.buffer))
        driver.close()
        if emulator_proc is not None:
            emulator_proc.terminate()
            try:
                emulator_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                emulator_proc.kill()

    summary = validate_report(report_path)
    live_fields = active_stream_manifest_fields(backend, session_id) if live_mode else {}
    manifest = {
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "captured_from_owned_backend": bool(args.backend),
        "backend": backend,
        "session_id": session_id,
        "terminal_cols": args.cols,
        "terminal_rows": args.rows,
        "tui_latency_report": str(report_path.relative_to(ROOT)),
        "ansi_output": str(ansi_path.relative_to(ROOT)) if args.keep_ansi else "",
        "mouse_event_source": "pty_sgr_mouse_sequences",
        "vhs_mouse_limitation": "VHS command set cannot script mouse primitives; this harness sends terminal mouse escape sequences directly.",
        "live_clio_capture": live_mode,
        "require_active_stream": args.require_active_stream,
        "tui_latency_sample_count": int(summary.get("sample_count") or 0),
        "live_click_section_evidence": True,
        **summary,
        **live_fields,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if args.require_active_stream and not manifest.get("active_stream_evidence"):
        blockers = manifest.get("active_stream_blockers")
        if not isinstance(blockers, list):
            blockers = ["unknown_active_stream_blocker"]
        raise SystemExit(
            "active live CLIO mouse latency capture did not satisfy strict evidence: "
            + ", ".join(str(blocker) for blocker in blockers)
        )
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
