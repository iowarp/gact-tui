#!/usr/bin/env python3
"""Audit Agent Blueprint marketplace/source evidence for the GACT TUI.

The deterministic corpus covers blueprint browsing, source hierarchy, tree
layout, validation, and failure states. Issues #128/#143 still require real
marketplace-source lifecycle proof against current CLIO registry semantics.
This checker keeps those two layers separate.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


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
    status = artifact_status(root, evidence.manifest)
    if not status["ok"]:
        return {"ok": False, "state": status["state"], "missing_keys": list(evidence.required_manifest_keys)}
    path = root / evidence.manifest
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"ok": False, "state": f"invalid json: {exc}", "missing_keys": list(evidence.required_manifest_keys)}
    if not isinstance(data, dict):
        return {"ok": False, "state": "manifest is not an object", "missing_keys": list(evidence.required_manifest_keys)}
    missing = [key for key in evidence.required_manifest_keys if not manifest_value_ok(key, data.get(key))]
    invalid_artifacts = [
        {
            "key": key,
            "expected": expected,
            "actual": str(data.get(key, "")).strip(),
        }
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


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Agent Blueprint Marketplace Readiness",
        "",
        f"- ready for maintained deterministic blueprint proof: `{str(result['ok']).lower()}`",
        f"- deterministic evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live marketplace evidence: `{result['summary']['live_ready']}/{result['summary']['live_count']}`",
        "",
        "| Area | Evidence | Required | Ready |",
        "| --- | --- | --- | --- |",
    ]
    for item in result["required"]:
        lines.append(f"| {item['area']} | {item['title']} | yes | {'yes' if item['ok'] else 'no'} |")
    live = result["live"]
    lines.append(f"| {live['area']} | {live['title']} | deferred | {'yes' if live['ok'] else 'no'} |")
    lines.append("")

    for item in [*result["required"], live]:
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
                    lines.append(
                        f"  - `{item['key']}` expected `{item['expected']}` got `{item['actual']}`"
                    )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if deterministic blueprint evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless real marketplace lifecycle evidence is complete")
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
