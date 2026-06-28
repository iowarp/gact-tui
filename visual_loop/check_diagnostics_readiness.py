#!/usr/bin/env python3
"""Audit diagnostics evidence for the GACT/CLIO operator UI.

This keeps deterministic modal proof, CLI diagnostic proof, and preserved live
runtime captures separate. A deterministic doctor screenshot is useful, but it
does not prove real CLIO health data under demo load.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from diagnostics_readiness_model import (
    EVIDENCE,
    PNG_SIGNATURE,
    Evidence,
    artifact_status,
    check_readiness,
    evidence_status,
    int_value,
    manifest_status,
    manifest_value_ok,
)

__all__ = [
    "EVIDENCE",
    "PNG_SIGNATURE",
    "Evidence",
    "artifact_status",
    "check_readiness",
    "evidence_status",
    "int_value",
    "main",
    "manifest_status",
    "manifest_value_ok",
    "render_markdown",
    "write_report",
]


def render_markdown(result: dict[str, object]) -> str:
    lines = [
        "# Diagnostics Visual Readiness",
        "",
        f"- ready for maintained diagnostics proof: `{str(result['ok']).lower()}`",
        f"- required evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live evidence: `{result['summary']['deferred_ready']}/{result['summary']['deferred_count']}`",
        "",
        "| Area | Evidence | Required | Ready |",
        "| --- | --- | --- | --- |",
    ]
    for item in result["items"]:
        lines.append(
            "| {area} | {title} | {required} | {ready} |".format(
                area=item["area"],
                title=item["title"],
                required="yes" if item["required_for_demo"] else "deferred",
                ready="yes" if item["ok"] else "no",
            )
        )
    lines.append("")
    for item in result["items"]:
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
        manifest = item["manifest"]
        if not manifest["ok"]:
            lines.append(f"- Manifest status: `{manifest['state']}`")
            missing_keys = manifest.get("missing_keys", [])
            if missing_keys:
                lines.append("- Missing or false manifest keys:")
                for key in missing_keys:
                    lines.append(f"  - `{key}`")
            invalid_artifacts = manifest.get("invalid_artifacts", [])
            if invalid_artifacts:
                lines.append("- Invalid manifest artifact references:")
                for item in invalid_artifacts:
                    lines.append(
                        f"  - `{item['key']}` expected `{item['expected']}` got `{item['actual']}`"
                    )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, object], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if required diagnostics evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless deferred live diagnostics proof is complete")
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
