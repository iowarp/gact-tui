"""End-to-end smoke test against a REAL claude-agent-sdk + claude CLI.

Per the user's testing rule: adapters must be exercised against the
real provider, not a mock. Mocks are only legitimate against the
emulator (which is itself a SPEC reference, not a stand-in).

Spawns uvicorn as a subprocess (TestClient/ASGITransport doesn't
flush SSE chunks the same way a real HTTP server does — we hit that
during development). Then drives the live HTTP+SSE surface exactly
the way the gact TUI would.

The test:
1. Starts `uv run uvicorn ... --port <free>` and waits for /v1/health.
2. POSTs a session, opens its SSE stream, posts a one-word message.
3. Drains events until session.status_changed → idle (or 90s budget).
4. Asserts: an assistant message.created arrived; cached messages
   list reflects both the user echo and the assistant reply; final
   status is idle.

Skips automatically when `claude` is missing — fresh CI without
OAuth would fail otherwise. On a logged-in machine (this dev box),
the test runs and hits the real Anthropic API via the SDK.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

pytestmark = pytest.mark.skipif(
    shutil.which("claude") is None,
    reason="claude CLI not on PATH; smoke test requires real Claude Code install",
)


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _wait_healthy(port: int, deadline_s: float = 10.0) -> None:
    deadline = time.time() + deadline_s
    while time.time() < deadline:
        try:
            r = httpx.get(f"http://127.0.0.1:{port}/v1/health", timeout=1.0)
            if r.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"server on :{port} never became healthy within {deadline_s}s")


def test_real_claude_one_word_reply(tmp_path: Path) -> None:
    port = _free_port()
    env = {**os.environ, "GACT_CLAUDE_CWD": str(tmp_path)}
    proc = subprocess.Popen(
        [
            "uv",
            "run",
            "uvicorn",
            "gact_claude_sdk.server:main_app",
            "--port",
            str(port),
            "--log-level",
            "warning",
            "--factory",
        ],
        cwd=str(Path(__file__).parent.parent),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        _wait_healthy(port)

        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=120) as c:
            # Create session
            sid = c.post("/v1/sessions", json={"title": "smoke"}).json()["id"]
            assert sid.startswith("sess_")

            # POST message
            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={"parts": [{"type": "text", "text": "say hi in exactly one word"}]},
            )
            assert r.status_code == 202, r.text

            # Drain SSE until terminal event or timeout
            terminal_status: str | None = None
            saw_assistant = False
            deadline = time.time() + 90.0
            with c.stream("GET", f"/v1/sessions/{sid}/events", timeout=90) as resp:
                assert resp.status_code == 200
                for line in resp.iter_lines():
                    if time.time() > deadline:
                        pytest.fail(f"no terminal event within 90s; assistant_seen={saw_assistant}")
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    try:
                        ev = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    et = ev.get("type")
                    if et == "message.created":
                        # SPEC §7.3: payload IS the Message itself.
                        msg = ev["payload"]
                        if msg.get("role") == "assistant":
                            saw_assistant = True
                    if et == "session.status_changed":
                        st = ev["payload"].get("status")
                        if st in ("idle", "error"):
                            terminal_status = st
                            break

            assert terminal_status == "idle", (
                f"session ended in status={terminal_status}; assistant_seen={saw_assistant}"
            )
            assert saw_assistant, "expected at least one assistant message.created event"

            # Cached messages reflect the round-trip
            msgs = c.get(f"/v1/sessions/{sid}/messages").json()["messages"]
            roles = [m["role"] for m in msgs]
            assert "user" in roles
            assert "assistant" in roles, f"no assistant in cached messages; roles={roles}"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        # Surface server stderr on failure for debugging.
        if proc.returncode not in (0, -15, -9):
            stderr = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
            sys.stderr.write(f"[uvicorn stderr]\n{stderr}\n")
