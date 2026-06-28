#!/usr/bin/env python3
"""Assert temporal CLIO/GACT live-observability semantics from a JSONL timeline.

This intentionally checks more than "the final screenshot looks correct".  A
passing benchmark-hierarchy timeline must prove the user could see the
orchestrator route/delegate, a child expert/tool run, and parent resume before
the final turn completion event.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


from live_observability_model import (
    Observation,
    RuntimeAgreement,
    first_completion_time,
    live_observability_sets,
    load_jsonl,
    observations,
    ordered_sequence_before_completion,
    runtime_provenance_agreement,
    runtime_provenance_from_rows,
    runtime_provenance_sets,
)

__all__ = [
    "Observation",
    "RuntimeAgreement",
    "first_completion_time",
    "live_observability_sets",
    "load_jsonl",
    "main",
    "observations",
    "ordered_sequence_before_completion",
    "render_report",
    "runtime_provenance_agreement",
    "runtime_provenance_from_rows",
    "runtime_provenance_sets",
]


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
