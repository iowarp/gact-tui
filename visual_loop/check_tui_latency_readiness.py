#!/usr/bin/env python3
"""Audit TUI latency evidence for #156/#160.

The normal check verifies maintained deterministic/live-partial evidence. The
strict-live check is intentionally harder: it requires a live owned CLIO capture
whose manifest proves the session was still active and streaming when latency
evidence was recorded.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

LATENCY_BUDGET_TOLERANCE = 1.25
PTY_MOUSE_LATENCY_REPORT = "visual_loop/screenshots/tui_mouse_latency_pty_report.json"
PTY_MOUSE_SECTION_BASELINES_MS: dict[str, float] = {
    "header": 4.772969,
    "conversation": 3.643146,
    "input": 3.116144,
    "left sidebar": 2.431315,
}


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


def artifact_status(root: Path, rel: str) -> dict[str, object]:
    path = root / rel
    if not path.exists():
        return {"ok": False, "state": "missing"}
    if not path.is_file():
        return {"ok": False, "state": "not a file"}
    size = path.stat().st_size
    if size <= 0:
        return {"ok": False, "state": "empty"}
    if path.suffix.lower() == ".png":
        with path.open("rb") as handle:
            if not handle.read(8).startswith(PNG_SIGNATURE):
                return {"ok": False, "state": "invalid png"}
    return {"ok": True, "state": "present", "bytes": size}


def load_manifest(root: Path, rel: str | None) -> tuple[dict[str, object], dict[str, object]]:
    if rel is None:
        return {}, {"ok": True, "state": "not required"}
    status = artifact_status(root, rel)
    if not status["ok"]:
        return {}, {"ok": False, "state": status["state"]}
    try:
        data = json.loads((root / rel).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, {"ok": False, "state": f"invalid json: {exc}"}
    if not isinstance(data, dict):
        return {}, {"ok": False, "state": "manifest is not an object"}
    return data, {"ok": True, "state": "present", "keys": sorted(data.keys())}


def load_json_object(root: Path, rel: str) -> tuple[dict[str, object], dict[str, object]]:
    status = artifact_status(root, rel)
    if not status["ok"]:
        return {}, {"ok": False, "state": status["state"]}
    try:
        data = json.loads((root / rel).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, {"ok": False, "state": f"invalid json: {exc}"}
    if not isinstance(data, dict):
        return {}, {"ok": False, "state": "json is not an object"}
    return data, {"ok": True, "state": "present", "keys": sorted(data.keys())}


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


def float_value(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def pty_mouse_latency_budget_status(root: Path) -> dict[str, object]:
    report, report_status = load_json_object(root, PTY_MOUSE_LATENCY_REPORT)
    baselines = {
        surface: {
            "baseline_ms": baseline,
            "budget_ms": round(baseline * LATENCY_BUDGET_TOLERANCE, 6),
        }
        for surface, baseline in PTY_MOUSE_SECTION_BASELINES_MS.items()
    }
    status: dict[str, object] = {
        "ok": False,
        "report": PTY_MOUSE_LATENCY_REPORT,
        "report_status": report_status,
        "tolerance": LATENCY_BUDGET_TOLERANCE,
        "baselines": baselines,
        "observed": {},
        "missing_sections": [],
        "over_budget": [],
    }
    if not report_status["ok"]:
        return status

    sections = report.get("sections")
    if not isinstance(sections, list):
        status["report_status"] = {"ok": False, "state": "sections is not a list"}
        return status

    observed: dict[str, float] = {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        surface = section.get("surface")
        if not isinstance(surface, str):
            continue
        p95_ms = float_value(section.get("slowest_p95_ms"))
        if p95_ms is None:
            continue
        observed[surface] = p95_ms

    missing = [surface for surface in PTY_MOUSE_SECTION_BASELINES_MS if surface not in observed]
    failures: list[dict[str, object]] = []
    for surface, baseline in PTY_MOUSE_SECTION_BASELINES_MS.items():
        if surface not in observed:
            continue
        budget_ms = baseline * LATENCY_BUDGET_TOLERANCE
        actual_ms = observed[surface]
        if actual_ms > budget_ms:
            failures.append(
                {
                    "surface": surface,
                    "actual_ms": round(actual_ms, 6),
                    "budget_ms": round(budget_ms, 6),
                    "baseline_ms": baseline,
                }
            )

    status["observed"] = {surface: round(value, 6) for surface, value in observed.items()}
    status["missing_sections"] = missing
    status["over_budget"] = failures
    status["ok"] = not missing and not failures
    return status


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


def render_markdown(result: dict[str, object]) -> str:
    summary = result["summary"]
    lines = [
        "# TUI Latency Visual Readiness",
        "",
        f"- maintained evidence ready: `{str(result['ok']).lower()}`",
        f"- strict live evidence ready: `{str(result['strict_live_ok']).lower()}`",
        f"- maintained evidence: `{summary['maintained_ready']}/{summary['maintained_count']}`",
        f"- strict live evidence: `{summary['strict_live_ready']}/{summary['strict_live_count']}`",
        "",
        "| Area | Evidence | Maintained | Strict live | Ready |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in result["items"]:
        lines.append(
            "| {area} | {title} | {maintained} | {strict_live} | {ready} |".format(
                area=item["area"],
                title=item["title"],
                maintained="yes" if item["required_for_maintained"] else "no",
                strict_live="yes" if item["required_for_strict_live"] else "no",
                ready="yes" if item["ok"] else "no",
            )
        )
    lines.append("")
    for item in result["items"]:
        if item["ok"]:
            continue
        lines.append(f"## Missing: {item['area']} - {item['title']}")
        for rel, status in item["artifacts"].items():
            if not status["ok"]:
                lines.append(f"- `{rel}`: {status['state']}")
        if item["missing_keys"]:
            lines.append("- Missing manifest keys: " + ", ".join(f"`{key}`" for key in item["missing_keys"]))
        if item["false_keys"]:
            lines.append("- False manifest keys: " + ", ".join(f"`{key}`" for key in item["false_keys"]))
        if item["non_positive"]:
            lines.append("- Non-positive counters: " + ", ".join(f"`{key}`" for key in item["non_positive"]))
        if item["active_stream_blockers"]:
            lines.append("- Active-stream blockers: " + ", ".join(f"`{key}`" for key in item["active_stream_blockers"]))
        latency_budget = item.get("latency_budget")
        if isinstance(latency_budget, dict) and not latency_budget["ok"]:
            lines.append(
                "- Latency budget failure: "
                f"`{latency_budget['report']}` must stay within "
                f"`{latency_budget['tolerance']}x` checked-in PTY baselines"
            )
            missing_sections = latency_budget.get("missing_sections")
            if missing_sections:
                lines.append(
                    "- Missing latency sections: "
                    + ", ".join(f"`{section}`" for section in missing_sections)
                )
            over_budget = latency_budget.get("over_budget")
            if isinstance(over_budget, list):
                for failure in over_budget:
                    if not isinstance(failure, dict):
                        continue
                    lines.append(
                        "- Over budget: `{surface}` p95 `{actual_ms}ms` > `{budget_ms}ms` "
                        "(baseline `{baseline_ms}ms`)".format(**failure)
                    )
        lines.append("")
    ready_budget_items = [
        item.get("latency_budget")
        for item in result["items"]
        if isinstance(item.get("latency_budget"), dict) and item.get("ok")
    ]
    if ready_budget_items:
        lines.extend(["## Maintained Latency Budgets", ""])
        for budget in ready_budget_items:
            if not isinstance(budget, dict):
                continue
            baselines = budget.get("baselines", {})
            observed = budget.get("observed", {})
            if not isinstance(baselines, dict) or not isinstance(observed, dict):
                continue
            lines.append(
                f"- `{budget['report']}`: p95 must stay within "
                f"`{budget['tolerance']}x` of checked-in baselines"
            )
            for surface in PTY_MOUSE_SECTION_BASELINES_MS:
                baseline = baselines.get(surface, {})
                if not isinstance(baseline, dict):
                    continue
                actual = observed.get(surface)
                lines.append(
                    "- `{surface}`: observed `{actual}ms`, budget `{budget_ms}ms`, baseline `{baseline_ms}ms`".format(
                        surface=surface,
                        actual=actual,
                        budget_ms=baseline["budget_ms"],
                        baseline_ms=baseline["baseline_ms"],
                    )
                )
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict-live", action="store_true", help="require active live-stream latency evidence")
    parser.add_argument("--write-report", help="write Markdown readiness report")
    args = parser.parse_args(argv)

    root = Path(args.root)
    result = check_readiness(root)
    if args.write_report:
        output = root / args.write_report
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(result), encoding="utf-8")
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(render_markdown(result))
    return 0 if result["ok"] and (not args.strict_live or result["strict_live_ok"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
