"""HTTP endpoint tests using FastAPI's TestClient. These don't spawn
the claude CLI — they verify the adapter's GACT v0.1 surface
(routes, status codes, JSON shapes) in isolation. Real-LLM smoke
tests live in test_smoke.py.
"""

from __future__ import annotations

import os

from fastapi.testclient import TestClient

from gact_claude_sdk.server import make_app


def _client() -> TestClient:
    return TestClient(make_app(cwd=os.getcwd()))


def test_health() -> None:
    r = _client().get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["healthy"] is True
    assert isinstance(body["uptime_s"], int)


def test_capabilities_advertises_expected_caps() -> None:
    r = _client().get("/v1/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["contract_version"] == "0.1"
    assert body["backend"]["name"] == "claude-agent-sdk-server"
    caps = body["capabilities"]
    # Wired this phase:
    for on in ("workspaces", "sessions", "messages", "sse", "tools"):
        assert caps[on] is True, f"{on} should be advertised"
    # Not yet wired — must be False so the TUI hides the UI:
    for off in ("voice", "lsp", "scheduled_sessions", "hooks"):
        assert caps[off] is False, f"{off} should be off"


def test_workspace_list_and_get_round_trip() -> None:
    c = _client()
    r = c.get("/v1/workspaces")
    assert r.status_code == 200
    workspaces = r.json()["workspaces"]
    assert len(workspaces) == 1
    ws_id = workspaces[0]["id"]
    assert ws_id == "ws_default"
    assert workspaces[0]["root_path"]  # non-empty cwd

    r2 = c.get(f"/v1/workspaces/{ws_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == ws_id


def test_workspace_get_404() -> None:
    r = _client().get("/v1/workspaces/ws_nonexistent")
    assert r.status_code == 404


def test_session_create_list_get_round_trip() -> None:
    c = _client()
    r = c.post("/v1/sessions", json={"title": "test"})
    assert r.status_code == 200
    sid = r.json()["id"]
    assert sid.startswith("sess_")
    assert r.json()["status"] == "idle"
    assert r.json()["title"] == "test"

    r2 = c.get("/v1/sessions")
    assert r2.status_code == 200
    sids = [s["id"] for s in r2.json()["sessions"]]
    assert sid in sids

    r3 = c.get(f"/v1/sessions/{sid}")
    assert r3.status_code == 200
    assert r3.json()["id"] == sid


def test_session_get_404() -> None:
    r = _client().get("/v1/sessions/sess_nonexistent")
    assert r.status_code == 404


def test_post_message_caches_user_echo() -> None:
    """POST /messages must accept the user turn + cache it for GET
    /messages even before the assistant turn resolves. The actual SDK
    call happens in a background task; this test only verifies the
    synchronous bookkeeping."""
    c = _client()
    sid = c.post("/v1/sessions", json={"title": "echo"}).json()["id"]
    r = c.post(
        f"/v1/sessions/{sid}/messages",
        json={"parts": [{"type": "text", "text": "hello"}]},
    )
    assert r.status_code == 202
    assert r.json()["message_id"].startswith("msg_")
    # Cached user echo must be readable immediately.
    msgs = c.get(f"/v1/sessions/{sid}/messages").json()["messages"]
    assert any(m["role"] == "user" and m["parts"][0]["text"] == "hello" for m in msgs)


def test_post_message_rejects_empty_parts() -> None:
    c = _client()
    sid = c.post("/v1/sessions", json={}).json()["id"]
    r = c.post(f"/v1/sessions/{sid}/messages", json={"parts": []})
    assert r.status_code == 400


def test_tools_empty_before_first_turn() -> None:
    """The SDK's tool catalog is cwd-dependent; we can only learn it
    after the first SystemMessage(init). Before any session has run,
    /v1/tools should still be a valid empty envelope so the TUI's
    catalog browser doesn't crash."""
    r = _client().get("/v1/tools")
    assert r.status_code == 200
    body = r.json()
    assert body == {"tools": []}


def test_tool_404_when_unknown() -> None:
    r = _client().get("/v1/tools/UnknownTool")
    assert r.status_code == 404
