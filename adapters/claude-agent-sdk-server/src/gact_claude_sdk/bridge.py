"""Translation between claude-agent-sdk message types and GACT v0.1
wire events (SPEC §7.3).

The SDK yields typed dataclasses (AssistantMessage, ToolUseBlock, ...);
GACT clients expect JSON event envelopes with a `type` + `occurred_at`
+ `payload`. This module is the single place that knows both shapes.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

# Tool names whose ToolUseBlock implies a file mutation. The bridge
# emits a sibling file_diff GACT Part for these so the TUI's a/r
# apply/reject keys light up alongside the tool_call. NotebookEdit is
# intentionally absent — it operates on .ipynb cells and the diff
# shape doesn't map cleanly to the contract's flat before/after.
FILE_MUTATING_TOOLS: frozenset[str] = frozenset({"Edit", "Write"})

# File-extension → language hint mapping for the file_diff `language`
# field (drives syntax highlighting in the TUI's diff renderer).
# Conservative — unknown extensions just omit the hint.
_LANG_BY_EXT: dict[str, str] = {
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".java": "java",
    ".rb": "ruby",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".html": "html",
    ".css": "css",
    ".sql": "sql",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
}


def _language_for(path: str) -> str:
    """Pick a language hint from a file path's extension; "" if unknown."""
    suffix = Path(path).suffix.lower()
    return _LANG_BY_EXT.get(suffix, "")


def file_diff_for_tool_use(block: ToolUseBlock, cwd: str | Path) -> dict[str, Any] | None:
    """Synthesize a GACT file_diff Part for a ToolUseBlock that
    mutates a file (Edit / Write). Returns None for tools that don't
    map to a file diff or for inputs the SDK didn't fully populate.

    The `before` string comes from the file's current on-disk content
    (resolved against the adapter's cwd) — that gives the TUI the
    full context for rendering, not just the snippet the model
    referenced. If the file doesn't exist (Write creating new), the
    pre-state is null, which the TUI renders as a "new file" banner.
    """
    if block.name not in FILE_MUTATING_TOOLS:
        return None
    inp = block.input or {}
    file_path = inp.get("file_path")
    if not isinstance(file_path, str) or not file_path:
        return None

    abs_path = Path(file_path)
    if not abs_path.is_absolute():
        abs_path = Path(cwd) / file_path

    # Read the pre-state; missing/binary files surface as None.
    before: str | None
    try:
        before = abs_path.read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError):
        before = None
    except (UnicodeDecodeError, OSError):
        # Non-text or unreadable — refuse rather than guessing.
        return None

    after: str | None
    if block.name == "Write":
        content = inp.get("content")
        if not isinstance(content, str):
            return None
        after = content
    elif block.name == "Edit":
        old_string = inp.get("old_string")
        new_string = inp.get("new_string")
        if not isinstance(old_string, str) or not isinstance(new_string, str):
            return None
        if before is None:
            # Edit of a non-existent file — adapter can't compute a
            # before; fall back to old_string as the surrogate so the
            # diff still shows something.
            before = old_string
        if inp.get("replace_all"):
            after = before.replace(old_string, new_string)
        else:
            # Edit semantics: replace the FIRST occurrence only, and
            # only if it's unique (matching Anthropic's contract).
            count = before.count(old_string)
            if count == 0:
                return None  # nothing to diff
            after = before.replace(old_string, new_string, 1)
    else:
        return None

    part: dict[str, Any] = {
        "id": "part_" + uuid.uuid4().hex[:12],
        "type": "file_diff",
        "path": file_path,
        "before": before,
        "after": after,
        "applied": False,
    }
    lang = _language_for(file_path)
    if lang:
        part["language"] = lang
    return part


def now_iso() -> str:
    """RFC3339 UTC timestamp — matches SPEC §7.2 occurred_at format."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def envelope(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Wrap a payload in the SPEC §7.2 event envelope."""
    return {
        "type": event_type,
        "occurred_at": now_iso(),
        "payload": payload,
    }


def block_to_part(block: Any) -> dict[str, Any]:
    """Convert a single SDK content block to a GACT Part (SPEC §5.4).

    Forward-compat: unknown block types serialize as a `text` part with
    a `[<class>]` placeholder so they survive transport without
    being silently dropped.
    """
    part_id = "part_" + uuid.uuid4().hex[:12]
    if isinstance(block, TextBlock):
        return {"id": part_id, "type": "text", "text": block.text}
    if isinstance(block, ThinkingBlock):
        # SPEC §5.4 uses `thinking` parts for reasoning. ThinkingBlock
        # has a `thinking` str + `signature` str on the SDK side.
        return {
            "id": part_id,
            "type": "thinking",
            "text": getattr(block, "thinking", ""),
        }
    if isinstance(block, ToolUseBlock):
        return {
            "id": part_id,
            "type": "tool_call",
            "call_id": block.id,
            "tool_name": block.name,
            "input": block.input,
        }
    if isinstance(block, ToolResultBlock):
        # ToolResultBlock has tool_use_id, content (str | list of blocks),
        # is_error: bool. Translate content → text+nested parts.
        raw = block.content
        if isinstance(raw, str):
            content_parts: list[dict[str, Any]] = [
                {"id": "part_" + uuid.uuid4().hex[:12], "type": "text", "text": raw}
            ]
        elif isinstance(raw, list):
            # Each entry can itself be a block — recurse.
            content_parts = [block_to_part(b) for b in raw]
        else:
            content_parts = []
        return {
            "id": part_id,
            "type": "tool_result",
            "call_id": block.tool_use_id,
            "content": content_parts,
            "is_error": bool(getattr(block, "is_error", False)),
        }
    # Forward-compat placeholder.
    cls = type(block).__name__
    return {"id": part_id, "type": "text", "text": f"[{cls}]"}


def assistant_message_to_gact(
    msg: AssistantMessage, session_id: str, cwd: str | Path | None = None
) -> dict[str, Any]:
    """Convert an SDK AssistantMessage into a GACT Message (SPEC §5.3).

    GACT's Message.model is a ModelRef object (`{provider_id, model_id}`),
    not a bare string. The SDK gives us a raw model id like
    `claude-opus-4-7` so we wrap it; provider is hard-coded to
    `anthropic` since claude-agent-sdk only ever talks to Anthropic.

    GGGGGGG3: every Edit/Write ToolUseBlock additionally produces a
    sibling `file_diff` Part so the TUI's a/r apply/reject keys
    light up. Requires `cwd` to resolve relative file paths against
    the workspace root; when unset, file_diff translation is skipped
    (tool_call parts still emit normally).
    """
    parts: list[dict[str, Any]] = []
    for b in msg.content:
        parts.append(block_to_part(b))
        if cwd is not None and isinstance(b, ToolUseBlock):
            diff = file_diff_for_tool_use(b, cwd)
            if diff is not None:
                parts.append(diff)
    return {
        "id": msg.message_id or ("msg_" + uuid.uuid4().hex[:12]),
        "session_id": session_id,
        "role": "assistant",
        "parts": parts,
        "model": {"provider_id": "anthropic", "model_id": msg.model or ""},
        "created_at": now_iso(),
        "stop_reason": msg.stop_reason,
        "usage": msg.usage or {},
    }


def user_message_to_gact(msg: UserMessage, session_id: str) -> dict[str, Any]:
    """Convert an SDK UserMessage into a GACT Message (SPEC §5.3)."""
    raw = msg.content
    if isinstance(raw, str):
        parts: list[dict[str, Any]] = [
            {"id": "part_" + uuid.uuid4().hex[:12], "type": "text", "text": raw}
        ]
    elif isinstance(raw, list):
        parts = [block_to_part(b) for b in raw]
    else:
        parts = []
    return {
        "id": "msg_" + uuid.uuid4().hex[:12],
        "session_id": session_id,
        "role": "user",
        "parts": parts,
        "created_at": now_iso(),
    }


def sdk_message_to_events(
    msg: Any, session_id: str, cwd: str | Path | None = None
) -> Iterable[dict[str, Any]]:
    """Yield the GACT event(s) corresponding to one SDK message.

    The mapping (SPEC §7.3 names):
      - SystemMessage(init)     → server.connected  (one-time on first turn)
      - AssistantMessage         → message.created   (with full parts)
      - UserMessage              → message.created   (echo of the user turn)
      - ResultMessage(success)   → session.status_changed  (idle)
      - ResultMessage(error)     → session.status_changed  (error)

    Per-turn streaming deltas (the SDK's StreamEvent type) are not yet
    translated — we emit complete messages on .receive_response()
    boundaries. That's the trade-off of using the high-level SDK
    surface vs raw stream-json: simpler code, slightly less granular
    progress UI. Phase GGGGGGG4 will add StreamEvent → message.part.delta.

    `cwd`, when provided, enables file_diff Part synthesis for
    Edit/Write ToolUseBlocks (GGGGGGG3) — the diff is computed
    against the on-disk pre-state of the file resolved under cwd.
    """
    if isinstance(msg, SystemMessage):
        # Init event — payload carries the discovered tools/model.
        yield envelope(
            "server.connected",
            {
                "server_version": "claude-agent-sdk",
                "session_id": session_id,
                "data": getattr(msg, "data", {}),
            },
        )
        return
    if isinstance(msg, AssistantMessage):
        # SPEC §7.3: message.created payload IS the Message itself
        # (not wrapped in {"message": {...}}). The reference emulator
        # sets this directly; the gact TUI's applyMessageCreated does
        # `decodeMessage(payload)` so the dict at payload must be the
        # Message shape directly.
        yield envelope(
            "message.created",
            assistant_message_to_gact(msg, session_id, cwd=cwd),
        )
        return
    if isinstance(msg, UserMessage):
        yield envelope(
            "message.created",
            user_message_to_gact(msg, session_id),
        )
        return
    if isinstance(msg, ResultMessage):
        # SPEC §7.3: session.status_changed → idle when the turn ends.
        # is_error decides idle vs error.
        is_error = bool(getattr(msg, "is_error", False))
        yield envelope(
            "session.status_changed",
            {
                "session_id": session_id,
                "status": "error" if is_error else "idle",
                "prev_status": "running",
                "duration_ms": getattr(msg, "duration_ms", 0),
                "total_cost_usd": getattr(msg, "total_cost_usd", 0.0),
                "num_turns": getattr(msg, "num_turns", 0),
            },
        )
        return
    # Forward-compat: unknown SDK message type — emit nothing rather
    # than fabricating a synthetic GACT event.
    return
