"""End-to-end smoke for HHHHHHH1: ask Claude to run a Bash command,
intercept the SDK's can_use_tool callback, broadcast a SPEC §6.11
permission.requested event, then approve via POST and verify the
turn completes.

Per the testing rule: real Claude, real OAuth. Auto-skips when
`claude` CLI is missing.
"""

from __future__ import annotations

import json
import os
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


def test_real_claude_permission_roundtrip(tmp_path: Path) -> None:
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
        env={**os.environ, "GACT_CLAUDE_CWD": str(tmp_path)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        _wait_healthy(port)
        base = f"http://127.0.0.1:{port}"

        with httpx.Client(base_url=base, timeout=120) as c:
            sid = c.post("/v1/sessions", json={"title": "perm"}).json()["id"]

            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={
                    "parts": [
                        {
                            "type": "text",
                            "text": (
                                "Write a file `new.txt` in the cwd with "
                                "contents `hello`. Use the Write tool. "
                                "Don't ask me; just call the tool."
                            ),
                        }
                    ]
                },
            )
            assert r.status_code == 202, r.text

            # Background responder: as soon as a permission appears in
            # the list, POST allow on it. The TUI does this in response
            # to the user pressing `a`; we automate it for the test.
            stop_responder = threading.Event()
            permissions_responded: list[str] = []

            def responder() -> None:
                with httpx.Client(base_url=base, timeout=10) as rc:
                    while not stop_responder.is_set():
                        try:
                            perms = rc.get(
                                "/v1/permissions",
                                params={"session_id": sid, "status": "pending"},
                            ).json()["permissions"]
                            for p in perms:
                                pid = p["id"]
                                if pid in permissions_responded:
                                    continue
                                rc.post(
                                    f"/v1/permissions/{pid}",
                                    json={"action": "allow"},
                                )
                                permissions_responded.append(pid)
                        except httpx.HTTPError:
                            pass
                        time.sleep(0.2)

            t = threading.Thread(target=responder, daemon=True)
            t.start()

            # Drain SSE; want to see permission.requested → permission
            # .resolved, then session.status_changed:idle.
            saw_requested = False
            saw_resolved = False
            terminal_status: str | None = None
            deadline = time.time() + 120.0
            try:
                with c.stream("GET", f"/v1/sessions/{sid}/events", timeout=120) as resp:
                    assert resp.status_code == 200
                    for line in resp.iter_lines():
                        if time.time() > deadline:
                            pytest.fail(
                                "no terminal event within 120s; "
                                f"requested={saw_requested} "
                                f"resolved={saw_resolved}"
                            )
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
                        if et == "permission.requested":
                            saw_requested = True
                            pl = ev["payload"]
                            assert pl["session_id"] == sid
                            assert pl["tool_call"]["tool_name"] == "Write"
                        elif et == "permission.resolved":
                            saw_resolved = True
                        elif et == "session.status_changed":
                            st = ev["payload"].get("status")
                            if st in ("idle", "error"):
                                terminal_status = st
                                break
            finally:
                stop_responder.set()
                t.join(timeout=3)

            assert saw_requested, "expected at least one permission.requested"
            assert saw_resolved, "expected permission.resolved after allow"
            assert terminal_status == "idle", (
                f"ended in status={terminal_status}; perms={permissions_responded}"
            )
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        if proc.returncode not in (0, -15, -9):
            stderr = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
            sys.stderr.write(f"[uvicorn stderr]\n{stderr}\n")
