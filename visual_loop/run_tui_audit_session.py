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
import datetime as dt
import errno
import json
import os
import pathlib
import pty
import re
import select
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CLIO_ROOT = pathlib.Path("/home/jcernuda/clio-agent")
DEFAULT_BACKEND_BIN = DEFAULT_CLIO_ROOT / ".venv" / "bin" / "clio-agent-gact"
DEFAULT_MARKETPLACE_SOURCE = DEFAULT_CLIO_ROOT / "external" / "clio-agent-marketplace"
DEFAULT_BLUEPRINT_ID = "earthscope-gnss-region"
DEFAULT_CLIO_KIT_ROOT = pathlib.Path("/home/jcernuda/clio-kit")
DEFAULT_PROMPT = "Find the nearest station to San Diego on earthscope, download and analyze the data and plot it"
EXPECTED_MCP_TOOLS = {
    "ndp": {"search_datasets", "stage_resource"},
    "geo": {"filter_points_by_radius"},
    "pandas": {"profile_csv"},
    "plot": {"plot_timeseries"},
}


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


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_jsonl(path: pathlib.Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True, default=str) + "\n")


def request_json(method: str, url: str, body: dict | None = None, timeout: float = 30) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    if not raw:
        return {}
    decoded = json.loads(raw)
    return decoded if isinstance(decoded, dict) else {"data": decoded}


def wait_http(base_url: str, timeout_s: float = 30) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            request_json("GET", base_url.rstrip("/") + "/v1/sessions", timeout=2)
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.2)
    raise RuntimeError(f"backend did not become ready at {base_url}: {last_error}")


def find_port(start: int) -> int:
    for port in range(start, start + 200):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"no free port found starting at {start}")


def build_tui(skip: bool) -> pathlib.Path:
    binary = ROOT / "tui" / "gact"
    if skip:
        if not binary.exists():
            raise RuntimeError(f"missing TUI binary: {binary}")
        return binary
    subprocess.run(["go", "build", "-p", "1", "-o", str(binary), "./tui"], cwd=ROOT, check=True)
    return binary


def start_backend(args: argparse.Namespace, out_dir: pathlib.Path, workspace_root: pathlib.Path) -> tuple[subprocess.Popen | None, str]:
    if args.backend_url:
        wait_http(args.backend_url)
        return None, args.backend_url.rstrip("/")

    backend_bin = pathlib.Path(args.backend_bin)
    if not backend_bin.exists():
        raise RuntimeError(f"backend binary not found: {backend_bin}")
    clio_root = pathlib.Path(args.clio_root)
    port = find_port(args.port)
    backend_log = (out_dir / "backend.log").open("wb")
    env = os.environ.copy()
    env.setdefault("CLIO_AGENT_SRC", str(clio_root))
    env.setdefault("CLIO_AGENT_MAX_STEPS", "12")
    env.setdefault("CLIO_GACT_TURN_TIMEOUT_S", "900")
    env.setdefault("CLIO_TRANSIENT_PROVIDER_RETRY_DELAYS", "5,15")
    env["CLIO_KIT_PATH"] = str(pathlib.Path(args.local_clio_kit_root).resolve())
    env["XDG_CONFIG_HOME"] = str(out_dir / "config")
    env["CLIO_DATA_DIR"] = str(out_dir / "data")
    env["CLIO_SEMANTIC_TRACE_BACKEND"] = "file"
    env["CLIO_SEMANTIC_TRACE_PATH"] = str(out_dir / "traces")
    env["CLIO_ALLOWED_ROOTS"] = os.pathsep.join(
        [
            str(workspace_root),
            str(clio_root),
            str(pathlib.Path(args.marketplace_source).resolve()),
            str(pathlib.Path(args.local_clio_kit_root).resolve()),
            os.environ.get("CLIO_ALLOWED_ROOTS", ""),
        ]
    ).rstrip(os.pathsep)
    proc = subprocess.Popen(
        [str(backend_bin), "--host", "127.0.0.1", "--port", str(port), "--cwd", str(workspace_root)],
        cwd=workspace_root,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    backend_url = f"http://127.0.0.1:{port}"
    try:
        wait_http(backend_url, timeout_s=60)
    except Exception:
        terminate_process(proc)
        raise
    return proc, backend_url


def write_workspace_mcp_override(workspace_root: pathlib.Path, clio_kit_root: pathlib.Path, disabled: bool) -> str:
    if disabled:
        return ""
    mcp_root = clio_kit_root / "clio-kit-mcp-servers"
    required = ["ndp", "geo", "pandas", "plot"]
    if not all((mcp_root / name).is_dir() for name in required):
        return ""
    storage_root = workspace_root / ".clio"
    storage_root.mkdir(parents=True, exist_ok=True)
    path = storage_root / "mcp.yaml"
    path.write_text(
        "\n".join(
            [
                "mcp_servers:",
                f"  ndp: uv run --directory {mcp_root / 'ndp'} ndp-mcp",
                f"  geo: uv run --directory {mcp_root / 'geo'} geo-mcp",
                f"  pandas: uv run --directory {mcp_root / 'pandas'} pandas-mcp",
                f"  plot: uv run --directory {mcp_root / 'plot'} plot-mcp",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return str(path)


def configure_provider(base_url: str, provider: str, model: str) -> dict:
    info = request_json("GET", base_url + "/v1/providers/lm")
    presets = info.get("presets") if isinstance(info.get("presets"), list) else []
    preset = next((p for p in presets if isinstance(p, dict) and p.get("id") == provider), {})
    selected_model = model or str(preset.get("suggested_model") or "gpt-5-codex")
    body: dict[str, object] = {
        "provider": provider,
        "api_base": str(preset.get("api_base") or ""),
        "model": selected_model,
        "temperature": 0.2,
    }
    if provider == "codex":
        body["transport"] = "exec"
    if provider == "argonne":
        body["max_tokens"] = 32000
    configured = request_json("PUT", base_url + "/v1/providers/lm", body, timeout=120)
    try:
        configured = request_json("GET", base_url + "/v1/providers/lm/wait", timeout=120)
    except Exception:
        pass
    return configured


def install_marketplace_blueprint(
    base_url: str,
    workspace_id: str,
    marketplace_source: pathlib.Path,
    blueprint_id: str,
) -> dict:
    listed = request_json(
        "GET",
        base_url + f"/v1/agent-blueprints?workspace_id={workspace_id}",
        timeout=60,
    )
    rows = listed.get("agent_blueprints") if isinstance(listed.get("agent_blueprints"), list) else []
    existing = next((row for row in rows if isinstance(row, dict) and row.get("id") == blueprint_id), None)
    if existing is None:
        request_json(
            "POST",
            base_url + "/v1/agent-blueprints/install",
            {
                "source": str(marketplace_source),
                "scope": "workspace",
                "workspace_id": workspace_id,
                "blueprint_id": blueprint_id,
            },
            timeout=120,
        )
        listed = request_json(
            "GET",
            base_url + f"/v1/agent-blueprints?workspace_id={workspace_id}",
            timeout=60,
        )
        rows = listed.get("agent_blueprints") if isinstance(listed.get("agent_blueprints"), list) else []
        existing = next((row for row in rows if isinstance(row, dict) and row.get("id") == blueprint_id), None)
    if existing is None:
        raise RuntimeError(f"blueprint {blueprint_id!r} was not installed in workspace {workspace_id}")
    return existing


def assert_workspace_mcp_ready(base_url: str, workspace_id: str, out_path: pathlib.Path) -> dict:
    handshake = request_json(
        "GET",
        base_url + f"/v1/mcp/handshake?workspace_id={workspace_id}",
        timeout=180,
    )
    write_jsonl(
        out_path,
        {
            "observed_at": now(),
            "source": "clio_rest_snapshot",
            "kind": "mcp.handshake.preflight",
            "data": handshake,
        },
    )
    servers = handshake.get("servers") if isinstance(handshake.get("servers"), list) else []
    by_name = {str(row.get("name") or ""): row for row in servers if isinstance(row, dict)}
    failures: list[str] = []
    for name, expected_tools in EXPECTED_MCP_TOOLS.items():
        row = by_name.get(name)
        if not row:
            failures.append(f"{name}: missing")
            continue
        if not row.get("reachable"):
            failures.append(f"{name}: unreachable ({row.get('error') or row.get('state') or 'no error'})")
            continue
        tools = {str(tool) for tool in row.get("tools") or []}
        missing_tools = sorted(expected_tools - tools)
        if missing_tools:
            failures.append(f"{name}: missing tools {', '.join(missing_tools)}")
    if failures:
        raise RuntimeError("workspace MCP preflight failed: " + "; ".join(failures))
    return handshake


def create_workspace_and_session(
    base_url: str,
    workspace_root: pathlib.Path,
    out_dir: pathlib.Path,
    prompt: str,
    marketplace_source: pathlib.Path,
    blueprint_id: str,
    trace_path: pathlib.Path,
) -> tuple[str, str, dict]:
    workspace_root.mkdir(parents=True, exist_ok=True)
    ws = request_json(
        "POST",
        base_url + "/v1/workspaces",
        {
            "name": "tui-audit-san-diego-earthscope",
            "root_path": str(workspace_root),
            "storage_root": str(out_dir / "workspace_storage"),
            "metadata": {
                "audit": "tui_clio_trace_comparison",
                "prompt": prompt,
            },
        },
    )
    ws_id = str(ws.get("id") or ws.get("workspace_id") or "")
    if not ws_id:
        raise RuntimeError(f"workspace response did not include id: {ws}")
    install_audit_permission_policy(base_url, ws_id, workspace_root)
    installed_blueprint = install_marketplace_blueprint(
        base_url,
        ws_id,
        marketplace_source,
        blueprint_id,
    )
    mcp_handshake = assert_workspace_mcp_ready(base_url, ws_id, trace_path)
    sess = request_json(
        "POST",
        base_url + "/v1/sessions",
        {
            "workspace_id": ws_id,
            "title": "TUI audit: San Diego EarthScope station plot",
            "routing_mode": "auto",
            "metadata": {
                "audit": "tui_clio_trace_comparison",
                "prompt": prompt,
            },
        },
    )
    sid = str(sess.get("id") or sess.get("session_id") or "")
    if not sid:
        raise RuntimeError(f"session response did not include id: {sess}")
    blueprint = request_json(
        "POST",
        base_url + f"/v1/sessions/{sid}/agent-blueprint",
        {"blueprint_id": blueprint_id},
    )
    return ws_id, sid, {
        "installed_blueprint": installed_blueprint,
        "mcp_handshake": mcp_handshake,
        "session_activation": blueprint,
    }


def install_audit_permission_policy(base_url: str, workspace_id: str, workspace_root: pathlib.Path) -> None:
    request_json(
        "PUT",
        base_url + "/v1/policies",
        {
            "policies": [
                {
                    "scope": "workspace",
                    "scope_id": workspace_id,
                    "tool_name_pattern": "shell_bash",
                    "path_pattern": str(workspace_root) + "/*",
                    "action": "allow_workspace",
                }
            ]
        },
    )


class SSERecorder(threading.Thread):
    def __init__(self, base_url: str, session_id: str, out_path: pathlib.Path) -> None:
        super().__init__(daemon=True)
        self.base_url = base_url
        self.session_id = session_id
        self.out_path = out_path
        self.stop_event = threading.Event()
        self.error: str = ""

    def run(self) -> None:
        url = self.base_url + f"/v1/sessions/{self.session_id}/events"
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        event_index = 0
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                block: list[str] = []
                while not self.stop_event.is_set():
                    raw = resp.readline()
                    if not raw:
                        break
                    line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                    if line == "":
                        if block:
                            event_index += 1
                            self._write_block(event_index, block)
                            block = []
                        continue
                    block.append(line)
        except Exception as exc:  # noqa: BLE001
            self.error = repr(exc)
            write_jsonl(
                self.out_path,
                {
                    "observed_at": now(),
                    "source": "clio_sse",
                    "kind": "reader.error",
                    "error": self.error,
                },
            )

    def _write_block(self, event_index: int, block: list[str]) -> None:
        event_name = ""
        data_lines: list[str] = []
        event_id = ""
        for line in block:
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
            elif line.startswith("id:"):
                event_id = line[3:].strip()
        data_text = "\n".join(data_lines)
        parsed = None
        if data_text:
            try:
                parsed = json.loads(data_text)
            except json.JSONDecodeError:
                parsed = None
        write_jsonl(
            self.out_path,
            {
                "observed_at": now(),
                "source": "clio_sse",
                "kind": event_name or "message",
                "event_index": event_index,
                "event_id": event_id,
                "raw_lines": block,
                "data_text": data_text,
                "data": parsed,
            },
        )

    def stop(self) -> None:
        self.stop_event.set()


class PtyDriver:
    def __init__(self, argv: list[str], env: dict[str, str], rows: int, cols: int, raw_path: pathlib.Path) -> None:
        self.raw_path = raw_path
        self.lock = threading.Lock()
        self.stop_drain = threading.Event()
        self.drain_thread: threading.Thread | None = None
        self.master, slave = pty.openpty()
        try:
            import fcntl
            import struct
            import termios

            size = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, size)
        except Exception:
            pass
        self.proc = subprocess.Popen(
            argv,
            cwd=ROOT,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env=env,
            close_fds=True,
            start_new_session=True,
        )
        os.close(slave)
        self.buffer = bytearray()

    def read_available(self, timeout: float = 0.05) -> bytes:
        with self.lock:
            return self._read_available_locked(timeout)

    def _read_available_locked(self, timeout: float = 0.05) -> bytes:
        chunks: list[bytes] = []
        while True:
            r, _, _ = select.select([self.master], [], [], timeout)
            if not r:
                break
            try:
                chunk = os.read(self.master, 65536)
            except OSError as exc:
                if exc.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            chunks.append(chunk)
            self.buffer.extend(chunk)
            with self.raw_path.open("ab") as fh:
                fh.write(chunk)
            timeout = 0
        return b"".join(chunks)

    def start_background_drain(self) -> None:
        if self.drain_thread is not None:
            return

        def drain() -> None:
            while not self.stop_drain.is_set() and self.proc.poll() is None:
                try:
                    self.read_available(0.05)
                except OSError:
                    break

        self.drain_thread = threading.Thread(target=drain, daemon=True)
        self.drain_thread.start()

    def text(self) -> str:
        with self.lock:
            return strip_ansi(bytes(self.buffer))

    def wait_screen(self, pattern: str, timeout_s: float) -> bool:
        deadline = time.time() + timeout_s
        regex = re.compile(pattern, re.IGNORECASE)
        while time.time() < deadline and self.proc.poll() is None:
            self.read_available(0.2)
            if regex.search(self.text()):
                return True
        return False

    def type_text(self, text: str) -> None:
        os.write(self.master, text.encode("utf-8"))

    def write_bytes(self, data: bytes) -> None:
        os.write(self.master, data)

    def enter(self) -> None:
        os.write(self.master, b"\r")

    def close(self) -> None:
        self.stop_drain.set()
        if self.drain_thread is not None:
            self.drain_thread.join(timeout=1)
        try:
            if self.proc.poll() is None:
                self.proc.terminate()
                self.proc.wait(timeout=5)
        except Exception:
            terminate_process(self.proc)
        try:
            os.close(self.master)
        except OSError:
            pass


def strip_ansi(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", text)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"\x1b[()][A-Za-z0-9]", "", text)
    return text


def terminate_process(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except Exception:
        proc.terminate()
    try:
        proc.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        proc.kill()
    proc.wait(timeout=8)


def post_prompt_via_tui(driver: PtyDriver, prompt: str, out_dir: pathlib.Path) -> None:
    (out_dir / "typed_prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    driver.wait_screen(r"CONVERSATION|SESSIONS|ASSISTANT|USER", timeout_s=45)
    time.sleep(0.5)
    driver.type_text(prompt)
    time.sleep(0.2)
    driver.enter()


def settle_tui_on_final_artifact(driver: PtyDriver, rendered_paths: list[pathlib.Path]) -> None:
    # Focus the conversation pane (input -> sidebar -> body) and jump to the
    # bottom, then page upward until the final plot artifact is visible. The
    # audit's B files are supposed to capture what a user can inspect, not an
    # arbitrary mid-scroll frame left over from live updates.
    driver.write_bytes(b"\t\tG")
    deadline = time.time() + 20
    while time.time() < deadline:
        driver.read_available(0.3)
        rendered = driver.text() + "\n" + "\n".join(
            path.read_text(encoding="utf-8", errors="replace") for path in rendered_paths if path.exists()
        )
        if any(
            marker in rendered
            for marker in (
                "Ctrl+E full image",
                ".png",
                "gnss_timeseries_plot",
                "timeseries.png",
            )
        ):
            return
        # Ctrl+U maps to page-up in the conversation body.
        driver.write_bytes(b"\x15")
        time.sleep(0.2)


def capture_expanded_artifact(
    driver: PtyDriver,
    out_dir: pathlib.Path,
    rendered_path: pathlib.Path,
    timeout_s: float = 20,
) -> bool:
    driver.write_bytes(b"\x05")  # Ctrl+E
    deadline = time.time() + timeout_s
    markers = (
        "File ·",
        "Artifact ·",
        "renderer:",
        "_timeseries.png",
    )
    while time.time() < deadline:
        driver.read_available(0.2)
        try:
            text = rendered_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        if any(marker in text for marker in markers):
            (out_dir / "b_expanded_artifact_rendered.txt").write_text(text, encoding="utf-8", errors="replace")
            return True
        time.sleep(0.2)
    try:
        text = rendered_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = driver.text()
    (out_dir / "b_expanded_artifact_rendered.txt").write_text(text, encoding="utf-8", errors="replace")
    return False


def wait_for_tui_received_completion(driver: PtyDriver, received_path: pathlib.Path, timeout_s: float = 180) -> bool:
    markers = (
        "sse.message.completed",
        "P475.CI.LY_.20_timeseries.png",
        "gnss_timeseries_plot",
        "turn.completed",
    )
    deadline = time.time() + timeout_s
    offset = 0
    tail = ""
    while time.time() < deadline:
        driver.read_available(0.2)
        try:
            with received_path.open("rb") as fh:
                fh.seek(offset)
                chunk = fh.read()
                offset = fh.tell()
        except OSError:
            chunk = b""
        text = tail + chunk.decode("utf-8", errors="replace")
        tail = text[-512:]
        if any(marker in text for marker in markers):
            return True
        if driver.proc.poll() is not None:
            return False
        time.sleep(0.5)
    return False


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


def append_final_snapshots(base_url: str, session_id: str, out_path: pathlib.Path) -> None:
    for kind, endpoint in [
        ("provider.final", "/v1/providers/lm"),
        ("session.final", f"/v1/sessions/{session_id}"),
        ("messages.final", f"/v1/sessions/{session_id}/messages"),
        ("blueprint.final", f"/v1/sessions/{session_id}/agent-blueprint"),
    ]:
        try:
            data = request_json("GET", base_url + endpoint, timeout=30)
        except Exception as exc:  # noqa: BLE001
            data = {"error": repr(exc)}
        write_jsonl(
            out_path,
            {
                "observed_at": now(),
                "source": "clio_rest_snapshot",
                "kind": kind,
                "data": data,
            },
        )


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
