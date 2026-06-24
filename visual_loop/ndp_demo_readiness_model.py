"""Readiness model for four-case NDP demo visual evidence."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from ndp_demo_manifest_contract import (
    REQUIRED_MANIFEST_FIELDS,
    bool_field,
    int_value,
    manifest_status,
)


DEFAULT_REPORT = Path("/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/ndp_demo_four_cases.md")


@dataclass(frozen=True)
class DemoCase:
    case_id: str
    title: str
    artifact_name: str
    report_markers: tuple[str, ...]
    real_capture_stem: str
    deterministic_artifacts: tuple[str, ...]


CASES: tuple[DemoCase, ...] = (
    DemoCase(
        case_id="san_diego_earthscope",
        title="San Diego / EarthScope seismic waveform review",
        artifact_name="sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
        report_markers=("San Diego", "EarthScope", "BHZ"),
        real_capture_stem="ndp_tui_real_san_diego_earthscope",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_earthscope_tool_summary.tape",
            "visual_loop/screenshots/semantic_earthscope_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="california_wildfire",
        title="California current wildfire features",
        artifact_name="current_wildfires_ca.json",
        report_markers=("current wildfire", "California", "ArcGIS"),
        real_capture_stem="ndp_tui_real_wildfire",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_ndp_feature_tool_summary.tape",
            "visual_loop/screenshots/semantic_ndp_feature_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="california_nws_warnings",
        title="California NWS warnings",
        artifact_name="california_nws_warnings.json",
        report_markers=("California NWS", "warning", "ISO"),
        real_capture_stem="ndp_tui_real_california_nws_warnings",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_nws_warnings_tool_summary.tape",
            "visual_loop/screenshots/semantic_nws_warnings_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="fresno_cimis_weather",
        title="Fresno CIMIS weather profile and visualization",
        artifact_name="cimis_fresno_weather.png",
        report_markers=("CIMIS", "Fresno", "weather"),
        real_capture_stem="ndp_tui_real_fresno_cimis",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_cimis_weather_tool_summary.tape",
            "visual_loop/screenshots/semantic_cimis_weather_tool_plot_summary.png",
        ),
    ),
)


REAL_STILL_CAPTURE_SUFFIXES: tuple[str, ...] = ("prompt.png", "early.png", "live.png")
REAL_RECORDING_SUFFIX = "short.gif"
REAL_CAPTURE_SUFFIXES: tuple[str, ...] = (*REAL_STILL_CAPTURE_SUFFIXES, REAL_RECORDING_SUFFIX)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
GIF_SIGNATURES = (b"GIF87a", b"GIF89a")

__all__ = [
    "CASES",
    "DEFAULT_REPORT",
    "GIF_SIGNATURES",
    "PNG_SIGNATURE",
    "REAL_CAPTURE_SUFFIXES",
    "REAL_RECORDING_SUFFIX",
    "REAL_STILL_CAPTURE_SUFFIXES",
    "REQUIRED_MANIFEST_FIELDS",
    "DemoCase",
    "artifact_ok_pattern",
    "bool_field",
    "case_status",
    "check_readiness",
    "existing_paths",
    "int_value",
    "real_capture_artifact_status",
    "real_capture_artifact_statuses",
    "real_capture_manifest_path",
    "real_capture_manifest_status",
    "real_capture_paths",
    "real_recording_path",
    "real_still_capture_paths",
    "report_case_evidence",
]


def artifact_ok_pattern(artifact_name: str) -> re.Pattern[str]:
    return re.compile(re.escape(artifact_name) + r"[^\n]*\(ok,", re.IGNORECASE)


def report_case_evidence(case: DemoCase, report_text: str) -> dict[str, object]:
    markers = {marker: marker.lower() in report_text.lower() for marker in case.report_markers}
    artifact_mentioned = case.artifact_name.lower() in report_text.lower()
    artifact_ok = bool(artifact_ok_pattern(case.artifact_name).search(report_text))
    return {
        "report_markers": markers,
        "report_mentions_artifact": artifact_mentioned,
        "report_artifact_ok": artifact_ok,
        "ok": all(markers.values()) and artifact_mentioned and artifact_ok,
    }


def existing_paths(root: Path, rels: tuple[str, ...]) -> dict[str, bool]:
    return {rel: (root / rel).exists() for rel in rels}


def real_capture_artifact_status(root: Path, rel: str) -> dict[str, object]:
    path = root / rel
    if not path.exists():
        return {"ok": False, "state": "missing"}
    if not path.is_file():
        return {"ok": False, "state": "not a file"}
    size = path.stat().st_size
    if size == 0:
        return {"ok": False, "state": "empty"}
    suffix = path.suffix.lower()
    with path.open("rb") as fh:
        header = fh.read(8)
    if suffix == ".png" and not header.startswith(PNG_SIGNATURE):
        return {"ok": False, "state": "invalid png"}
    if suffix == ".gif" and not any(header.startswith(sig) for sig in GIF_SIGNATURES):
        return {"ok": False, "state": "invalid gif"}
    return {"ok": True, "state": "present", "bytes": size}


def real_capture_artifact_statuses(root: Path, rels: tuple[str, ...]) -> dict[str, dict[str, object]]:
    return {rel: real_capture_artifact_status(root, rel) for rel in rels}


def real_capture_paths(case: DemoCase) -> tuple[str, ...]:
    return tuple(f"visual_loop/screenshots/{case.real_capture_stem}_{suffix}" for suffix in REAL_CAPTURE_SUFFIXES)


def real_still_capture_paths(case: DemoCase) -> tuple[str, ...]:
    return tuple(
        f"visual_loop/screenshots/{case.real_capture_stem}_{suffix}"
        for suffix in REAL_STILL_CAPTURE_SUFFIXES
    )


def real_recording_path(case: DemoCase) -> str:
    return f"visual_loop/screenshots/{case.real_capture_stem}_{REAL_RECORDING_SUFFIX}"


def real_capture_manifest_path(case: DemoCase) -> str:
    return f"visual_loop/screenshots/{case.real_capture_stem}_manifest.json"


def real_capture_manifest_status(root: Path, case: DemoCase) -> dict[str, object]:
    rel = real_capture_manifest_path(case)
    return manifest_status(
        root,
        rel,
        case_id=case.case_id,
        artifact_name=case.artifact_name,
        recording_path=real_recording_path(case),
        still_capture_paths=real_still_capture_paths(case),
    )


def case_status(root: Path, report_text: str, case: DemoCase) -> dict[str, object]:
    report = report_case_evidence(case, report_text)
    deterministic = existing_paths(root, case.deterministic_artifacts)
    real_captures = real_capture_artifact_statuses(root, real_capture_paths(case))
    manifest = real_capture_manifest_status(root, case)
    still_visual_ok = all(real_captures[rel]["ok"] for rel in real_still_capture_paths(case))
    short_recording_ok = bool(real_captures[real_recording_path(case)]["ok"])
    streaming_ok = short_recording_ok and bool(manifest["ok"])
    return {
        "id": case.case_id,
        "title": case.title,
        "artifact": case.artifact_name,
        "clio_report": report,
        "deterministic_tui": {
            "artifacts": deterministic,
            "ok": all(deterministic.values()),
        },
        "real_tui_recording": {
            "artifacts": real_captures,
            "manifest": manifest,
            "visual_ok": still_visual_ok,
            "still_visual_ok": still_visual_ok,
            "short_recording_ok": short_recording_ok,
            "streaming_ok": streaming_ok,
            "ok": streaming_ok,
        },
        "ready_for_real_demo": bool(report["ok"]) and streaming_ok,
    }


def check_readiness(root: Path, report_path: Path = DEFAULT_REPORT) -> dict[str, object]:
    report_exists = report_path.exists()
    report_text = report_path.read_text(encoding="utf-8") if report_exists else ""
    cases = [case_status(root, report_text, case) for case in CASES]
    return {
        "ok": all(case["ready_for_real_demo"] for case in cases),
        "report": {
            "path": str(report_path),
            "exists": report_exists,
        },
        "cases": cases,
        "summary": {
            "case_count": len(cases),
            "clio_report_ready": sum(1 for case in cases if case["clio_report"]["ok"]),
            "deterministic_tui_ready": sum(1 for case in cases if case["deterministic_tui"]["ok"]),
            "real_tui_stills": sum(1 for case in cases if case["real_tui_recording"]["still_visual_ok"]),
            "short_recordings": sum(1 for case in cases if case["real_tui_recording"]["short_recording_ok"]),
            "streaming_proof_ready": sum(1 for case in cases if case["real_tui_recording"]["streaming_ok"]),
            "real_tui_ready": sum(1 for case in cases if case["real_tui_recording"]["streaming_ok"]),
            "ready_for_real_demo": sum(1 for case in cases if case["ready_for_real_demo"]),
        },
    }
