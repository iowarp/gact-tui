"""Evidence model for TUI latency readiness checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from readiness_artifacts import PNG_SIGNATURE as PNG_SIGNATURE, artifact_status
from tui_latency_readiness_checks import (
    LATENCY_BUDGET_TOLERANCE,
    PTY_MOUSE_LATENCY_REPORT,
    PTY_MOUSE_SECTION_BASELINES_MS,
    float_value,
    int_value,
    load_json_object,
    load_manifest,
    pty_mouse_latency_budget_status,
)


@dataclass(frozen=True)
class Evidence:
    area: str
    title: str
    artifacts: tuple[str, ...]
    manifest: str | None = None
    required_manifest_keys: tuple[str, ...] = ()
    required_manifest_truthy: tuple[str, ...] = ()
    required_manifest_positive_ints: tuple[str, ...] = ()
    required_for_maintained: bool = True
    required_for_strict_live: bool = False


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
    "pty_mouse_latency_budget_status",
]


EVIDENCE: tuple[Evidence, ...] = (
    Evidence(
        area="Metrics modal",
        title="deterministic TUI latency section renders",
        artifacts=("visual_loop/screenshots/semantic_menu_metrics.png",),
    ),
    Evidence(
        area="Target semantics",
        title="click target semantics report",
        artifacts=("visual_loop/screenshots/tui_click_latency_target_semantics.report.md",),
    ),
    Evidence(
        area="PTY mouse",
        title="terminal mouse click/wheel latency proof",
        artifacts=(
            "visual_loop/screenshots/tui_mouse_latency_pty_manifest.json",
            "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
        ),
        manifest="visual_loop/screenshots/tui_mouse_latency_pty_manifest.json",
        required_manifest_keys=(
            "mouse_event_source",
            "tui_latency_report",
            "click_sections",
            "wheel_sections",
            "section_latency_summary",
            "click_targets",
            "click_target_labels",
            "wheel_rows",
        ),
        required_manifest_positive_ints=("sample_count", "surface_count", "click_section_count", "click_target_count"),
    ),
    Evidence(
        area="Copy latency",
        title="copy action latency is reported separately from navigation keys",
        artifacts=("visual_loop/screenshots/copy_latency_telemetry.report.md",),
    ),
    Evidence(
        area="Owned CLIO",
        title="partial owned-backend live latency capture",
        artifacts=(
            "visual_loop/screenshots/live_clio_tui_latency_metrics.png",
            "visual_loop/screenshots/live_clio_tui_latency_capture.gif",
            "visual_loop/screenshots/live_clio_tui_latency_manifest.json",
        ),
        manifest="visual_loop/screenshots/live_clio_tui_latency_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "metrics_screenshot",
            "recording_path",
            "tui_latency_section_expected",
        ),
        required_manifest_truthy=("captured_from_owned_backend", "tui_latency_section_expected"),
    ),
    Evidence(
        area="Active CLIO",
        title="active long live-stream latency capture",
        artifacts=(
            "visual_loop/screenshots/live_clio_tui_latency_metrics.png",
            "visual_loop/screenshots/live_clio_tui_latency_capture.gif",
            "visual_loop/screenshots/live_clio_tui_latency_manifest.json",
        ),
        manifest="visual_loop/screenshots/live_clio_tui_latency_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "session_id",
            "session_status",
            "active_stream_evidence",
            "active_stream_blockers",
            "backend_metrics_sample_count",
            "provider_streaming_limitation",
            "live_streaming_false",
        ),
        required_manifest_truthy=("captured_from_owned_backend", "active_stream_evidence"),
        required_manifest_positive_ints=(
            "session_message_count",
            "backend_metrics_sample_count",
            "tui_latency_sample_count",
        ),
        required_for_maintained=False,
        required_for_strict_live=True,
    ),
    Evidence(
        area="Active CLIO mouse",
        title="active live-stream click/wheel latency capture",
        artifacts=(
            "visual_loop/screenshots/live_clio_tui_mouse_latency_manifest.json",
            "visual_loop/screenshots/live_clio_tui_mouse_latency_report.json",
        ),
        manifest="visual_loop/screenshots/live_clio_tui_mouse_latency_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "session_id",
            "session_status",
            "active_stream_evidence",
            "active_stream_blockers",
            "backend_metrics_sample_count",
            "tui_latency_sample_count",
            "mouse_event_source",
            "click_sections",
            "wheel_sections",
            "section_latency_summary",
            "click_targets",
            "click_target_labels",
            "live_click_section_evidence",
            "provider_streaming_limitation",
            "live_streaming_false",
        ),
        required_manifest_truthy=(
            "captured_from_owned_backend",
            "active_stream_evidence",
            "live_click_section_evidence",
        ),
        required_manifest_positive_ints=(
            "session_message_count",
            "backend_metrics_sample_count",
            "tui_latency_sample_count",
            "click_section_count",
            "click_target_count",
        ),
        required_for_maintained=False,
        required_for_strict_live=True,
    ),
)

def evidence_status(root: Path, evidence: Evidence) -> dict[str, object]:
    artifacts = {rel: artifact_status(root, rel) for rel in evidence.artifacts}
    manifest_data, manifest = load_manifest(root, evidence.manifest)
    missing_keys = [key for key in evidence.required_manifest_keys if key not in manifest_data]
    false_keys = [key for key in evidence.required_manifest_truthy if manifest_data.get(key) is not True]
    non_positive = [key for key in evidence.required_manifest_positive_ints if int_value(manifest_data.get(key)) <= 0]
    active_blockers = manifest_data.get("active_stream_blockers")
    if not isinstance(active_blockers, list):
        active_blockers = []
    latency_budget = None
    if evidence.manifest == "visual_loop/screenshots/tui_mouse_latency_pty_manifest.json":
        latency_budget = pty_mouse_latency_budget_status(root)
    ok = (
        all(status["ok"] for status in artifacts.values())
        and bool(manifest["ok"])
        and not missing_keys
        and not false_keys
        and not non_positive
        and (latency_budget is None or bool(latency_budget["ok"]))
    )
    return {
        "area": evidence.area,
        "title": evidence.title,
        "required_for_maintained": evidence.required_for_maintained,
        "required_for_strict_live": evidence.required_for_strict_live,
        "artifacts": artifacts,
        "manifest": manifest,
        "missing_keys": missing_keys,
        "false_keys": false_keys,
        "non_positive": non_positive,
        "active_stream_blockers": active_blockers,
        "latency_budget": latency_budget,
        "ok": ok,
    }


def check_readiness(root: Path) -> dict[str, object]:
    items = [evidence_status(root, evidence) for evidence in EVIDENCE]
    maintained = [item for item in items if item["required_for_maintained"]]
    strict_live = [item for item in items if item["required_for_strict_live"]]
    return {
        "ok": all(item["ok"] for item in maintained),
        "strict_live_ok": all(item["ok"] for item in strict_live),
        "items": items,
        "summary": {
            "maintained_count": len(maintained),
            "maintained_ready": sum(1 for item in maintained if item["ok"]),
            "strict_live_count": len(strict_live),
            "strict_live_ready": sum(1 for item in strict_live if item["ok"]),
        },
    }
