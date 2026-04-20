"""End-to-end smoke for IIIIIII2: drive a real Claude turn so the
SDK emits SystemMessage(init).data.mcp_servers, then assert the
sidecar's /v1/mcp/servers + per-id endpoints return the catalog
in SPEC §6.7 shape.

Per the testing rule: real Claude, real OAuth. Auto-skips when
`claude` is missing.

Note: the test only asserts shape, not specific server names — those
depend on the user's claude.ai MCP connector configuration which
varies per dev box.
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


def test_real_claude_populates_mcp_catalog(tmp_path: Path) -> None:
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

        with httpx.Client(base_url=base, timeout=60) as c:
            # Empty pre-init.
            assert c.get("/v1/mcp/servers").json() == {"servers": []}

            sid = c.post("/v1/sessions", json={"title": "mcp"}).json()["id"]
            r = c.post(
                f"/v1/sessions/{sid}/messages",
                json={"parts": [{"type": "text", "text": "hi"}]},
            )
            assert r.status_code == 202

            # Wait for the SDK init handshake (which carries
            # mcp_servers) to land in state.
            deadline = time.time() + 30.0
            servers: list[dict] = []
            while time.time() < deadline:
                servers = c.get("/v1/mcp/servers").json()["servers"]
                if servers or (c.get(f"/v1/sessions/{sid}").json()["status"] in ("idle", "error")):
                    break
                time.sleep(0.3)

            # Whether or not this dev box has MCP servers configured,
            # the catalog endpoint must always be a valid envelope.
            assert isinstance(servers, list)

            # Per-SPEC §6.7 shape on whatever entries we got.
            for srv in servers:
                assert "id" in srv and srv["id"].startswith("mcp_")
                assert srv.get("name")
                assert srv["transport"] == "stdio"
                assert srv["status"] in ("connecting", "ready", "error", "disconnected")

                # Per-id drill must echo the same id.
                detail = c.get(f"/v1/mcp/servers/{srv['id']}").json()
                assert detail["id"] == srv["id"]
                assert detail["name"] == srv["name"]
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
