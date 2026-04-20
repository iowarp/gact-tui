"""Unit tests for bridge.py — the SDK→GACT translation layer.

Constructs SDK dataclasses directly (no claude CLI call) so this is
fast and deterministic. The real-LLM smoke test in test_smoke.py
covers the end-to-end SDK invocation.
"""

from __future__ import annotations

from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)

from gact_claude_sdk.bridge import (
    block_to_part,
    sdk_message_to_events,
)


def test_text_block_translates_to_text_part() -> None:
    p = block_to_part(TextBlock(text="hi there"))
    assert p["type"] == "text"
    assert p["text"] == "hi there"
    assert p["id"].startswith("part_")


def test_tool_use_block_translates_to_tool_call_part() -> None:
    p = block_to_part(ToolUseBlock(id="toolu_123", name="Bash", input={"command": "ls"}))
    assert p["type"] == "tool_call"
    assert p["call_id"] == "toolu_123"
    assert p["tool_name"] == "Bash"
    assert p["input"] == {"command": "ls"}


def test_tool_result_block_with_string_content() -> None:
    p = block_to_part(
        ToolResultBlock(tool_use_id="toolu_123", content="file1.txt\nfile2.txt", is_error=False)
    )
    assert p["type"] == "tool_result"
    assert p["call_id"] == "toolu_123"
    assert p["is_error"] is False
    assert p["content"][0]["type"] == "text"
    assert p["content"][0]["text"] == "file1.txt\nfile2.txt"


def test_tool_result_block_with_list_content_recurses() -> None:
    p = block_to_part(
        ToolResultBlock(
            tool_use_id="toolu_456",
            content=[TextBlock(text="ok"), TextBlock(text="more")],
            is_error=False,
        )
    )
    assert p["type"] == "tool_result"
    assert len(p["content"]) == 2
    assert p["content"][0]["text"] == "ok"
    assert p["content"][1]["text"] == "more"


def test_assistant_message_emits_message_created_event() -> None:
    msg = AssistantMessage(
        content=[TextBlock(text="hello back")],
        model="claude-opus-4-5",
        parent_tool_use_id=None,
        error=None,
        usage={"input_tokens": 5},
        message_id="msg_real_id",
        stop_reason="end_turn",
        session_id="sdk-session-abc",
        uuid="uuid-1",
    )
    events = list(sdk_message_to_events(msg, "sess_xyz"))
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "message.created"
    inner = ev["payload"]["message"]
    assert inner["role"] == "assistant"
    assert inner["session_id"] == "sess_xyz"
    assert inner["model"] == {"provider_id": "anthropic", "model_id": "claude-opus-4-5"}
    assert inner["id"] == "msg_real_id"
    assert inner["parts"][0]["type"] == "text"
    assert inner["parts"][0]["text"] == "hello back"


def test_result_message_success_emits_status_idle() -> None:
    rm = ResultMessage(
        subtype="success",
        duration_ms=1234,
        duration_api_ms=1100,
        is_error=False,
        num_turns=1,
        session_id="sdk-session-abc",
        total_cost_usd=0.0042,
        usage={"input_tokens": 5},
        result="hi",
        permission_denials=[],
        uuid="uuid-r",
    )
    events = list(sdk_message_to_events(rm, "sess_xyz"))
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "session.status_changed"
    assert ev["payload"]["status"] == "idle"
    assert ev["payload"]["prev_status"] == "running"
    assert ev["payload"]["session_id"] == "sess_xyz"
    assert ev["payload"]["duration_ms"] == 1234
    assert ev["payload"]["num_turns"] == 1


def test_result_message_error_emits_status_error() -> None:
    rm = ResultMessage(
        subtype="error",
        duration_ms=10,
        duration_api_ms=10,
        is_error=True,
        num_turns=0,
        session_id="sdk-session-abc",
        total_cost_usd=0.0,
        usage={},
        result=None,
        permission_denials=[],
        uuid="uuid-e",
    )
    events = list(sdk_message_to_events(rm, "sess_xyz"))
    assert events[0]["payload"]["status"] == "error"


def test_system_message_emits_server_connected() -> None:
    sm = SystemMessage(subtype="init", data={"session_id": "x", "model": "claude"})
    events = list(sdk_message_to_events(sm, "sess_xyz"))
    assert events[0]["type"] == "server.connected"
    assert events[0]["payload"]["session_id"] == "sess_xyz"


def test_unknown_block_type_yields_text_placeholder() -> None:
    class WeirdBlock:
        pass

    p = block_to_part(WeirdBlock())
    assert p["type"] == "text"
    assert "WeirdBlock" in p["text"]
