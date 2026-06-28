#!/usr/bin/env python3
"""Audit provider failure/recovery evidence for the GACT terminal UI.

Provider setup has broad deterministic coverage. The remaining #154 gap is a
real owned-backend ALCF-style workflow showing provider failure, recovery, and a
retry override warning. Keep those layers separate so synthetic provider edge
states are not mistaken for real recovery proof.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from provider_recovery_readiness_model import (
    DETERMINISTIC_EVIDENCE,
    LIVE_EVIDENCE,
    PNG_SIGNATURE,
    Evidence,
    artifact_status,
    check_readiness,
    evidence_status,
    manifest_status,
    manifest_value_ok,
)

__all__ = [
    "DETERMINISTIC_EVIDENCE",
    "LIVE_EVIDENCE",
    "PNG_SIGNATURE",
    "Evidence",
    "artifact_status",
    "check_readiness",
    "evidence_status",
    "main",
    "manifest_status",
    "manifest_value_ok",
    "render_markdown",
    "write_report",
]


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Provider Recovery Visual Readiness",
        "",
        f"- ready for maintained deterministic provider proof: `{str(result['ok']).lower()}`",
        f"- deterministic evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live provider evidence: `{result['summary']['live_ready']}/{result['summary']['live_count']}`",
        "",
        "| Area | Evidence | Required | Ready |",
        "| --- | --- | --- | --- |",
    ]
    for item in result["required"]:
        lines.append(f"| {item['area']} | {item['title']} | yes | {'yes' if item['ok'] else 'no'} |")
    live = result["live"]
    lines.append(f"| {live['area']} | {live['title']} | deferred | {'yes' if live['ok'] else 'no'} |")
    lines.append("")

    for item in [*result["required"], live]:
        if item["ok"]:
            continue
        lines.append(f"## Missing: {item['area']} - {item['title']}")
        missing = [(rel, status["state"]) for rel, status in item["artifacts"].items() if not status["ok"]]
        if missing:
            lines.append("- Missing or invalid artifacts:")
            for rel, state in missing:
                lines.append(f"  - `{rel}` ({state})")
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


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if maintained deterministic provider evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless real provider recovery evidence is complete")
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
