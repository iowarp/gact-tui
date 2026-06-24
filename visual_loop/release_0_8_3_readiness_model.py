"""Readiness model for the focused GACT TUI 0.8.3 release gate."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import check_agent_blueprint_marketplace_readiness
import check_copy_selection_readiness
import check_live_lifecycle_readiness
import check_provider_recovery_readiness


@dataclass(frozen=True)
class Gate:
    issue: str
    area: str
    deterministic_ready: bool
    live_ready: bool
    live_title: str
    missing_artifacts: tuple[str, ...]
    missing_keys: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()


def missing_artifacts(item: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        f"{rel} ({status['state']})"
        for rel, status in item.get("artifacts", {}).items()
        if not status.get("ok")
    )


def missing_manifest_keys(item: dict[str, Any]) -> tuple[str, ...]:
    manifest = item.get("manifest")
    if not isinstance(manifest, dict) or manifest.get("ok"):
        return ()
    return tuple(str(key) for key in manifest.get("missing_keys", ()))


def copy_notes(live: dict[str, Any]) -> tuple[str, ...]:
    notes: list[str] = []
    if live.get("forced_noninteractive"):
        notes.append("live terminal report was forced/noninteractive")
    if not live.get("live_mode"):
        notes.append("missing live-terminal capture mode")
    checklist = live.get("checklist", {})
    if isinstance(checklist, dict):
        incomplete = [
            str(entry.get("label", item_id))
            for item_id, entry in checklist.items()
            if isinstance(entry, dict) and not entry.get("ok")
        ]
        if incomplete:
            notes.append("incomplete checklist: " + ", ".join(incomplete))
    return tuple(notes)


def check_readiness(root: Path) -> dict[str, Any]:
    copy_result = check_copy_selection_readiness.check_readiness(root)
    provider_result = check_provider_recovery_readiness.check_readiness(root)
    marketplace_result = check_agent_blueprint_marketplace_readiness.check_readiness(root)
    lifecycle_result = check_live_lifecycle_readiness.check_readiness(root)

    copy_live = copy_result["live"]
    provider_live = provider_result["live"]
    marketplace_live = marketplace_result["live"]
    lifecycle_live = lifecycle_result["live"]
    runtime_catalog_live = lifecycle_live[0]
    runtime_registry_live = lifecycle_live[1]

    gates = (
        Gate(
            issue="#150",
            area="Terminal copy/selection",
            deterministic_ready=bool(copy_result["ok"]),
            live_ready=bool(copy_result["live_ok"]),
            live_title=str(copy_live["title"]),
            missing_artifacts=missing_artifacts(copy_live),
            notes=copy_notes(copy_live),
        ),
        Gate(
            issue="#154",
            area="Provider failure/recovery",
            deterministic_ready=bool(provider_result["ok"]),
            live_ready=bool(provider_result["live_ok"]),
            live_title=str(provider_live["title"]),
            missing_artifacts=missing_artifacts(provider_live),
            missing_keys=missing_manifest_keys(provider_live),
        ),
        Gate(
            issue="#143",
            area="Agent Blueprint marketplace",
            deterministic_ready=bool(marketplace_result["ok"]),
            live_ready=bool(marketplace_result["live_ok"]),
            live_title=str(marketplace_live["title"]),
            missing_artifacts=missing_artifacts(marketplace_live),
            missing_keys=missing_manifest_keys(marketplace_live),
        ),
        Gate(
            issue="#152",
            area="Runtime catalog breadth",
            deterministic_ready=bool(lifecycle_result["ok"]),
            live_ready=bool(runtime_catalog_live["ok"]),
            live_title=str(runtime_catalog_live["title"]),
            missing_artifacts=missing_artifacts(runtime_catalog_live),
            missing_keys=missing_manifest_keys(runtime_catalog_live),
        ),
        Gate(
            issue="#152",
            area="Runtime registry lifecycle",
            deterministic_ready=bool(lifecycle_result["ok"]),
            live_ready=bool(runtime_registry_live["ok"]),
            live_title=str(runtime_registry_live["title"]),
            missing_artifacts=missing_artifacts(runtime_registry_live),
            missing_keys=missing_manifest_keys(runtime_registry_live),
        ),
    )

    return {
        "ok": all(gate.deterministic_ready for gate in gates),
        "live_ok": all(gate.live_ready for gate in gates),
        "gates": gates,
        "summary": {
            "gate_count": len(gates),
            "deterministic_ready": sum(1 for gate in gates if gate.deterministic_ready),
            "live_ready": sum(1 for gate in gates if gate.live_ready),
        },
    }
