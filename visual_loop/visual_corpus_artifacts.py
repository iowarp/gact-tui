"""Artifact index and deferred-capture helpers for the visual corpus gate."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MissingCapture:
    area: str
    missing_capture: str
    why_it_matters: str
    priority: str


ARTIFACT_INDEX_FILES: tuple[str, ...] = (
    "visual_loop/COVERAGE.md",
    "visual_loop/PRESERVED_CAPTURES.md",
    "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md",
)

TRACKED_ARTIFACT_INDEX_FILES: tuple[str, ...] = (
    "visual_loop/COVERAGE.md",
    "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md",
)

MISSING_CAPTURE_REPORT = "visual_loop/MISSING_CAPTURES.md"


ARTIFACT_EXTENSIONS: tuple[str, ...] = (
    ".tape",
    ".png",
    ".gif",
    ".jsonl",
    ".report.md",
    ".strict.report.md",
)

ISSUE_REFERENCE_RE = re.compile(r"(?:^|[^\w])#\d+(?:$|[^\w])")


def looks_like_visual_artifact(text: str) -> bool:
    return any(text.endswith(ext) for ext in ARTIFACT_EXTENSIONS)


def normalize_coverage_artifact(text: str) -> str | None:
    text = text.strip()
    if not looks_like_visual_artifact(text):
        return None
    if text.startswith("visual_loop/"):
        return text
    if "/" in text:
        return None
    if text.endswith(".tape"):
        return f"visual_loop/tapes/{text}"
    return f"visual_loop/screenshots/{text}"


def coverage_index_artifacts(path: Path) -> tuple[str, ...]:
    if not path.exists() or not path.is_file():
        return ()
    text = path.read_text(encoding="utf-8")
    artifacts: set[str] = set()
    for match in re.finditer(r"`([^`]+)`", text):
        for token in match.group(1).split(","):
            artifact = normalize_coverage_artifact(token)
            if artifact:
                artifacts.add(artifact)
    return tuple(sorted(artifacts))


def indexed_artifacts(root: Path) -> tuple[str, ...]:
    artifacts: set[str] = set()
    for rel in ARTIFACT_INDEX_FILES:
        artifacts.update(coverage_index_artifacts(root / rel))
    return tuple(sorted(artifacts))


def missing_capture_ledger(path: Path) -> tuple[MissingCapture, ...]:
    if not path.exists() or not path.is_file():
        return ()
    rows: list[MissingCapture] = []
    in_ledger = False
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped == "### Capture Ledger":
            in_ledger = True
            continue
        if in_ledger and stripped.startswith("### "):
            break
        if not in_ledger or not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) != 4:
            continue
        if cells[0] in {"Area", "---"} or set(cells[0]) == {"-"}:
            continue
        rows.append(
            MissingCapture(
                area=cells[0],
                missing_capture=cells[1],
                why_it_matters=cells[2],
                priority=cells[3],
            )
        )
    return tuple(rows)


def check_missing_capture_ledger(root: Path) -> dict[str, object]:
    rows = missing_capture_ledger(root / "visual_loop/COVERAGE.md")
    priorities: dict[str, int] = {}
    missing_issue_refs: list[dict[str, str]] = []
    for row in rows:
        priorities[row.priority] = priorities.get(row.priority, 0) + 1
        combined = " ".join((row.area, row.missing_capture, row.why_it_matters))
        if not ISSUE_REFERENCE_RE.search(combined):
            missing_issue_refs.append(
                {
                    "area": row.area,
                    "missing_capture": row.missing_capture,
                    "priority": row.priority,
                }
            )
    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    return {
        "ok": not missing_issue_refs,
        "path": "visual_loop/COVERAGE.md",
        "count": len(rows),
        "priorities": dict(
            sorted(
                priorities.items(),
                key=lambda item: (priority_order.get(item[0], 99), item[0]),
            )
        ),
        "rows": [
            {
                "area": row.area,
                "missing_capture": row.missing_capture,
                "why_it_matters": row.why_it_matters,
                "priority": row.priority,
            }
            for row in rows
        ],
        "missing_issue_refs": missing_issue_refs,
    }


def render_missing_capture_report(result: dict[str, object]) -> str:
    ledger = result.get("missing_capture_ledger", {})
    if not isinstance(ledger, dict):
        ledger = {}
    rows = ledger.get("rows", [])
    if not isinstance(rows, list):
        rows = []
    priorities = ledger.get("priorities", {})
    if not isinstance(priorities, dict):
        priorities = {}

    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    priority_items = sorted(
        priorities.items(),
        key=lambda item: (priority_order.get(str(item[0]), 99), str(item[0])),
    )
    lines = [
        "# Missing Visual Captures",
        "",
        "This is a generated operator backlog derived from `visual_loop/COVERAGE.md`.",
        "Keep the source ledger there authoritative, and regenerate this file after",
        "changing capture priorities or missing-state rows.",
        "",
        "## Summary",
        "",
        f"- source: `{ledger.get('path', 'visual_loop/COVERAGE.md')}`",
        f"- deferred captures: `{ledger.get('count', len(rows))}`",
        "- priorities: "
        + (
            ", ".join(f"{priority}={count}" for priority, count in priority_items)
            if priority_items
            else "none"
        ),
        "",
        "## Backlog",
        "",
    ]
    if not rows:
        lines.append("No deferred visual captures are currently listed.")
        return "\n".join(lines).rstrip() + "\n"

    sorted_rows = sorted(
        rows,
        key=lambda row: (
            priority_order.get(str(row.get("priority")), 99),
            str(row.get("area", "")),
            str(row.get("missing_capture", "")),
        ),
    )
    for row in sorted_rows:
        lines.extend(
            [
                f"### {row.get('priority')} - {row.get('area')}",
                "",
                f"- Missing capture: {row.get('missing_capture')}",
                f"- Why it matters: {row.get('why_it_matters')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def write_missing_capture_report(result: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_missing_capture_report(result), encoding="utf-8")


def check_missing_capture_report_sync(root: Path, result: dict[str, object]) -> dict[str, object]:
    path = root / MISSING_CAPTURE_REPORT
    if not path.exists():
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": "missing",
        }
    if not path.is_file():
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": "not a file",
        }
    expected = render_missing_capture_report(result)
    try:
        actual = path.read_text(encoding="utf-8")
    except OSError as exc:
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": f"read failed: {exc}",
        }
    return {
        "ok": actual == expected,
        "path": MISSING_CAPTURE_REPORT,
        "state": "current" if actual == expected else "stale",
    }
