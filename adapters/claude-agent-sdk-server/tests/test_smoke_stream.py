"""End-to-end smoke for GGGGGGG4: ask a real Claude turn for a
multi-token reply, then assert at least one `message.part.delta`
event rode the SSE stream alongside the final `message.created`.

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


def test_real_claude_streams_text_deltas(tmp_path: Path) -> None:
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

        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=120) as c:
            sid = c.post("/v1/sessions", json={"title": "stream"}).json()["id"]

            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={
                    "parts": [
                        {
                            "type": "text",
                            "text": (
                                "Reply with three short sentences about Go's "
                                "concurrency model. No tools, just text."
                            ),
                        }
                    ]
                },
            )
            assert r.status_code == 202, r.text

            # Drain SSE until terminal status, counting deltas.
            delta_count = 0
            saw_part_added = False
            saw_message_completed = False
            terminal_status: str | None = None
            deadline = time.time() + 90.0
            with c.stream("GET", f"/v1/sessions/{sid}/events", timeout=90) as resp:
                assert resp.status_code == 200
                for line in resp.iter_lines():
                    if time.time() > deadline:
                        pytest.fail(f"no terminal event within 90s; deltas={delta_count}")
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
                    if et == "message.part.delta":
                        delta_count += 1
                        # Sanity: payload shape matches SPEC.
                        pl = ev["payload"]
                        assert isinstance(pl["message_id"], str)
                        assert isinstance(pl["part_id"], str)
                        assert "text_append" in pl["delta"]
                    elif et == "message.part.added":
                        saw_part_added = True
                    elif et == "message.completed":
                        saw_message_completed = True
                    elif et == "session.status_changed":
                        st = ev["payload"].get("status")
                        if st in ("idle", "error"):
                            terminal_status = st
                            break

            assert terminal_status == "idle", f"ended in {terminal_status}"
            assert saw_part_added, (
                "expected at least one message.part.added event (streaming text block start)"
            )
            assert delta_count >= 1, f"expected ≥1 message.part.delta events; got {delta_count}"
            assert saw_message_completed, "expected message.completed (mapped from message_stop)"
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
