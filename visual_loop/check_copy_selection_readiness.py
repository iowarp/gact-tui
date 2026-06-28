#!/usr/bin/env python3
"""Audit copy/selection evidence for the GACT terminal UI.

Deterministic screenshots prove the TUI affordances and fallback text. They do
not prove real terminal selection behavior because mouse capture, native
selection, and clipboard backends depend on the terminal emulator. Keep those
layers separate so #150 cannot be closed from fixture evidence alone.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from copy_selection_readiness_model import (
    CHECKLIST_ITEMS,
    DETERMINISTIC_EVIDENCE,
    LIVE_EVIDENCE,
    PNG_SIGNATURE,
    Evidence,
    artifact_status,
    check_readiness,
    checklist_status,
    evidence_status,
    evidence_text,
    live_status,
)

__all__ = [
    "CHECKLIST_ITEMS",
    "DETERMINISTIC_EVIDENCE",
    "LIVE_EVIDENCE",
    "PNG_SIGNATURE",
    "Evidence",
    "artifact_status",
    "check_readiness",
    "checklist_status",
    "evidence_status",
    "evidence_text",
    "live_status",
    "main",
    "render_markdown",
    "write_report",
]


def render_markdown(result: dict[str, object]) -> str:
    lines = [
        "# Copy And Selection Visual Readiness",
        "",
        f"- ready for maintained deterministic copy proof: `{str(result['ok']).lower()}`",
        f"- deterministic evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live terminal evidence: `{result['summary']['live_ready']}/{result['summary']['live_count']}`",
        "",
        "| Area | Evidence | Required | Ready |",
        "| --- | --- | --- | --- |",
    ]
    for item in result["required"]:
        lines.append(f"| {item['area']} | {item['title']} | yes | {'yes' if item['ok'] else 'no'} |")
    live = result["live"]
    lines.append(f"| {live['area']} | {live['title']} | deferred | {'yes' if live['ok'] else 'no'} |")
    lines.append("")

    all_items = list(result["required"]) + [live]
    for item in all_items:
        if item["ok"]:
            continue
        lines.append(f"## Missing: {item['area']} - {item['title']}")
        missing = [(rel, status["state"]) for rel, status in item["artifacts"].items() if not status["ok"]]
        if missing:
            lines.append("- Missing or invalid artifacts:")
            for rel, state in missing:
                lines.append(f"  - `{rel}` ({state})")
        missing_markers = [marker for marker, ok in item["markers"].items() if not ok]
        if missing_markers:
            lines.append("- Missing diagnostic markers:")
            for marker in missing_markers:
                lines.append(f"  - `{marker}`")
        if item is live:
            if item["forced_noninteractive"]:
                lines.append("- Live report was captured in forced-noninteractive mode; rerun from the real terminal.")
            if not item["live_mode"]:
                lines.append("- Live report must contain `capture_mode: live-terminal`.")
            incomplete = [entry for entry in item["checklist"].values() if not entry["ok"]]
            if incomplete:
                lines.append("- Incomplete live checklist items:")
                for entry in incomplete:
                    lines.append(f"  - `{entry['label']}` ({entry['state']})")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, object], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if maintained deterministic copy evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless live terminal copy/selection proof is complete")
    args = parser.parse_args(argv)

    result = check_readiness(Path(args.root))
    if args.write_report:
        write_report(result, Path(args.write_report))
    print(render_markdown(result), end="")
    if args.strict and not result["ok"]:
        return 1
    if args.strict_live and not result["live_ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
