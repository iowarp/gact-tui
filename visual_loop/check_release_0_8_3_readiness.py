#!/usr/bin/env python3
"""Audit the focused GACT TUI 0.8.3 release proof.

0.8.2 shipped the deterministic catalog/tree UX work. The next release lane is
terminal and owned-backend operability proof: real terminal copy/selection,
real provider recovery, live marketplace-source lifecycle, and live runtime
catalog/lifecycle breadth. Keep this gate separate from broader 0.9 CLIO-blocked
items such as prompt/expert-pack mutation endpoints.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from release_0_8_3_readiness_model import (
    Gate,
    check_readiness,
    copy_notes,
    missing_artifacts,
    missing_manifest_keys,
)

__all__ = [
    "Gate",
    "check_readiness",
    "copy_notes",
    "main",
    "missing_artifacts",
    "missing_manifest_keys",
    "render_markdown",
    "write_report",
]


def render_markdown(result: dict[str, Any]) -> str:
    summary = result["summary"]
    lines = [
        "# GACT TUI 0.8.3 Readiness",
        "",
        "- scope: terminal operability, provider recovery, marketplace/source proof, and live runtime catalog proof",
        f"- deterministic readiness: `{summary['deterministic_ready']}/{summary['gate_count']}`",
        f"- live proof readiness: `{summary['live_ready']}/{summary['gate_count']}`",
        f"- release ready: `{str(result['live_ok']).lower()}`",
        "",
        "| Issue | Area | Deterministic | Live proof |",
        "| --- | --- | --- | --- |",
    ]
    for gate in result["gates"]:
        lines.append(
            f"| {gate.issue} | {gate.area} | {'yes' if gate.deterministic_ready else 'no'} | "
            f"{'yes' if gate.live_ready else 'no'} |"
        )
    lines.append("")

    for gate in result["gates"]:
        if gate.live_ready:
            continue
        lines.extend(
            [
                f"## Missing: {gate.issue} {gate.area}",
                f"- Required live proof: {gate.live_title}",
            ]
        )
        if gate.missing_artifacts:
            lines.append("- Missing or invalid artifacts:")
            lines.extend(f"  - `{artifact}`" for artifact in gate.missing_artifacts)
        if gate.missing_keys:
            lines.append("- Missing or false manifest keys:")
            lines.extend(f"  - `{key}`" for key in gate.missing_keys)
        if gate.notes:
            lines.append("- Notes:")
            lines.extend(f"  - {note}" for note in gate.notes)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if deterministic 0.8.3 proof is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless all 0.8.3 live proof is complete")
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
