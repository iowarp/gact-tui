"""Evidence model for Agent Blueprint marketplace readiness checks."""

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
        area="Blueprint catalog",
        title="management, validation, install/update/delete, and active marker states",
        artifacts=(
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_install.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validate.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_delete_confirm.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_updated.png",
        ),
    ),
    Evidence(
        area="Blueprint sources",
        title="source hierarchy, add/remove, source install row, and source detail states",
        artifacts=(
            "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_registry.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_add_source.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_added.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_remove_confirm.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_install_row.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_installed.png",
        ),
    ),
    Evidence(
        area="Blueprint tree and failures",
        title="tree hierarchy, narrow layout, validation warnings, and lifecycle failures",
        artifacts=(
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_sources.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_validation_warning.png",
            "visual_loop/screenshots/semantic_agent_blueprint_validation_error.png",
            "visual_loop/screenshots/semantic_agent_blueprint_install_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_update_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_delete_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_source_refresh_failure.png",
        ),
    ),
)


LIVE_EVIDENCE = Evidence(
    area="Live marketplace source lifecycle",
    title="real source add/refresh/remove plus blueprint install/update/activation provenance",
    artifacts=(
        "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_sources.png",
        "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_installed.png",
        "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_activated.png",
        "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_lifecycle_manifest.json",
    ),
    required_for_demo=False,
    manifest="visual_loop/screenshots/live_clio_agent_blueprint_marketplace_lifecycle_manifest.json",
    required_manifest_keys=(
        "backend",
        "captured_from_owned_backend",
        "source_url",
        "source_add_success",
        "source_refresh_success",
        "source_remove_success",
        "blueprint_id",
        "blueprint_install_success",
        "blueprint_update_success",
        "blueprint_activation_success",
        "source_ref",
        "source_commit",
        "sources_screenshot",
        "installed_screenshot",
        "activated_screenshot",
    ),
    manifest_artifacts=(
        ("sources_screenshot", "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_sources.png"),
        ("installed_screenshot", "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_installed.png"),
        ("activated_screenshot", "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_activated.png"),
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
        "source_add_success",
        "source_refresh_success",
        "source_remove_success",
        "blueprint_install_success",
        "blueprint_update_success",
        "blueprint_activation_success",
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
