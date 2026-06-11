#!/usr/bin/env python3
"""Audit copy/selection evidence for the GACT terminal UI.

Deterministic screenshots prove the TUI affordances and fallback text. They do
not prove real terminal selection behavior because mouse capture, native
selection, and clipboard backends depend on the terminal emulator. Keep those
layers separate so #150 cannot be closed from fixture evidence alone.
"""

from __future__ import annotations

import argparse
import re
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


DETERMINISTIC_EVIDENCE: tuple[Evidence, ...] = (
    Evidence(
        area="Copy UI",
        title="detail, block, drag-copy, native-selection, and failure affordances",
        artifacts=(
            "visual_loop/screenshots/semantic_detail_copy.png",
            "visual_loop/screenshots/semantic_detail_drag_copy_highlight.png",
            "visual_loop/screenshots/semantic_detail_drag_copy_done.png",
            "visual_loop/screenshots/semantic_mouse_drag_copy_highlight.png",
            "visual_loop/screenshots/semantic_mouse_drag_copy_done.png",
            "visual_loop/screenshots/semantic_mouse_drag_copy_failure_done.png",
            "visual_loop/screenshots/semantic_mouse_native_selection_on.png",
            "visual_loop/screenshots/semantic_mouse_native_selection_off.png",
            "visual_loop/screenshots/semantic_native_selection_detail_on.png",
            "visual_loop/screenshots/semantic_native_selection_detail_off.png",
            "visual_loop/screenshots/semantic_native_selection_modal_on.png",
            "visual_loop/screenshots/semantic_native_selection_modal_off.png",
            "visual_loop/screenshots/semantic_copy_affordance.png",
            "visual_loop/screenshots/semantic_conversation_block_copy.png",
            "visual_loop/screenshots/semantic_help_conversation_copy.png",
        ),
    ),
    Evidence(
        area="Copy diagnostics",
        title="maintained clipboard and terminal-selection diagnostics",
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
)

LIVE_EVIDENCE = Evidence(
    area="Live terminal",
    title="real terminal copy/selection permutation checklist",
    artifacts=("visual_loop/screenshots/live_terminal_copy_env.report.md",),
    required_markers=(
        "capture_mode: live-terminal",
        "TERM:",
        "TERM_PROGRAM:",
        "clipboard_native:",
        "clipboard_missing:",
        "clipboard_osc52:",
        "terminal_selection:",
        "Manual Copy/Selection Checklist",
    ),
    required_for_demo=False,
)

CHECKLIST_ITEMS: tuple[tuple[str, str, bool], ...] = (
    ("drag_copy_mouse_capture", "CLIO drag-copy mode with mouse capture enabled", False),
    ("native_selection_mouse_disabled", "Native terminal text selection works with mouse capture disabled", False),
    ("alt_drag_selection", "Alt-drag terminal selection works while mouse capture is enabled", True),
    ("detail_modal_copy", "Detail-modal copy by key/button copies only the detail payload", False),
    ("conversation_block_copy", "Selected conversation block copy copies only the selected block", False),
    ("clipboard_failure_diagnostics", "Clipboard failure path shows actionable diagnostics", False),
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


def evidence_text(root: Path, artifacts: dict[str, dict[str, object]]) -> str:
    chunks: list[str] = []
    for rel, status in artifacts.items():
        if status["ok"]:
            chunks.append((root / rel).read_text(encoding="utf-8", errors="replace"))
    return "\n".join(chunks)


def evidence_status(root: Path, evidence: Evidence) -> dict[str, object]:
    artifacts = {rel: artifact_status(root, rel) for rel in evidence.artifacts}
    markers: dict[str, bool] = {}
    marker_ok = True
    if evidence.required_markers:
        text = evidence_text(root, artifacts)
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


def checklist_status(text: str) -> dict[str, dict[str, object]]:
    results: dict[str, dict[str, object]] = {}
    lines = text.splitlines()
    for item_id, label, allow_na in CHECKLIST_ITEMS:
        matching = [line.strip() for line in lines if label in line]
        if not matching:
            results[item_id] = {"ok": False, "state": "missing", "label": label}
            continue
        line = matching[0]
        checked = re.search(r"\[[xX]\]", line) is not None
        marked_na = allow_na and re.search(r"\[(?:n/a|N/A|na|NA)\]", line) is not None
        results[item_id] = {
            "ok": checked or marked_na,
            "state": "checked" if checked else "not-applicable" if marked_na else "unchecked",
            "label": label,
            "line": line,
        }
    return results


def live_status(root: Path) -> dict[str, object]:
    status = evidence_status(root, LIVE_EVIDENCE)
    text = evidence_text(root, status["artifacts"])
    checklist = checklist_status(text)
    forced = "capture_mode: forced-noninteractive" in text
    live_mode = "capture_mode: live-terminal" in text and not forced
    checklist_ok = all(item["ok"] for item in checklist.values())
    status["checklist"] = checklist
    status["live_mode"] = live_mode
    status["forced_noninteractive"] = forced
    status["ok"] = bool(status["ok"] and live_mode and checklist_ok)
    return status


def check_readiness(root: Path) -> dict[str, object]:
    required = [evidence_status(root, evidence) for evidence in DETERMINISTIC_EVIDENCE]
    live = live_status(root)
    return {
        "ok": all(item["ok"] for item in required),
        "live_ok": bool(live["ok"]),
        "required": required,
        "live": live,
        "summary": {
            "required_count": len(required),
            "required_ready": sum(1 for item in required if item["ok"]),
            "live_count": 1,
            "live_ready": 1 if live["ok"] else 0,
        },
    }


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
