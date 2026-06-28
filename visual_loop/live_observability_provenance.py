"""Runtime-provenance agreement checks for live-observability timelines."""

from __future__ import annotations

from typing import Any, Iterable

from live_observability_fields import (
    add_text,
    event_type,
    field,
    first_text,
    list_values,
    mapping,
    part_from,
    payload_from,
    semantic_parent_resumed,
    semantic_suffix,
    text,
)
from live_observability_types import RuntimeAgreement


def _runtime_name_rows(raw: Any, *keys: str) -> set[str]:
    out: set[str] = set()
    if isinstance(raw, str):
        add_text(out, raw)
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                add_text(out, item)
            elif isinstance(item, dict):
                for key in keys:
                    add_text(out, item.get(key))
    return out


def _row_maps(
    row: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    payload = payload_from(row)
    event_payload = mapping(payload.get("payload"))
    part = part_from(row, payload)
    metadata = mapping(part.get("metadata"))
    actor = mapping(payload.get("actor"))
    subject = mapping(payload.get("subject"))
    return payload, event_payload, part, metadata, actor, subject


def runtime_provenance_from_rows(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for row in rows:
        raw_payload = mapping(row.get("payload"))
        payload = payload_from(row)
        nested_payload = mapping(raw_payload.get("payload"))
        event_payload = mapping(payload.get("payload")) or nested_payload
        event_metadata = (
            mapping(event_payload.get("metadata"))
            or mapping(payload.get("metadata"))
            or mapping(nested_payload.get("metadata"))
        )
        candidates = [
            row.get("runtime_provenance"),
            mapping(row.get("metadata")).get("runtime_provenance"),
            payload.get("runtime_provenance"),
            mapping(payload.get("metadata")).get("runtime_provenance"),
            event_metadata.get("runtime_provenance"),
        ]
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate:
                found = candidate
        if found:
            continue
        tools_called = event_metadata.get("tools_called")
        expert_handoffs = event_metadata.get("expert_handoffs")
        if isinstance(tools_called, list) or isinstance(expert_handoffs, list):
            handoff_agent = ""
            handoff_parent = ""
            if isinstance(expert_handoffs, list):
                for item in expert_handoffs:
                    if not isinstance(item, dict):
                        continue
                    handoff_agent = first_text(
                        handoff_agent,
                        item.get("agent_id"),
                        item.get("child_id"),
                        item.get("agent"),
                    )
                    handoff_parent = first_text(handoff_parent, item.get("parent_id"), item.get("parent"))
            found = {
                "schema_version": "gact.synthetic_runtime_provenance.v1",
                "synthetic_from": "turn_completed_metadata",
                "turn": {
                    "trace_id": first_text(row.get("trace_id"), payload.get("trace_id")),
                    "turn_id": first_text(row.get("turn_id"), payload.get("turn_id")),
                },
                "agent": {
                    "selected_agent_id": first_text(
                        event_payload.get("selected_expert"),
                        event_metadata.get("selected_expert"),
                        payload.get("agent_id"),
                        row.get("agent_id"),
                        handoff_agent,
                    )
                    or handoff_parent,
                    "parent_id": handoff_parent,
                },
                "tools": {"observed": tools_called if isinstance(tools_called, list) else []},
                "delegation": {"events": expert_handoffs if isinstance(expert_handoffs, list) else []},
            }
    return found


def live_observability_sets(rows: Iterable[dict[str, Any]]) -> dict[str, set[str]]:
    values = {
        "trace_ids": set(),
        "agents": set(),
        "tools": set(),
        "delegations": set(),
        "parent_resumes": set(),
    }
    for row in rows:
        payload, event_payload, part, metadata, actor, subject = _row_maps(row)
        sem_type = event_type(row, payload)
        stage = first_text(row.get("stage"), payload.get("stage"), event_payload.get("stage"), metadata.get("stage"))
        add_text(values["trace_ids"], row.get("trace_id"), payload.get("trace_id"))
        add_text(
            values["agents"],
            row.get("selected_agent"),
            row.get("agent_id"),
            payload.get("selected_agent"),
            payload.get("agent_id"),
            event_payload.get("selected_agent"),
            event_payload.get("agent_id"),
            event_payload.get("child_id"),
            part.get("selected_agent"),
            metadata.get("agent_id"),
            subject.get("agent_id"),
        )
        add_text(
            values["tools"],
            row.get("tool"),
            row.get("tool_name"),
            payload.get("tool"),
            payload.get("tool_name"),
            event_payload.get("tool"),
            event_payload.get("tool_name"),
            event_payload.get("name"),
            actor.get("tool"),
            actor.get("tool_name"),
            actor.get("name"),
            part.get("tool_name"),
        )
        parent_id = field(row, payload, event_payload, metadata, subject, actor, keys=("parent_id", "parent"))
        agent_id = field(row, payload, event_payload, metadata, subject, actor, keys=("agent_id", "child_id", "agent"))
        if semantic_suffix(sem_type, "fanout.started") or semantic_suffix(sem_type, "fanout.completed"):
            parent_id = parent_id or field(actor, payload, event_payload, metadata, keys=("agent_id", "parent_expert"))
            for child_id in list_values(
                subject.get("child_agent_ids"),
                event_payload.get("requested_child_agent_ids"),
                event_payload.get("executed_child_agent_ids"),
                payload.get("child_agent_ids"),
            ):
                if parent_id:
                    values["delegations"].add(f"{parent_id}->{child_id}")
        if parent_id and agent_id and (sem_type.startswith("delegation.") or ".delegation." in sem_type):
            values["delegations"].add(f"{parent_id}->{agent_id}")
        if semantic_parent_resumed(sem_type) or stage in {"parent.resumed", "parent_resumed"}:
            if parent_id and agent_id:
                values["parent_resumes"].add(f"{parent_id}->{agent_id}")
            else:
                values["parent_resumes"].add("observed")
    return values


def runtime_provenance_sets(rp: dict[str, Any]) -> dict[str, set[str]]:
    turn = mapping(rp.get("turn"))
    agent = mapping(rp.get("agent"))
    tools = mapping(rp.get("tools"))
    delegation = mapping(rp.get("delegation"))
    values = {
        "trace_ids": set(),
        "agents": set(),
        "tools": set(),
        "delegations": set(),
        "parent_resumes": set(),
    }
    add_text(values["trace_ids"], turn.get("trace_id"), rp.get("trace_id"))
    add_text(
        values["agents"],
        agent.get("selected_agent_id"),
        agent.get("active_agent_id"),
        agent.get("active_expert_id"),
        agent.get("parent_id"),
    )
    values["tools"].update(_runtime_name_rows(tools.get("observed"), "name", "tool_name", "id"))
    values["tools"].update(_runtime_name_rows(tools.get("calls"), "name", "tool_name", "id"))
    if not values["tools"]:
        values["tools"].update(_runtime_name_rows(tools.get("declared"), "name", "tool_name", "id"))
    for item in delegation.get("events", []):
        if not isinstance(item, dict):
            continue
        parent_id = first_text(item.get("parent_id"), item.get("parent"))
        agent_id = first_text(item.get("agent_id"), item.get("child_id"), item.get("agent"))
        resumed_from = first_text(item.get("resumed_from"), item.get("return_from"))
        stage = text(item.get("stage"))
        if stage in {"parent.resumed", "parent_resumed", "delegation.parent_resumed", "blueprint.delegation.parent_resumed"}:
            if agent_id and resumed_from:
                values["parent_resumes"].add(f"{agent_id}->{resumed_from}")
            elif parent_id and agent_id:
                values["parent_resumes"].add(f"{parent_id}->{agent_id}")
            continue
        if parent_id and agent_id:
            values["delegations"].add(f"{parent_id}->{agent_id}")
    return values


def runtime_provenance_agreement(rows: Iterable[dict[str, Any]]) -> RuntimeAgreement:
    row_list = list(rows)
    rp = runtime_provenance_from_rows(row_list)
    if not rp:
        return RuntimeAgreement(False, ["runtime_provenance missing"], [])
    live = live_observability_sets(row_list)
    final = runtime_provenance_sets(rp)
    missing: list[str] = []
    matched: list[str] = []

    if live["trace_ids"] and final["trace_ids"]:
        shared = live["trace_ids"] & final["trace_ids"]
        if shared:
            matched.append("trace_id: " + ", ".join(sorted(shared)))
        else:
            missing.append(
                "trace_id agreement "
                f"(live={','.join(sorted(live['trace_ids']))}; final={','.join(sorted(final['trace_ids']))})"
            )
    elif live["trace_ids"]:
        missing.append("final trace_id")

    for key, label in (
        ("agents", "agent/expert"),
        ("tools", "observed tools"),
        ("delegations", "delegation rows"),
        ("parent_resumes", "parent resume"),
    ):
        if not live[key]:
            continue
        if not final[key]:
            missing.append("final " + label)
            continue
        shared = live[key] & final[key]
        if shared:
            matched.append(label + ": " + ", ".join(sorted(shared)))
        else:
            missing.append(
                label
                + " agreement "
                + f"(live={','.join(sorted(live[key]))}; final={','.join(sorted(final[key]))})"
            )

    return RuntimeAgreement(not missing, missing, matched)
