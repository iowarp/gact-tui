"""Compact SSE events into JSONL rows for live-observability assertions."""

from __future__ import annotations

from typing import Any


def unwrap_payload(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload") or {}
    if isinstance(payload, dict) and isinstance(payload.get("payload"), dict):
        return payload["payload"]
    return payload if isinstance(payload, dict) else {}


def summarize(event: dict[str, Any], t0: float) -> dict[str, Any]:
    payload = unwrap_payload(event)
    summary: dict[str, Any] = {
        "t": round(event["monotonic"] - t0, 3),
        "event": event.get("event", ""),
    }
    if "error" in event:
        summary["error"] = event["error"]
        return summary

    part = payload.get("part") if isinstance(payload.get("part"), dict) else {}
    if part:
        _summarize_part_event(summary, payload, part)
    else:
        _summarize_payload_event(summary, payload)
    return summary


def _summarize_part_event(
    summary: dict[str, Any],
    payload: dict[str, Any],
    part: dict[str, Any],
) -> None:
    summary["message_id"] = payload.get("message_id", "")
    summary["part_type"] = part.get("type", "")
    for key in (
        "selected_agent",
        "execution_path",
        "tool_name",
        "call_id",
        "is_error",
        "duration_ms",
    ):
        if key in part:
            summary[key] = part[key]
    metadata = part.get("metadata") if isinstance(part.get("metadata"), dict) else {}
    for key in ("agent_id", "parent_id", "stage", "status", "route_source"):
        if key in metadata:
            summary[key] = metadata[key]


def _summarize_payload_event(summary: dict[str, Any], payload: dict[str, Any]) -> None:
    for key in ("message_id", "stop_reason", "status", "prev_status", "reason"):
        if key in payload:
            summary[key] = payload[key]
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    runtime_provenance = payload.get("runtime_provenance")
    if not isinstance(runtime_provenance, dict):
        runtime_provenance = metadata.get("runtime_provenance")
    if isinstance(runtime_provenance, dict) and runtime_provenance:
        summary["runtime_provenance"] = runtime_provenance
    if "tool" in payload:
        summary["tool"] = payload.get("tool")
    if "call_id" in payload:
        summary["call_id"] = payload.get("call_id")
    if summary["event"] == "semantic.event":
        _summarize_semantic_event(summary, payload)


def _summarize_semantic_event(summary: dict[str, Any], payload: dict[str, Any]) -> None:
    summary["payload"] = payload
    actor = payload.get("actor") if isinstance(payload.get("actor"), dict) else {}
    subject = payload.get("subject") if isinstance(payload.get("subject"), dict) else {}
    event_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    for key in ("event_type", "trace_id", "turn_id", "session_id", "detail_level", "status"):
        if key in payload:
            summary[key] = payload[key]
    for key in (
        "agent_id",
        "parent_id",
        "child_id",
        "tool",
        "tool_name",
        "name",
        "stage",
        "selected_agent",
        "execution_path",
    ):
        if key in event_payload:
            summary[key] = event_payload[key]
    if "agent_id" not in summary and "agent_id" in subject:
        summary["agent_id"] = subject["agent_id"]
    if "parent_id" not in summary and "agent_id" in actor:
        summary["parent_id"] = actor["agent_id"]
    if "tool" not in summary:
        for key in ("tool", "tool_name", "name"):
            if key in actor:
                summary["tool"] = actor[key]
                break
