"""Unit tests for bridge.py — the SDK→GACT translation layer.

Constructs SDK dataclasses directly (no claude CLI call) so this is
fast and deterministic. The real-LLM smoke test in test_smoke.py
covers the end-to-end SDK invocation.
"""

from __future__ import annotations

from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)

from gact_claude_sdk.bridge import (
    assistant_message_to_gact,
    block_to_part,
    file_diff_for_tool_use,
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
    # SPEC §7.3: payload IS the Message (not wrapped in {"message":...})
    inner = ev["payload"]
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


# --- GGGGGGG3: file_diff translation ---------------------------------


def test_file_diff_for_edit_existing_file(tmp_path: Path) -> None:
    f = tmp_path / "main.py"
    f.write_text("def hello():\n    return 'world'\n")
    block = ToolUseBlock(
        id="toolu_e1",
        name="Edit",
        input={
            "file_path": str(f),
            "old_string": "'world'",
            "new_string": "'GACT'",
        },
    )
    diff = file_diff_for_tool_use(block, tmp_path)
    assert diff is not None
    assert diff["type"] == "file_diff"
    assert diff["path"] == str(f)
    assert diff["before"] == "def hello():\n    return 'world'\n"
    assert diff["after"] == "def hello():\n    return 'GACT'\n"
    assert diff["language"] == "python"
    assert diff["applied"] is False


def test_file_diff_for_edit_replace_all(tmp_path: Path) -> None:
    f = tmp_path / "x.go"
    f.write_text("a a a a a")
    block = ToolUseBlock(
        id="toolu_e2",
        name="Edit",
        input={
            "file_path": "x.go",  # relative — resolves under cwd
            "old_string": "a",
            "new_string": "B",
            "replace_all": True,
        },
    )
    diff = file_diff_for_tool_use(block, tmp_path)
    assert diff is not None
    assert diff["after"] == "B B B B B"
    assert diff["language"] == "go"


def test_file_diff_for_edit_no_match_returns_none(tmp_path: Path) -> None:
    f = tmp_path / "no-match.txt"
    f.write_text("hello world")
    block = ToolUseBlock(
        id="toolu_e3",
        name="Edit",
        input={
            "file_path": str(f),
            "old_string": "missing",
            "new_string": "x",
        },
    )
    assert file_diff_for_tool_use(block, tmp_path) is None


def test_file_diff_for_write_new_file(tmp_path: Path) -> None:
    block = ToolUseBlock(
        id="toolu_w1",
        name="Write",
        input={
            "file_path": str(tmp_path / "new.md"),
            "content": "# hello\n",
        },
    )
    diff = file_diff_for_tool_use(block, tmp_path)
    assert diff is not None
    assert diff["type"] == "file_diff"
    assert diff["before"] is None  # SPEC: null for new file
    assert diff["after"] == "# hello\n"
    assert diff["language"] == "markdown"


def test_file_diff_for_write_overwrite(tmp_path: Path) -> None:
    f = tmp_path / "existing.txt"
    f.write_text("old contents\n")
    block = ToolUseBlock(
        id="toolu_w2",
        name="Write",
        input={"file_path": str(f), "content": "new contents\n"},
    )
    diff = file_diff_for_tool_use(block, tmp_path)
    assert diff is not None
    assert diff["before"] == "old contents\n"
    assert diff["after"] == "new contents\n"


def test_file_diff_skips_non_mutating_tools(tmp_path: Path) -> None:
    block = ToolUseBlock(id="toolu_b", name="Bash", input={"command": "ls"})
    assert file_diff_for_tool_use(block, tmp_path) is None


def test_file_diff_skips_notebook_edit(tmp_path: Path) -> None:
    """NotebookEdit operates on .ipynb cells; the SPEC's flat
    before/after doesn't map cleanly. Bridge skips."""
    block = ToolUseBlock(
        id="toolu_nb",
        name="NotebookEdit",
        input={"file_path": "x.ipynb", "edits": [{"cell_id": "c1"}]},
    )
    assert file_diff_for_tool_use(block, tmp_path) is None


def test_file_diff_skips_when_input_missing_required(tmp_path: Path) -> None:
    """Defensive: SDK could in theory deliver a partial input dict;
    we refuse to fabricate a diff."""
    block = ToolUseBlock(
        id="toolu_x",
        name="Write",
        input={"file_path": str(tmp_path / "x")},  # no `content`
    )
    assert file_diff_for_tool_use(block, tmp_path) is None


def test_assistant_message_with_edit_emits_tool_call_plus_file_diff(
    tmp_path: Path,
) -> None:
    """The full integration: an AssistantMessage carrying an Edit
    ToolUseBlock should produce *two* parts in the GACT Message —
    the tool_call AND a sibling file_diff."""
    f = tmp_path / "fixture.go"
    f.write_text("package main\n")
    msg = AssistantMessage(
        content=[
            TextBlock(text="I'll edit that file."),
            ToolUseBlock(
                id="toolu_int",
                name="Edit",
                input={
                    "file_path": str(f),
                    "old_string": "package main",
                    "new_string": "// generated\npackage main",
                },
            ),
        ],
        model="claude-opus-4-7",
        parent_tool_use_id=None,
        error=None,
        usage={},
        message_id="msg_int_1",
        stop_reason="tool_use",
        session_id=None,
        uuid=None,
    )
    gact_msg = assistant_message_to_gact(msg, "sess_x", cwd=tmp_path)
    types = [p["type"] for p in gact_msg["parts"]]
    assert types == ["text", "tool_call", "file_diff"]
    diff = gact_msg["parts"][2]
    assert diff["before"] == "package main\n"
    assert "// generated" in diff["after"]


def test_assistant_message_without_cwd_omits_file_diff() -> None:
    """If the caller doesn't pass cwd (older code paths), file_diff
    synthesis is skipped — only the tool_call part appears."""
    msg = AssistantMessage(
        content=[
            ToolUseBlock(
                id="toolu_nocwd",
                name="Edit",
                input={"file_path": "x.go", "old_string": "a", "new_string": "b"},
            ),
        ],
        model="claude-opus-4-7",
        parent_tool_use_id=None,
        error=None,
        usage={},
        message_id="msg_nocwd",
        stop_reason="tool_use",
        session_id=None,
        uuid=None,
    )
    gact_msg = assistant_message_to_gact(msg, "sess_x")  # no cwd
    types = [p["type"] for p in gact_msg["parts"]]
    assert types == ["tool_call"]
