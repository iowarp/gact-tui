"""Evidence model for live lifecycle readiness checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from manifest_readiness import manifest_status as live_manifest_status
from readiness_artifacts import PNG_SIGNATURE as PNG_SIGNATURE, artifact_status
REQUIRED_TRUE_MANIFEST_KEYS = {
    "captured_from_owned_backend",
    "mutation_consent",
    "mcp_install_success",
    "mcp_remove_success",
    "source_refresh_success",
    "prompt_save_success",
    "expert_pack_install_success",
    "expert_pack_update_success",
    "expert_pack_delete_success",
}


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
        area="Runtime catalogs",
        title="deterministic tools/MCP catalog, details, disconnected, empty, and narrow states",
        artifacts=(
            "visual_loop/screenshots/semantic_tools_mcp_catalog.png",
            "visual_loop/screenshots/semantic_tools_mcp_tool_selected.png",
            "visual_loop/screenshots/semantic_tools_action_detail_catalog.png",
            "visual_loop/screenshots/semantic_tools_action_detail_builtin.png",
            "visual_loop/screenshots/semantic_tools_mcp_disconnected_catalog.png",
            "visual_loop/screenshots/semantic_tools_mcp_disconnected_selected.png",
            "visual_loop/screenshots/semantic_tools_mcp_reconnect_failure.png",
            "visual_loop/screenshots/semantic_tools_unavailable_tool.png",
            "visual_loop/screenshots/semantic_tools_empty.png",
            "visual_loop/screenshots/semantic_narrow_tools_mcp.png",
        ),
    ),
    Evidence(
        area="Prompts and expert packs",
        title="deterministic prompt and expert-pack catalog, edit, failure, empty, stress, and narrow states",
        artifacts=(
            "visual_loop/screenshots/semantic_prompt_catalog.png",
            "visual_loop/screenshots/semantic_prompt_detail.png",
            "visual_loop/screenshots/semantic_prompt_editor.png",
            "visual_loop/screenshots/semantic_prompt_empty.png",
            "visual_loop/screenshots/semantic_prompt_stress_catalog.png",
            "visual_loop/screenshots/semantic_prompt_stress_save_failure.png",
            "visual_loop/screenshots/semantic_expert_packs_catalog.png",
            "visual_loop/screenshots/semantic_expert_packs_detail.png",
            "visual_loop/screenshots/semantic_expert_packs_empty.png",
            "visual_loop/screenshots/semantic_expert_packs_stress_catalog.png",
            "visual_loop/screenshots/semantic_expert_packs_source_provenance.png",
            "visual_loop/screenshots/semantic_expert_packs_update_failure.png",
            "visual_loop/screenshots/semantic_expert_packs_delete_failure.png",
            "visual_loop/screenshots/semantic_expert_packs_install_failure.png",
            "visual_loop/screenshots/semantic_narrow_prompts.png",
            "visual_loop/screenshots/semantic_narrow_expert_packs.png",
        ),
    ),
)


LIVE_EVIDENCE: tuple[Evidence, ...] = (
    Evidence(
        area="Runtime catalogs",
        title="live owned-backend tools/MCP/source catalog breadth",
        artifacts=(
            "visual_loop/screenshots/live_clio_runtime_tools_catalog.png",
            "visual_loop/screenshots/live_clio_runtime_tools_detail.png",
            "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png",
            "visual_loop/screenshots/live_clio_runtime_mcp_detail.png",
            "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png",
            "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
        ),
        required_for_demo=False,
        manifest="visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "tools_catalog",
            "tools_detail",
            "mcp_catalog",
            "mcp_detail",
            "agent_blueprint_sources",
        ),
        manifest_artifacts=(
            ("tools_catalog", "visual_loop/screenshots/live_clio_runtime_tools_catalog.png"),
            ("tools_detail", "visual_loop/screenshots/live_clio_runtime_tools_detail.png"),
            ("mcp_catalog", "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png"),
            ("mcp_detail", "visual_loop/screenshots/live_clio_runtime_mcp_detail.png"),
            ("agent_blueprint_sources", "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png"),
        ),
    ),
    Evidence(
        area="Runtime registry lifecycle",
        title="real registry-backed MCP install/remove and source refresh lifecycle",
        artifacts=(
            "visual_loop/screenshots/live_clio_runtime_mcp_install_success.png",
            "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png",
            "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png",
            "visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
        ),
        required_for_demo=False,
        manifest="visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "mcp_install_success",
            "mcp_remove_success",
            "source_refresh_success",
            "mcp_install_screenshot",
            "mcp_remove_screenshot",
            "source_refresh_screenshot",
        ),
        manifest_artifacts=(
            ("mcp_install_screenshot", "visual_loop/screenshots/live_clio_runtime_mcp_install_success.png"),
            ("mcp_remove_screenshot", "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png"),
            ("source_refresh_screenshot", "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png"),
        ),
    ),
    Evidence(
        area="Prompts and expert packs",
        title="live owned-backend prompt save and expert-pack install/update/delete lifecycle",
        artifacts=(
            "visual_loop/screenshots/live_clio_prompt_catalog.png",
            "visual_loop/screenshots/live_clio_prompt_save_success.png",
            "visual_loop/screenshots/live_clio_expert_pack_catalog.png",
            "visual_loop/screenshots/live_clio_expert_pack_install_success.png",
            "visual_loop/screenshots/live_clio_expert_pack_update_success.png",
            "visual_loop/screenshots/live_clio_expert_pack_delete_success.png",
            "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
        ),
        required_for_demo=False,
        manifest="visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
        required_manifest_keys=(
            "backend",
            "captured_from_owned_backend",
            "mutation_consent",
            "expert_pack_source",
            "prompt_catalog",
            "prompt_save_success",
            "expert_pack_catalog",
            "expert_pack_install_success",
            "expert_pack_update_success",
            "expert_pack_delete_success",
            "prompt_save_screenshot",
            "expert_pack_install_screenshot",
            "expert_pack_update_screenshot",
            "expert_pack_delete_screenshot",
        ),
        manifest_artifacts=(
            ("prompt_catalog", "visual_loop/screenshots/live_clio_prompt_catalog.png"),
            ("prompt_save_screenshot", "visual_loop/screenshots/live_clio_prompt_save_success.png"),
            ("expert_pack_catalog", "visual_loop/screenshots/live_clio_expert_pack_catalog.png"),
            ("expert_pack_install_screenshot", "visual_loop/screenshots/live_clio_expert_pack_install_success.png"),
            ("expert_pack_update_screenshot", "visual_loop/screenshots/live_clio_expert_pack_update_success.png"),
            ("expert_pack_delete_screenshot", "visual_loop/screenshots/live_clio_expert_pack_delete_success.png"),
        ),
    ),
)


def manifest_value_ok(key: str, value: object) -> bool:
    if key in REQUIRED_TRUE_MANIFEST_KEYS:
        return value is True
    return bool(str(value).strip()) if value is not None else False


def manifest_status(root: Path, evidence: Evidence) -> dict[str, object]:
    return live_manifest_status(
        root,
        evidence.manifest,
        evidence.required_manifest_keys,
        evidence.manifest_artifacts,
        manifest_value_ok,
    )


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
    live = [evidence_status(root, evidence) for evidence in LIVE_EVIDENCE]
    return {
        "ok": all(item["ok"] for item in required),
        "live_ok": all(item["ok"] for item in live),
        "required": required,
        "live": live,
        "summary": {
            "required_count": len(required),
            "required_ready": sum(1 for item in required if item["ok"]),
            "live_count": len(live),
            "live_ready": sum(1 for item in live if item["ok"]),
        },
    }
