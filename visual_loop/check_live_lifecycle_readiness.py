#!/usr/bin/env python3
"""Audit live lifecycle evidence for runtime catalogs and prompt/expert packs.

The deterministic visual corpus proves the TUI layout and failure states. The
release/demo gaps in #152 and #153 require real owned-backend captures, so this
checker keeps deterministic coverage separate from live catalog breadth and
live install/update/delete success evidence.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
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
        ),
        manifest_artifacts=(
            ("prompt_catalog", "visual_loop/screenshots/live_clio_prompt_catalog.png"),
            ("expert_pack_catalog", "visual_loop/screenshots/live_clio_expert_pack_catalog.png"),
        ),
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
    if path.suffix.lower() == ".png":
        with path.open("rb") as handle:
            header = handle.read(8)
        if not header.startswith(PNG_SIGNATURE):
            return {"ok": False, "state": "invalid png"}
    return {"ok": True, "state": "present", "bytes": size}


def manifest_status(root: Path, evidence: Evidence) -> dict[str, object]:
    if evidence.manifest is None:
        return {"ok": True, "state": "not required", "missing_keys": []}
    path = root / evidence.manifest
    status = artifact_status(root, evidence.manifest)
    if not status["ok"]:
        return {"ok": False, "state": status["state"], "missing_keys": list(evidence.required_manifest_keys)}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"ok": False, "state": f"invalid json: {exc}", "missing_keys": list(evidence.required_manifest_keys)}
    if not isinstance(data, dict):
        return {"ok": False, "state": "manifest is not an object", "missing_keys": list(evidence.required_manifest_keys)}
    missing = [key for key in evidence.required_manifest_keys if not manifest_value_ok(key, data.get(key))]
    invalid_artifacts = [
        {"key": key, "expected": expected, "actual": str(data.get(key, "")).strip()}
        for key, expected in evidence.manifest_artifacts
        if key not in missing and str(data.get(key, "")).strip() != expected
    ]
    return {
        "ok": not missing and not invalid_artifacts,
        "state": "present",
        "missing_keys": missing,
        "invalid_artifacts": invalid_artifacts,
        "keys": sorted(data.keys()),
    }


def manifest_value_ok(key: str, value: object) -> bool:
    if key in REQUIRED_TRUE_MANIFEST_KEYS:
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


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Live Lifecycle Visual Readiness",
        "",
        f"- ready for maintained deterministic lifecycle proof: `{str(result['ok']).lower()}`",
        f"- deterministic evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live lifecycle evidence: `{result['summary']['live_ready']}/{result['summary']['live_count']}`",
        "",
        "| Area | Evidence | Required | Ready |",
        "| --- | --- | --- | --- |",
    ]
    for item in result["required"]:
        lines.append(f"| {item['area']} | {item['title']} | yes | {'yes' if item['ok'] else 'no'} |")
    for item in result["live"]:
        lines.append(f"| {item['area']} | {item['title']} | deferred | {'yes' if item['ok'] else 'no'} |")
    lines.append("")

    for item in [*result["required"], *result["live"]]:
        if item["ok"]:
            continue
        lines.append(f"## Missing: {item['area']} - {item['title']}")
        missing = [(rel, status["state"]) for rel, status in item["artifacts"].items() if not status["ok"]]
        if missing:
            lines.append("- Missing or invalid artifacts:")
            for rel, state in missing:
                lines.append(f"  - `{rel}` ({state})")
        manifest = item["manifest"]
        if not manifest["ok"]:
            lines.append(f"- Manifest status: `{manifest['state']}`")
            missing_keys = manifest.get("missing_keys", [])
            if missing_keys:
                lines.append("- Missing or false manifest keys:")
                for key in missing_keys:
                    lines.append(f"  - `{key}`")
            invalid_artifacts = manifest.get("invalid_artifacts", [])
            if invalid_artifacts:
                lines.append("- Invalid manifest artifact references:")
                for item in invalid_artifacts:
                    lines.append(f"  - `{item['key']}` expected `{item['expected']}` got `{item['actual']}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if maintained deterministic lifecycle evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless all live lifecycle evidence is complete")
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
