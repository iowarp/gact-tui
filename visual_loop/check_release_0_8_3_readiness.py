#!/usr/bin/env python3
"""Audit the focused GACT TUI 0.8.3 release proof.

0.8.2 shipped the deterministic catalog/tree UX work. The next release lane is
terminal and owned-backend operability proof: real terminal copy/selection,
real provider recovery, live marketplace-source lifecycle, and live runtime
catalog/lifecycle breadth. Keep this gate separate from broader 0.9 CLIO-blocked
items such as prompt/expert-pack mutation endpoints.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

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


def _missing_artifacts(item: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        f"{rel} ({status['state']})"
        for rel, status in item.get("artifacts", {}).items()
        if not status.get("ok")
    )


def _missing_manifest_keys(item: dict[str, Any]) -> tuple[str, ...]:
    manifest = item.get("manifest")
    if not isinstance(manifest, dict) or manifest.get("ok"):
        return ()
    return tuple(str(key) for key in manifest.get("missing_keys", ()))


def _copy_notes(live: dict[str, Any]) -> tuple[str, ...]:
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
            missing_artifacts=_missing_artifacts(copy_live),
            notes=_copy_notes(copy_live),
        ),
        Gate(
            issue="#154",
            area="Provider failure/recovery",
            deterministic_ready=bool(provider_result["ok"]),
            live_ready=bool(provider_result["live_ok"]),
            live_title=str(provider_live["title"]),
            missing_artifacts=_missing_artifacts(provider_live),
            missing_keys=_missing_manifest_keys(provider_live),
        ),
        Gate(
            issue="#143",
            area="Agent Blueprint marketplace",
            deterministic_ready=bool(marketplace_result["ok"]),
            live_ready=bool(marketplace_result["live_ok"]),
            live_title=str(marketplace_live["title"]),
            missing_artifacts=_missing_artifacts(marketplace_live),
            missing_keys=_missing_manifest_keys(marketplace_live),
        ),
        Gate(
            issue="#152",
            area="Runtime catalog breadth",
            deterministic_ready=bool(lifecycle_result["ok"]),
            live_ready=bool(runtime_catalog_live["ok"]),
            live_title=str(runtime_catalog_live["title"]),
            missing_artifacts=_missing_artifacts(runtime_catalog_live),
            missing_keys=_missing_manifest_keys(runtime_catalog_live),
        ),
        Gate(
            issue="#152",
            area="Runtime registry lifecycle",
            deterministic_ready=bool(lifecycle_result["ok"]),
            live_ready=bool(runtime_registry_live["ok"]),
            live_title=str(runtime_registry_live["title"]),
            missing_artifacts=_missing_artifacts(runtime_registry_live),
            missing_keys=_missing_manifest_keys(runtime_registry_live),
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


def render_markdown(result: dict[str, Any]) -> str:
    summary = result["summary"]
    lines = [
        "# GACT TUI 0.8.3 Readiness",
        "",
        "- scope: terminal operability, provider recovery, marketplace/source proof, and live runtime catalog proof",
        f"- deterministic readiness: `{summary['deterministic_ready']}/{summary['gate_count']}`",
        f"- live proof readiness: `{summary['live_ready']}/{summary['gate_count']}`",
        f"- release ready: `{str(result['live_ok']).lower()}`",
        "",
        "| Issue | Area | Deterministic | Live proof |",
        "| --- | --- | --- | --- |",
    ]
    for gate in result["gates"]:
        lines.append(
            f"| {gate.issue} | {gate.area} | {'yes' if gate.deterministic_ready else 'no'} | "
            f"{'yes' if gate.live_ready else 'no'} |"
        )
    lines.append("")

    for gate in result["gates"]:
        if gate.live_ready:
            continue
        lines.extend(
            [
                f"## Missing: {gate.issue} {gate.area}",
                f"- Required live proof: {gate.live_title}",
            ]
        )
        if gate.missing_artifacts:
            lines.append("- Missing or invalid artifacts:")
            lines.extend(f"  - `{artifact}`" for artifact in gate.missing_artifacts)
        if gate.missing_keys:
            lines.append("- Missing or false manifest keys:")
            lines.extend(f"  - `{key}`" for key in gate.missing_keys)
        if gate.notes:
            lines.append("- Notes:")
            lines.extend(f"  - {note}" for note in gate.notes)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_report(result: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(result), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    parser.add_argument("--write-report", help="write Markdown report")
    parser.add_argument("--strict", action="store_true", help="fail if deterministic 0.8.3 proof is incomplete")
    parser.add_argument("--strict-live", action="store_true", help="fail unless all 0.8.3 live proof is complete")
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
