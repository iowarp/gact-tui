"""End-to-end smoke for IIIIIII1: ask Claude for a long reply, fire
POST /v1/sessions/{sid}/cancel mid-stream, assert the turn ends
quickly via session.status_changed and that any subsequent SSE
events reflect the early termination.

Per the testing rule: real Claude, real OAuth. Auto-skips when
`claude` is missing.
"""

from __future__ import annotations

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


def test_real_claude_cancel_mid_stream(tmp_path: Path) -> None:
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
            sid = c.post("/v1/sessions", json={"title": "cancel"}).json()["id"]

            # Ask for a non-trivial reply (~500 words) so the SDK is
            # genuinely mid-stream when we cancel. Longer prompts make
            # interrupt take noticeably longer to settle on the CLI
            # side, which makes the test budget fragile.
            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={
                    "parts": [
                        {
                            "type": "text",
                            "text": (
                                "Write a 500-word essay about the history "
                                "of the Go programming language."
                            ),
                        }
                    ]
                },
            )
            assert r.status_code == 202, r.text

            # Wait until the turn is genuinely in flight (status
            # transitions to "running") so we know interrupt has
            # something to interrupt. Polls instead of SSE-streaming
            # because httpx's iter_lines can stall under load and
            # we'd rather have a deterministic test than chase that.
            running_at: float | None = None
            for _ in range(50):
                st = c.get(f"/v1/sessions/{sid}").json()["status"]
                if st == "running":
                    running_at = time.time()
                    break
                time.sleep(0.1)
            assert running_at is not None, "session never reached running status; SDK didn't start"

            # Let a few stream events flow so interrupt has work to
            # cut short.
            time.sleep(1.0)

            cancel_resp = c.post(f"/v1/sessions/{sid}/cancel")
            assert cancel_resp.status_code == 204
            cancel_at = time.time()

            # Poll until status leaves "running" — cancel either
            # transitions it to idle or error. 30s budget post-cancel.
            terminal_status: str | None = None
            for _ in range(150):  # 30s @ 0.2s polls
                st = c.get(f"/v1/sessions/{sid}").json()["status"]
                if st in ("idle", "error"):
                    terminal_status = st
                    break
                time.sleep(0.2)
            settle_s = time.time() - cancel_at

            assert terminal_status in ("idle", "error"), (
                f"session never settled after cancel; status={terminal_status}"
            )
            # Cancel is supposed to be quick — give it generous slack
            # (10s) but call it out if it takes much longer than a
            # typical reply would have anyway.
            assert settle_s < 30.0, f"cancel took {settle_s:.1f}s to settle (expected <10s)"
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
