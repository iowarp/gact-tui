#!/usr/bin/env python3
"""Audit provider failure/recovery evidence for the GACT terminal UI.

Provider setup has broad deterministic coverage. The remaining #154 gap is a
real owned-backend ALCF-style workflow showing provider failure, recovery, and a
retry override warning. Keep those layers separate so synthetic provider edge
states are not mistaken for real recovery proof.
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
    return {
        "ok": not missing,
        "state": "present",
        "missing_keys": missing,
        "keys": sorted(data.keys()),
    }


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


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Provider Recovery Visual Readiness",
        "",
        f"- ready for maintained deterministic provider proof: `{str(result['ok']).lower()}`",
        f"- deterministic evidence: `{result['summary']['required_ready']}/{result['summary']['required_count']}`",
        f"- deferred live provider evidence: `{result['summary']['live_ready']}/{result['summary']['live_count']}`",
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
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if maintained deterministic provider evidence is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless real provider recovery evidence is complete")
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
