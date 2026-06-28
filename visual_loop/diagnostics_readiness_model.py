"""Evidence model for diagnostics readiness checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from manifest_readiness import manifest_status as live_manifest_status
from readiness_artifacts import PNG_SIGNATURE as PNG_SIGNATURE, artifact_status


@dataclass(frozen=True)
class Evidence:
    area: str
    title: str
    artifacts: tuple[str, ...]
    required_markers: tuple[str, ...] = ()
    required_for_demo: bool = True
    manifest: str | None = None
    required_manifest_keys: tuple[str, ...] = ()
    manifest_artifacts: tuple[tuple[str, str], ...] = ()


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
        manifest="visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "doctor_screenshot",
            "doctor_partial_gaps",
            "capabilities_gap_count",
            "health_status",
        ),
        manifest_artifacts=(
            ("doctor_screenshot", "visual_loop/screenshots/live_clio_doctor_partial_gaps.png"),
        ),
    ),
    Evidence(
        area="Metrics",
        title="live long-running benchmark metrics during active stream",
        artifacts=(
            "visual_loop/screenshots/live_clio_metrics_active_stream.png",
            "visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        ),
        required_for_demo=False,
        manifest="visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "session_id",
            "metrics_screenshot",
            "active_stream_metrics",
            "metrics_active_sessions",
            "metrics_sample_count",
        ),
        manifest_artifacts=(
            ("metrics_screenshot", "visual_loop/screenshots/live_clio_metrics_active_stream.png"),
        ),
    ),
)


def evidence_status(root: Path, evidence: Evidence) -> dict[str, object]:
    artifacts = {rel: artifact_status(root, rel) for rel in evidence.artifacts}
    manifest = manifest_status(root, evidence)
    markers: dict[str, bool] = {}
    marker_ok = True
    if evidence.required_markers:
        text = "\n".join(
            (root / rel).read_text(encoding="utf-8", errors="replace")
            for rel, status in artifacts.items()
            if status["ok"]
        )
        markers = {marker: marker in text for marker in evidence.required_markers}
        marker_ok = all(markers.values())
    return {
        "area": evidence.area,
        "title": evidence.title,
        "required_for_demo": evidence.required_for_demo,
        "artifacts": artifacts,
        "markers": markers,
        "manifest": manifest,
        "ok": all(status["ok"] for status in artifacts.values()) and marker_ok and bool(manifest["ok"]),
    }


def manifest_status(root: Path, evidence: Evidence) -> dict[str, object]:
    return live_manifest_status(
        root,
        evidence.manifest,
        evidence.required_manifest_keys,
        evidence.manifest_artifacts,
        manifest_value_ok,
    )


def manifest_value_ok(key: str, value: object) -> bool:
    if key in {"captured_from_owned_backend", "doctor_partial_gaps", "active_stream_metrics"}:
        return value is True
    if key.endswith("_count") or key in {"capabilities_gap_count", "metrics_active_sessions", "metrics_sample_count"}:
        return int_value(value) > 0
    return bool(str(value).strip()) if value is not None else False


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


def check_readiness(root: Path) -> dict[str, object]:
    items = [evidence_status(root, evidence) for evidence in EVIDENCE]
    required = [item for item in items if item["required_for_demo"]]
    deferred = [item for item in items if not item["required_for_demo"]]
    return {
        "ok": all(item["ok"] for item in required),
        "live_ok": all(item["ok"] for item in deferred),
        "items": items,
        "summary": {
            "required_count": len(required),
            "required_ready": sum(1 for item in required if item["ok"]),
            "deferred_count": len(deferred),
            "deferred_ready": sum(1 for item in deferred if item["ok"]),
        },
    }
