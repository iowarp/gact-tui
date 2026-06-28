"""Row-shape normalization helpers for live-observability events."""

from __future__ import annotations

from typing import Any


def text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def payload_from(row: dict[str, Any]) -> dict[str, Any]:
    payload = mapping(row.get("payload"))
    nested = mapping(payload.get("payload"))
    return nested or payload or row


def event_type(row: dict[str, Any], payload: dict[str, Any]) -> str:
    return text(payload.get("event_type")) or text(row.get("event_type")) or text(row.get("event"))


def part_from(row: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    part = mapping(payload.get("part"))
    if part:
        return part
    if text(row.get("part_type")):
        return row
    return {}


def first_text(*values: Any) -> str:
    for value in values:
        candidate = text(value)
        if candidate:
            return candidate
    return ""


def field(*maps: dict[str, Any], keys: str | tuple[str, ...]) -> str:
    if isinstance(keys, str):
        keys = (keys,)
    for item in maps:
        for key in keys:
            value = item.get(key)
            if isinstance(value, (str, int, float, bool)):
                candidate = text(value)
                if candidate:
                    return candidate
    return ""


def add_text(values: set[str], *raw: Any) -> None:
    for value in raw:
        candidate = text(value)
        if candidate:
            values.add(candidate)


def semantic_suffix(event_type_value: str, suffix: str) -> bool:
    return event_type_value == suffix or event_type_value.endswith("." + suffix)


def semantic_delegation_started(event_type_value: str) -> bool:
    return semantic_suffix(event_type_value, "delegation.started") or event_type_value == "agent.invocation.started"


def semantic_fanout_started(event_type_value: str) -> bool:
    return semantic_suffix(event_type_value, "fanout.started")


def semantic_parent_resumed(event_type_value: str) -> bool:
    return semantic_suffix(event_type_value, "delegation.parent_resumed") or semantic_suffix(
        event_type_value,
        "delegation.completed",
    )


def list_values(*values: Any) -> list[str]:
    out: list[str] = []
    for value in values:
        if isinstance(value, list):
            for item in value:
                candidate = text(item)
                if candidate:
                    out.append(candidate)
        else:
            candidate = text(value)
            if candidate:
                out.append(candidate)
    return out
