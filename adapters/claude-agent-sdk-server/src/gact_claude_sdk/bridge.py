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


def assistant_message_to_gact(msg: AssistantMessage, session_id: str) -> dict[str, Any]:
    """Convert an SDK AssistantMessage into a GACT Message (SPEC §5.3)."""
    return {
        "id": msg.message_id or ("msg_" + uuid.uuid4().hex[:12]),
        "session_id": session_id,
        "role": "assistant",
        "parts": [block_to_part(b) for b in msg.content],
        "model": msg.model,
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


def sdk_message_to_events(msg: Any, session_id: str) -> Iterable[dict[str, Any]]:
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
    progress UI. Phase II can add StreamEvent → message.part.delta.
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
        yield envelope(
            "message.created",
            {"message": assistant_message_to_gact(msg, session_id)},
        )
        return
    if isinstance(msg, UserMessage):
        yield envelope(
            "message.created",
            {"message": user_message_to_gact(msg, session_id)},
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
