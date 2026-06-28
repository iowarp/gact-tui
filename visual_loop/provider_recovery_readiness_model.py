"""Evidence model for provider recovery readiness checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from manifest_readiness import manifest_status as live_manifest_status
from readiness_artifacts import PNG_SIGNATURE as PNG_SIGNATURE, artifact_status


@dataclass(frozen=True)
class Evidence:
    area: str
    title: str
    artifacts: tuple[str, ...]
    required_for_demo: bool = True
    manifest: str | None = None
    required_manifest_keys: tuple[str, ...] = ()
    manifest_artifacts: tuple[tuple[str, str], ...] = ()


DETERMINISTIC_EVIDENCE: tuple[Evidence, ...] = (
    Evidence(
        area="Provider setup",
        title="provider setup, auth-required, auth-failure, auth-success, and narrow layout",
        artifacts=(
            "visual_loop/screenshots/semantic_provider_setup.png",
            "visual_loop/screenshots/semantic_provider_setup_provider_changed.png",
            "visual_loop/screenshots/semantic_provider_edge_catalog.png",
            "visual_loop/screenshots/semantic_provider_edge_auth_required.png",
            "visual_loop/screenshots/semantic_provider_edge_auth_failure.png",
            "visual_loop/screenshots/semantic_provider_auth_success_before.png",
            "visual_loop/screenshots/semantic_provider_auth_success_after.png",
            "visual_loop/screenshots/semantic_narrow_provider_setup.png",
        ),
    ),
    Evidence(
        area="Provider failure and retry",
        title="operator-readable provider failure detail and retry override warning",
        artifacts=(
            "visual_loop/screenshots/semantic_provider_failure_inline.png",
            "visual_loop/screenshots/semantic_provider_failure_detail.png",
            "visual_loop/screenshots/issue57_retry_model_modal.png",
        ),
    ),
)


LIVE_EVIDENCE = Evidence(
    area="Live provider recovery",
    title="real owned-backend provider failure, retry warning, and recovered setup",
    artifacts=(
        "visual_loop/screenshots/live_clio_provider_failure_inline.png",
        "visual_loop/screenshots/live_clio_provider_failure_detail.png",
        "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
        "visual_loop/screenshots/live_clio_provider_recovery_conversation.png",
        "visual_loop/screenshots/live_clio_provider_recovery_setup.png",
        "visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
    ),
    required_for_demo=False,
    manifest="visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
    required_manifest_keys=(
        "backend",
        "captured_from_owned_backend",
        "failure_session_id",
        "recovery_session_id",
        "retry_model",
        "provider_failure_observed",
        "retry_override_warning_observed",
        "provider_recovery_observed",
        "provider_failure_inline",
        "provider_failure_detail",
        "retry_override_warning",
        "provider_recovery_conversation",
        "provider_recovery_setup",
    ),
    manifest_artifacts=(
        ("provider_failure_inline", "visual_loop/screenshots/live_clio_provider_failure_inline.png"),
        ("provider_failure_detail", "visual_loop/screenshots/live_clio_provider_failure_detail.png"),
        ("retry_override_warning", "visual_loop/screenshots/live_clio_provider_retry_override_warning.png"),
        ("provider_recovery_conversation", "visual_loop/screenshots/live_clio_provider_recovery_conversation.png"),
        ("provider_recovery_setup", "visual_loop/screenshots/live_clio_provider_recovery_setup.png"),
    ),
)


def manifest_status(root: Path, evidence: Evidence) -> dict[str, object]:
    return live_manifest_status(
        root,
        evidence.manifest,
        evidence.required_manifest_keys,
        evidence.manifest_artifacts,
        manifest_value_ok,
    )


def manifest_value_ok(key: str, value: object) -> bool:
    if key in {
        "captured_from_owned_backend",
        "provider_failure_observed",
        "retry_override_warning_observed",
        "provider_recovery_observed",
    }:
        return value is True
    return bool(str(value).strip()) if value is not None else False


def evidence_status(root: Path, evidence: Evidence) -> dict[str, object]:
    artifacts = {rel: artifact_status(root, rel) for rel in evidence.artifacts}
    manifest = manifest_status(root, evidence)
    return {
        "area": evidence.area,
        "title": evidence.title,
        "required_for_demo": evidence.required_for_demo,
        "artifacts": artifacts,
        "manifest": manifest,
        "ok": all(status["ok"] for status in artifacts.values()) and bool(manifest["ok"]),
    }


def check_readiness(root: Path) -> dict[str, Any]:
    required = [evidence_status(root, evidence) for evidence in DETERMINISTIC_EVIDENCE]
    live = evidence_status(root, LIVE_EVIDENCE)
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
