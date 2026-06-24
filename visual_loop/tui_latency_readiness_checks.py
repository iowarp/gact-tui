"""JSON and latency-budget checks for TUI latency readiness."""

from __future__ import annotations

import json
from pathlib import Path

from readiness_artifacts import artifact_status

LATENCY_BUDGET_TOLERANCE = 1.25
PTY_MOUSE_LATENCY_REPORT = "visual_loop/screenshots/tui_mouse_latency_pty_report.json"
PTY_MOUSE_SECTION_BASELINES_MS: dict[str, float] = {
    "header": 4.772969,
    "conversation": 3.643146,
    "input": 3.116144,
    "left sidebar": 2.431315,
}


def load_manifest(root: Path, rel: str | None) -> tuple[dict[str, object], dict[str, object]]:
    if rel is None:
        return {}, {"ok": True, "state": "not required"}
    status = artifact_status(root, rel)
    if not status["ok"]:
        return {}, {"ok": False, "state": status["state"]}
    try:
        data = json.loads((root / rel).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, {"ok": False, "state": f"invalid json: {exc}"}
    if not isinstance(data, dict):
        return {}, {"ok": False, "state": "manifest is not an object"}
    return data, {"ok": True, "state": "present", "keys": sorted(data.keys())}


def load_json_object(root: Path, rel: str) -> tuple[dict[str, object], dict[str, object]]:
    status = artifact_status(root, rel)
    if not status["ok"]:
        return {}, {"ok": False, "state": status["state"]}
    try:
        data = json.loads((root / rel).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, {"ok": False, "state": f"invalid json: {exc}"}
    if not isinstance(data, dict):
        return {}, {"ok": False, "state": "json is not an object"}
    return data, {"ok": True, "state": "present", "keys": sorted(data.keys())}


def int_value(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return 0
    return 0


def float_value(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def pty_mouse_latency_budget_status(root: Path) -> dict[str, object]:
    report, report_status = load_json_object(root, PTY_MOUSE_LATENCY_REPORT)
    baselines = {
        surface: {
            "baseline_ms": baseline,
            "budget_ms": round(baseline * LATENCY_BUDGET_TOLERANCE, 6),
        }
        for surface, baseline in PTY_MOUSE_SECTION_BASELINES_MS.items()
    }
    status: dict[str, object] = {
        "ok": False,
        "report": PTY_MOUSE_LATENCY_REPORT,
        "report_status": report_status,
        "tolerance": LATENCY_BUDGET_TOLERANCE,
        "baselines": baselines,
        "observed": {},
        "missing_sections": [],
        "over_budget": [],
    }
    if not report_status["ok"]:
        return status

    sections = report.get("sections")
    if not isinstance(sections, list):
        status["report_status"] = {"ok": False, "state": "sections is not a list"}
        return status

    observed: dict[str, float] = {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        surface = section.get("surface")
        if not isinstance(surface, str):
            continue
        p95_ms = float_value(section.get("slowest_p95_ms"))
        if p95_ms is None:
            continue
        observed[surface] = p95_ms

    missing = [surface for surface in PTY_MOUSE_SECTION_BASELINES_MS if surface not in observed]
    failures: list[dict[str, object]] = []
    for surface, baseline in PTY_MOUSE_SECTION_BASELINES_MS.items():
        if surface not in observed:
            continue
        budget_ms = baseline * LATENCY_BUDGET_TOLERANCE
        actual_ms = observed[surface]
        if actual_ms > budget_ms:
            failures.append(
                {
                    "surface": surface,
                    "actual_ms": round(actual_ms, 6),
                    "budget_ms": round(budget_ms, 6),
                    "baseline_ms": baseline,
                }
            )

    status["observed"] = {surface: round(value, 6) for surface, value in observed.items()}
    status["missing_sections"] = missing
    status["over_budget"] = failures
    status["ok"] = not missing and not failures
    return status
