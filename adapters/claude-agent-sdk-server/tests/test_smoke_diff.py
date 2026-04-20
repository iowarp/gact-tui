"""End-to-end smoke for GGGGGGG3: drive a real Claude turn that
uses the Edit tool, then assert a `file_diff` Part rode alongside
the `tool_call` Part in the assistant message.

Per the testing rule: real Claude, real OAuth, real disk. Auto-skips
when the `claude` CLI isn't on PATH.

We can't *force* Claude to call Edit (it picks its tools), but we
can stack the deck: drop a fixture file in cwd, ask plainly to
"replace 'X' with 'Y' in <file> using the Edit tool". On the dev
box this consistently triggers Edit within ~5 seconds.
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
import threading
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


def test_real_claude_edit_emits_file_diff(tmp_path: Path) -> None:
    # Seed a fixture file Claude can edit.
    fixture = tmp_path / "fixture.txt"
    fixture.write_text("hello world\n")

    port = _free_port()
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
        env={**__import__("os").environ, "GACT_CLAUDE_CWD": str(tmp_path)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        _wait_healthy(port)
        base = f"http://127.0.0.1:{port}"

        # HHHHHHH1: auto-allow permissions in the background so Edit
        # tool calls don't deadlock waiting for a TUI responder.
        stop_responder = threading.Event()

        def responder() -> None:
            with httpx.Client(base_url=base, timeout=10) as rc:
                while not stop_responder.is_set():
                    try:
                        perms = rc.get(
                            "/v1/permissions", params={"status": "pending"}
                        ).json()["permissions"]
                        for p in perms:
                            rc.post(f"/v1/permissions/{p['id']}", json={"action": "allow"})
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.2)

        t = threading.Thread(target=responder, daemon=True)
        t.start()

        with httpx.Client(base_url=base, timeout=180) as c:
            sid = c.post("/v1/sessions", json={"title": "diff"}).json()["id"]

            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={
                    "parts": [
                        {
                            "type": "text",
                            "text": (
                                "Use the Edit tool to change 'world' to 'GACT' "
                                "in fixture.txt. Don't ask me anything; just do it."
                            ),
                        }
                    ]
                },
            )
            assert r.status_code == 202, r.text

            # Drain SSE to terminal status, watching for a file_diff
            # Part inside any assistant message.created.
            saw_file_diff = False
            terminal_status: str | None = None
            deadline = time.time() + 120.0
            with c.stream("GET", f"/v1/sessions/{sid}/events", timeout=120) as resp:
                assert resp.status_code == 200
                for line in resp.iter_lines():
                    if time.time() > deadline:
                        pytest.fail(f"no terminal event within 120s; saw_file_diff={saw_file_diff}")
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
                        msg = ev["payload"]
                        if msg.get("role") == "assistant":
                            for p in msg.get("parts", []):
                                if p.get("type") == "file_diff":
                                    saw_file_diff = True
                                    assert p["path"].endswith("fixture.txt")
                                    assert p.get("applied") is False
                                    # before may be None if Claude wrote;
                                    # for Edit it should be the prior text.
                                    assert p.get("before") is None or "hello world" in p["before"]
                                    assert "GACT" in (p.get("after") or "")
                    if et == "session.status_changed":
                        st = ev["payload"].get("status")
                        if st in ("idle", "error"):
                            terminal_status = st
                            break

            assert terminal_status == "idle", f"ended in {terminal_status}"
            assert saw_file_diff, (
                "expected at least one file_diff Part across the turn — "
                "Claude may not have invoked Edit"
            )
    finally:
        try:
            stop_responder.set()
            t.join(timeout=3)
        except NameError:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        if proc.returncode not in (0, -15, -9):
            stderr = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
            sys.stderr.write(f"[uvicorn stderr]\n{stderr}\n")
