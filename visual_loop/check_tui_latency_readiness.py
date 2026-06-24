#!/usr/bin/env python3
"""Audit TUI latency evidence for #156/#160.

The normal check verifies maintained deterministic/live-partial evidence. The
strict-live check is intentionally harder: it requires a live owned CLIO capture
whose manifest proves the session was still active and streaming when latency
evidence was recorded.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from tui_latency_readiness_model import (
    EVIDENCE,
    LATENCY_BUDGET_TOLERANCE,
    PNG_SIGNATURE,
    PTY_MOUSE_LATENCY_REPORT,
    PTY_MOUSE_SECTION_BASELINES_MS,
    Evidence,
    artifact_status,
    check_readiness,
    evidence_status,
    float_value,
    int_value,
    load_json_object,
    load_manifest,
    pty_mouse_latency_budget_status,
)

__all__ = [
    "EVIDENCE",
    "LATENCY_BUDGET_TOLERANCE",
    "PNG_SIGNATURE",
    "PTY_MOUSE_LATENCY_REPORT",
    "PTY_MOUSE_SECTION_BASELINES_MS",
    "Evidence",
    "artifact_status",
    "check_readiness",
    "evidence_status",
    "float_value",
    "int_value",
    "load_json_object",
    "load_manifest",
    "main",
    "pty_mouse_latency_budget_status",
    "render_markdown",
]


def render_markdown(result: dict[str, object]) -> str:
    summary = result["summary"]
    lines = [
        "# TUI Latency Visual Readiness",
        "",
        f"- maintained evidence ready: `{str(result['ok']).lower()}`",
        f"- strict live evidence ready: `{str(result['strict_live_ok']).lower()}`",
        f"- maintained evidence: `{summary['maintained_ready']}/{summary['maintained_count']}`",
        f"- strict live evidence: `{summary['strict_live_ready']}/{summary['strict_live_count']}`",
        "",
        "| Area | Evidence | Maintained | Strict live | Ready |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in result["items"]:
        lines.append(
            "| {area} | {title} | {maintained} | {strict_live} | {ready} |".format(
                area=item["area"],
                title=item["title"],
                maintained="yes" if item["required_for_maintained"] else "no",
                strict_live="yes" if item["required_for_strict_live"] else "no",
                ready="yes" if item["ok"] else "no",
            )
        )
    lines.append("")
    for item in result["items"]:
        if item["ok"]:
            continue
        lines.append(f"## Missing: {item['area']} - {item['title']}")
        for rel, status in item["artifacts"].items():
            if not status["ok"]:
                lines.append(f"- `{rel}`: {status['state']}")
        if item["missing_keys"]:
            lines.append("- Missing manifest keys: " + ", ".join(f"`{key}`" for key in item["missing_keys"]))
        if item["false_keys"]:
            lines.append("- False manifest keys: " + ", ".join(f"`{key}`" for key in item["false_keys"]))
        if item["non_positive"]:
            lines.append("- Non-positive counters: " + ", ".join(f"`{key}`" for key in item["non_positive"]))
        if item["active_stream_blockers"]:
            lines.append("- Active-stream blockers: " + ", ".join(f"`{key}`" for key in item["active_stream_blockers"]))
        latency_budget = item.get("latency_budget")
        if isinstance(latency_budget, dict) and not latency_budget["ok"]:
            lines.append(
                "- Latency budget failure: "
                f"`{latency_budget['report']}` must stay within "
                f"`{latency_budget['tolerance']}x` checked-in PTY baselines"
            )
            missing_sections = latency_budget.get("missing_sections")
            if missing_sections:
                lines.append(
                    "- Missing latency sections: "
                    + ", ".join(f"`{section}`" for section in missing_sections)
                )
            over_budget = latency_budget.get("over_budget")
            if isinstance(over_budget, list):
                for failure in over_budget:
                    if not isinstance(failure, dict):
                        continue
                    lines.append(
                        "- Over budget: `{surface}` p95 `{actual_ms}ms` > `{budget_ms}ms` "
                        "(baseline `{baseline_ms}ms`)".format(**failure)
                    )
        lines.append("")
    ready_budget_items = [
        item.get("latency_budget")
        for item in result["items"]
        if isinstance(item.get("latency_budget"), dict) and item.get("ok")
    ]
    if ready_budget_items:
        lines.extend(["## Maintained Latency Budgets", ""])
        for budget in ready_budget_items:
            if not isinstance(budget, dict):
                continue
            baselines = budget.get("baselines", {})
            observed = budget.get("observed", {})
            if not isinstance(baselines, dict) or not isinstance(observed, dict):
                continue
            lines.append(
                f"- `{budget['report']}`: p95 must stay within "
                f"`{budget['tolerance']}x` of checked-in baselines"
            )
            for surface in PTY_MOUSE_SECTION_BASELINES_MS:
                baseline = baselines.get(surface, {})
                if not isinstance(baseline, dict):
                    continue
                actual = observed.get(surface)
                lines.append(
                    "- `{surface}`: observed `{actual}ms`, budget `{budget_ms}ms`, baseline `{baseline_ms}ms`".format(
                        surface=surface,
                        actual=actual,
                        budget_ms=baseline["budget_ms"],
                        baseline_ms=baseline["baseline_ms"],
                    )
                )
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict-live", action="store_true", help="require active live-stream latency evidence")
    parser.add_argument("--write-report", help="write Markdown readiness report")
    args = parser.parse_args(argv)

    root = Path(args.root)
    result = check_readiness(root)
    if args.write_report:
        output = root / args.write_report
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(result), encoding="utf-8")
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(render_markdown(result))
    return 0 if result["ok"] and (not args.strict_live or result["strict_live_ok"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
