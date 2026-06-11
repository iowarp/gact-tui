#!/usr/bin/env python3
"""Audit diagnostics evidence for the GACT/CLIO operator UI.

This keeps deterministic modal proof, CLI diagnostic proof, and preserved live
runtime captures separate. A deterministic doctor screenshot is useful, but it
does not prove real CLIO health data under demo load.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Evidence:
    area: str
    title: str
    artifacts: tuple[str, ...]
    required_markers: tuple[str, ...] = ()
    required_for_demo: bool = True


EVIDENCE: tuple[Evidence, ...] = (
    Evidence(
        area="CLI diagnostics",
        title="clipboard and terminal-selection report",
        artifacts=("visual_loop/screenshots/gact_diag_clipboard_terminal.report.md",),
        required_markers=(
            "mouse_capture:",
            "clipboard_native:",
            "clipboard_missing:",
            "clipboard_osc52:",
            "terminal_selection:",
            "TERM=",
            "TERM_PROGRAM=",
        ),
    ),
    Evidence(
        area="Doctor",
        title="deterministic doctor health/capability/gaps modal proof",
        artifacts=(
            "visual_loop/screenshots/semantic_menu_doctor_health.png",
            "visual_loop/screenshots/semantic_menu_doctor_capabilities.png",
            "visual_loop/screenshots/semantic_doctor_gaps.png",
        ),
    ),
    Evidence(
        area="Metrics",
        title="deterministic metrics modal proof",
        artifacts=("visual_loop/screenshots/semantic_menu_metrics.png",),
    ),
    Evidence(
        area="Memory",
        title="preserved live CLIO/ALCF memory pressure proof",
        artifacts=(
            "visual_loop/screenshots/live_clio_memory_pressure.png",
            "visual_loop/screenshots/live_alcf_20260525_memory_inspector.png",
            "visual_loop/screenshots/live_alcf_20260525_memory_inspector_pagedown.png",
        ),
    ),
    Evidence(
        area="Doctor",
        title="real CLIO doctor partial-capability output",
        artifacts=(
            "visual_loop/screenshots/live_clio_doctor_partial_gaps.png",
            "visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        ),
        required_for_demo=False,
    ),
    Evidence(
        area="Metrics",
        title="live long-running benchmark metrics during active stream",
        artifacts=(
            "visual_loop/screenshots/live_clio_metrics_active_stream.png",
            "visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        ),
        required_for_demo=False,
    ),
)


def artifact_status(root: Path, rel: str) -> dict[str, object]:
    path = root / rel
    if not path.exists():
        return {"ok": False, "state": "missing"}
    if not path.is_file():
        return {"ok": False, "state": "not a file"}
    size = path.stat().st_size
    if size == 0:
        return {"ok": False, "state": "empty"}
    return {"ok": True, "state": "present", "bytes": size}


def evidence_status(root: Path, evidence: Evidence) -> dict[str, object]:
    artifacts = {rel: artifact_status(root, rel) for rel in evidence.artifacts}
    markers: dict[str, bool] = {}
    marker_ok = True
    if evidence.required_markers:
        text = "\n".join((root / rel).read_text(encoding="utf-8", errors="replace") for rel, status in artifacts.items() if status["ok"])
        markers = {marker: marker in text for marker in evidence.required_markers}
        marker_ok = all(markers.values())
    return {
        "area": evidence.area,
        "title": evidence.title,
        "required_for_demo": evidence.required_for_demo,
        "artifacts": artifacts,
        "markers": markers,
        "ok": all(status["ok"] for status in artifacts.values()) and marker_ok,
    }


def check_readiness(root: Path) -> dict[str, object]:
    items = [evidence_status(root, evidence) for evidence in EVIDENCE]
    required = [item for item in items if item["required_for_demo"]]
    deferred = [item for item in items if not item["required_for_demo"]]
    return {
        "ok": all(item["ok"] for item in required),
        "items": items,
        "summary": {
            "required_count": len(required),
            "required_ready": sum(1 for item in required if item["ok"]),
            "deferred_count": len(deferred),
            "deferred_ready": sum(1 for item in deferred if item["ok"]),
        },
    }


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
    args = parser.parse_args(argv)

    result = check_readiness(Path(args.root))
    if args.write_report:
        write_report(result, Path(args.write_report))
    print(render_markdown(result), end="")
    if args.strict and not result["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
