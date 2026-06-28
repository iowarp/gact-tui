"""Classification and provenance model for live-observability timelines."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from live_observability_fields import (
    event_type,
    field,
    first_text,
    mapping,
    part_from,
    payload_from,
    semantic_delegation_started,
    semantic_fanout_started,
    semantic_parent_resumed,
    text,
)
from live_observability_provenance import (
    live_observability_sets,
    runtime_provenance_agreement,
    runtime_provenance_from_rows,
    runtime_provenance_sets,
)
from live_observability_types import Observation, RuntimeAgreement

__all__ = [
    "Observation",
    "RuntimeAgreement",
    "classify",
    "first_completion_time",
    "live_observability_sets",
    "load_jsonl",
    "observations",
    "ordered_sequence_before_completion",
    "runtime_provenance_agreement",
    "runtime_provenance_from_rows",
    "runtime_provenance_sets",
]


def _time(row: dict[str, Any], index: int) -> float:
    for key in ("t", "elapsed_s", "monotonic"):
        value = row.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    # Keep deterministic ordering when the fixture only has ordered rows.
    return float(index)


def classify(row: dict[str, Any], index: int) -> list[Observation]:
    payload = payload_from(row)
    event = text(row.get("event")) or event_type(row, payload)
    sem_type = event_type(row, payload)
    part = part_from(row, payload)
    metadata = mapping(part.get("metadata"))
    actor = mapping(payload.get("actor"))
    subject = mapping(payload.get("subject"))
    event_payload = mapping(payload.get("payload"))
    part_type = text(part.get("type")) or text(row.get("part_type"))
    status = text(payload.get("status")) or text(row.get("status"))
    stage = text(metadata.get("stage"))
    if not stage:
        stage = first_text(row.get("stage"), payload.get("stage"), event_payload.get("stage"))
    parent_id = field(row, payload, event_payload, metadata, subject, actor, keys=("parent_id", "parent"))
    agent_id = field(row, payload, event_payload, metadata, subject, actor, keys=("agent_id", "child_id", "agent"))
    tool_name = field(row, payload, event_payload, metadata, actor, keys=("tool", "tool_name", "name"))
    detail_bits = [
        first_text(
            row.get("execution_path"),
            part.get("execution_path"),
            payload.get("execution_path"),
            event_payload.get("execution_path"),
        ),
        first_text(
            row.get("selected_agent"),
            part.get("selected_agent"),
            payload.get("selected_agent"),
            event_payload.get("selected_agent"),
        ),
        " -> ".join(bit for bit in (parent_id, agent_id) if bit) if parent_id else agent_id,
        tool_name,
        stage,
    ]
    detail = " · ".join(bit for bit in detail_bits if bit)
    t = _time(row, index)

    out: list[Observation] = []
    route_like = (
        part_type == "routing_decision"
        or semantic_delegation_started(sem_type)
        or semantic_fanout_started(sem_type)
        or " -> " in detail
    )
    if route_like:
        out.append(Observation(index, t, event, "route_or_delegate", status, detail))

    child_like = (
        part_type == "expert_handoff"
        or semantic_delegation_started(sem_type)
        or semantic_fanout_started(sem_type)
        or sem_type == "subagent.started"
        or stage in {"tool.started", "started", "running"}
    )
    if child_like:
        out.append(Observation(index, t, event, "child_expert_active", status, detail))

    if event == "tool.call.started" or sem_type == "tool.call.started" or part_type == "tool_call":
        out.append(Observation(index, t, event, "tool_started", status, detail))
    if event == "tool.call.completed" or sem_type == "tool.call.completed" or part_type == "tool_result":
        out.append(Observation(index, t, event, "tool_completed", status, detail))

    parent_resume_like = (
        semantic_parent_resumed(sem_type)
        or stage in {"parent.resumed", "parent_resumed", "completed"}
        or text(row.get("stage")) in {"parent.resumed", "parent_resumed"}
    )
    if parent_resume_like:
        out.append(Observation(index, t, event, "parent_resumed", status, detail))

    if event == "message.completed" or sem_type in {"turn.completed", "turn.failed"}:
        out.append(Observation(index, t, event, "completion", status, detail))

    return out


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            text = line.strip()
            if not text:
                continue
            try:
                rows.append(json.loads(text))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no}: invalid JSONL: {exc}") from exc
    return rows


def observations(rows: Iterable[dict[str, Any]]) -> list[Observation]:
    out: list[Observation] = []
    for index, row in enumerate(rows):
        out.extend(classify(row, index))
    return out


def first_completion_time(obs: list[Observation]) -> float | None:
    completions = [item.t for item in obs if item.kind == "completion"]
    return min(completions) if completions else None


def ordered_sequence_before_completion(
    obs: list[Observation],
    required: list[str],
    *,
    min_live_lead_s: float = 0.0,
) -> tuple[bool, list[Observation], list[str]]:
    completion_t = first_completion_time(obs)
    usable = [
        item
        for item in obs
        if completion_t is None or item.t <= completion_t - min_live_lead_s
    ]
    chosen: list[Observation] = []
    missing: list[str] = []
    cursor = -1
    for kind in required:
        match = next((item for item in usable if item.kind == kind and item.index > cursor), None)
        if match is None:
            missing.append(kind)
            continue
        chosen.append(match)
        cursor = match.index
    return not missing, chosen, missing
