#!/usr/bin/env python3
"""Assert temporal CLIO/GACT live-observability semantics from a JSONL timeline.

This intentionally checks more than "the final screenshot looks correct".  A
passing benchmark-hierarchy timeline must prove the user could see the
orchestrator route/delegate, a child expert/tool run, and parent resume before
the final turn completion event.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class Observation:
    index: int
    t: float
    event: str
    kind: str
    status: str = ""
    detail: str = ""


@dataclass(frozen=True)
class RuntimeAgreement:
    ok: bool
    missing: list[str]
    matched: list[str]


def _str(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _map(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = _map(row.get("payload"))
    nested = _map(payload.get("payload"))
    return nested or payload or row


def _event_type(row: dict[str, Any], payload: dict[str, Any]) -> str:
    return _str(payload.get("event_type")) or _str(row.get("event_type")) or _str(row.get("event"))


def _part(row: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    part = _map(payload.get("part"))
    if part:
        return part
    if _str(row.get("part_type")):
        return row
    return {}


def _nested_str(*values: Any) -> str:
    for value in values:
        text = _str(value)
        if text:
            return text
    return ""


def _field(*maps: dict[str, Any], keys: str | tuple[str, ...]) -> str:
    if isinstance(keys, str):
        keys = (keys,)
    for mapping in maps:
        for key in keys:
            value = mapping.get(key)
            if isinstance(value, (str, int, float, bool)):
                text = _str(value)
                if text:
                    return text
    return ""


def _add(values: set[str], *raw: Any) -> None:
    for value in raw:
        text = _str(value)
        if text:
            values.add(text)


def _runtime_name_rows(raw: Any, *keys: str) -> set[str]:
    out: set[str] = set()
    if isinstance(raw, str):
        _add(out, raw)
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                _add(out, item)
            elif isinstance(item, dict):
                for key in keys:
                    _add(out, item.get(key))
    return out


def _time(row: dict[str, Any], index: int) -> float:
    for key in ("t", "elapsed_s", "monotonic"):
        value = row.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    # Keep deterministic ordering when the fixture only has ordered rows.
    return float(index)


def classify(row: dict[str, Any], index: int) -> list[Observation]:
    payload = _payload(row)
    event = _str(row.get("event")) or _event_type(row, payload)
    sem_type = _event_type(row, payload)
    part = _part(row, payload)
    metadata = _map(part.get("metadata"))
    actor = _map(payload.get("actor"))
    subject = _map(payload.get("subject"))
    event_payload = _map(payload.get("payload"))
    part_type = _str(part.get("type")) or _str(row.get("part_type"))
    status = _str(payload.get("status")) or _str(row.get("status"))
    stage = _str(metadata.get("stage"))
    if not stage:
        stage = _nested_str(row.get("stage"), payload.get("stage"), event_payload.get("stage"))
    parent_id = _field(row, payload, event_payload, metadata, subject, actor, keys=("parent_id", "parent"))
    agent_id = _field(row, payload, event_payload, metadata, subject, actor, keys=("agent_id", "child_id", "agent"))
    tool_name = _field(row, payload, event_payload, metadata, actor, keys=("tool", "tool_name", "name"))
    detail_bits = [
        _nested_str(row.get("execution_path"), part.get("execution_path"), payload.get("execution_path"), event_payload.get("execution_path")),
        _nested_str(row.get("selected_agent"), part.get("selected_agent"), payload.get("selected_agent"), event_payload.get("selected_agent")),
        " -> ".join(bit for bit in (parent_id, agent_id) if bit) if parent_id else agent_id,
        tool_name,
        stage,
    ]
    detail = " · ".join(bit for bit in detail_bits if bit)
    t = _time(row, index)

    out: list[Observation] = []
    route_like = (
        part_type == "routing_decision"
        or sem_type in {"delegation.started", "agent.invocation.started"}
        or " -> " in detail
    )
    if route_like:
        out.append(Observation(index, t, event, "route_or_delegate", status, detail))

    child_like = (
        part_type == "expert_handoff"
        or sem_type in {"delegation.started", "agent.invocation.started", "subagent.started"}
        or stage in {"tool.started", "started", "running"}
    )
    if child_like:
        out.append(Observation(index, t, event, "child_expert_active", status, detail))

    if event == "tool.call.started" or sem_type == "tool.call.started" or part_type == "tool_call":
        out.append(Observation(index, t, event, "tool_started", status, detail))
    if event == "tool.call.completed" or sem_type == "tool.call.completed" or part_type == "tool_result":
        out.append(Observation(index, t, event, "tool_completed", status, detail))

    parent_resume_like = (
        sem_type in {"delegation.parent_resumed", "delegation.completed"}
        or stage in {"parent.resumed", "parent_resumed", "completed"}
        or _str(row.get("stage")) in {"parent.resumed", "parent_resumed"}
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


def _row_maps(row: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    payload = _payload(row)
    event_payload = _map(payload.get("payload"))
    part = _part(row, payload)
    metadata = _map(part.get("metadata"))
    actor = _map(payload.get("actor"))
    subject = _map(payload.get("subject"))
    return payload, event_payload, part, metadata, actor, subject


def runtime_provenance_from_rows(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for row in rows:
        payload = _payload(row)
        candidates = [
            row.get("runtime_provenance"),
            _map(row.get("metadata")).get("runtime_provenance"),
            payload.get("runtime_provenance"),
            _map(payload.get("metadata")).get("runtime_provenance"),
        ]
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate:
                found = candidate
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
        sem_type = _event_type(row, payload)
        stage = _nested_str(row.get("stage"), payload.get("stage"), event_payload.get("stage"), metadata.get("stage"))
        _add(values["trace_ids"], row.get("trace_id"), payload.get("trace_id"))
        _add(
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
        _add(
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
        parent_id = _field(row, payload, event_payload, metadata, subject, actor, keys=("parent_id", "parent"))
        agent_id = _field(row, payload, event_payload, metadata, subject, actor, keys=("agent_id", "child_id", "agent"))
        if parent_id and agent_id and sem_type.startswith("delegation."):
            values["delegations"].add(f"{parent_id}->{agent_id}")
        if sem_type in {"delegation.parent_resumed", "delegation.completed"} or stage in {"parent.resumed", "parent_resumed"}:
            if parent_id and agent_id:
                values["parent_resumes"].add(f"{parent_id}->{agent_id}")
            else:
                values["parent_resumes"].add("observed")
    return values


def runtime_provenance_sets(rp: dict[str, Any]) -> dict[str, set[str]]:
    turn = _map(rp.get("turn"))
    agent = _map(rp.get("agent"))
    tools = _map(rp.get("tools"))
    delegation = _map(rp.get("delegation"))
    values = {
        "trace_ids": set(),
        "agents": set(),
        "tools": set(),
        "delegations": set(),
        "parent_resumes": set(),
    }
    _add(values["trace_ids"], turn.get("trace_id"), rp.get("trace_id"))
    _add(
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
        parent_id = _nested_str(item.get("parent_id"), item.get("parent"))
        agent_id = _nested_str(item.get("agent_id"), item.get("child_id"), item.get("agent"))
        stage = _str(item.get("stage"))
        if parent_id and agent_id:
            values["delegations"].add(f"{parent_id}->{agent_id}")
            if stage in {"parent.resumed", "parent_resumed", "delegation.parent_resumed"}:
                values["parent_resumes"].add(f"{parent_id}->{agent_id}")
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


def render_report(
    path: Path,
    obs: list[Observation],
    required: list[str],
    min_live_lead_s: float,
    runtime_agreement: RuntimeAgreement | None = None,
) -> str:
    ok, chosen, missing = ordered_sequence_before_completion(
        obs,
        required,
        min_live_lead_s=min_live_lead_s,
    )
    completion_t = first_completion_time(obs)
    lines = [
        "# Live Observability Temporal Assertion",
        "",
        f"- input: `{path}`",
        f"- verdict: `{'PASS' if ok else 'FAIL'}`",
        f"- completion_t: `{completion_t if completion_t is not None else 'missing'}`",
        f"- required_order: `{', '.join(required)}`",
        f"- min_live_lead_s: `{min_live_lead_s:g}`",
        "",
    ]
    if chosen:
        lines.extend(["## Matched Sequence", ""])
        for item in chosen:
            lines.append(f"- {item.t:>7.3f}s · {item.kind} · {item.event} · {item.detail}".rstrip(" · "))
        lines.append("")
    if missing:
        lines.extend(["## Missing Before Completion", ""])
        for kind in missing:
            lines.append(f"- {kind}")
        lines.append("")
    if runtime_agreement is not None:
        lines.extend(["## Runtime Provenance Agreement", ""])
        lines.append(f"- verdict: `{'PASS' if runtime_agreement.ok else 'FAIL'}`")
        if runtime_agreement.matched:
            lines.append("- matched:")
            for item in runtime_agreement.matched:
                lines.append(f"  - {item}")
        if runtime_agreement.missing:
            lines.append("- missing_or_mismatched:")
            for item in runtime_agreement.missing:
                lines.append(f"  - {item}")
        lines.append("")
    lines.extend(["## Classified Timeline", ""])
    for item in obs:
        suffix = f" · {item.detail}" if item.detail else ""
        lines.append(f"- {item.t:>7.3f}s · {item.kind} · {item.event}{suffix}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--mode",
        choices=("benchmark-hierarchy", "basic-tools"),
        default="benchmark-hierarchy",
        help="benchmark-hierarchy requires route/delegate, child, tool lifecycle, and parent resume before completion",
    )
    parser.add_argument(
        "--min-live-lead-s",
        type=float,
        default=None,
        help=(
            "minimum seconds each matched observation must precede completion; "
            "defaults to 0.25 for benchmark-hierarchy and 0 for basic-tools"
        ),
    )
    args = parser.parse_args()

    required = ["tool_started", "tool_completed"] if args.mode == "basic-tools" else [
        "route_or_delegate",
        "child_expert_active",
        "tool_started",
        "tool_completed",
        "parent_resumed",
    ]
    min_live_lead_s = args.min_live_lead_s
    if min_live_lead_s is None:
        min_live_lead_s = 0.0 if args.mode == "basic-tools" else 0.25
    rows = load_jsonl(args.jsonl)
    obs = observations(rows)
    ok, _, _ = ordered_sequence_before_completion(obs, required, min_live_lead_s=min_live_lead_s)
    runtime_agreement = runtime_provenance_agreement(rows) if args.mode == "benchmark-hierarchy" else None
    if runtime_agreement is not None:
        ok = ok and runtime_agreement.ok
    report = render_report(args.jsonl, obs, required, min_live_lead_s, runtime_agreement)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
