#!/usr/bin/env python3
"""Audit four-case NDP demo evidence without starting CLIO.

The demo has two different proof levels:

- CLIO evidence: the benchmark report says the real agent produced the named
  artifact.
- TUI evidence: the visual-loop corpus has recordings of a human operating the
  TUI while the case runs.

This checker keeps those separate so deterministic fixtures cannot be mistaken
for real end-to-end demo recordings.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


DEFAULT_REPORT = Path("/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/ndp_demo_four_cases.md")


@dataclass(frozen=True)
class DemoCase:
    case_id: str
    title: str
    artifact_name: str
    report_markers: tuple[str, ...]
    real_capture_stem: str
    deterministic_artifacts: tuple[str, ...]


CASES: tuple[DemoCase, ...] = (
    DemoCase(
        case_id="san_diego_earthscope",
        title="San Diego / EarthScope seismic waveform review",
        artifact_name="sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
        report_markers=("San Diego", "EarthScope", "BHZ"),
        real_capture_stem="ndp_tui_real_san_diego_earthscope",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_earthscope_tool_summary.tape",
            "visual_loop/screenshots/semantic_earthscope_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="california_wildfire",
        title="California current wildfire features",
        artifact_name="current_wildfires_ca.json",
        report_markers=("current wildfire", "California", "ArcGIS"),
        real_capture_stem="ndp_tui_real_wildfire",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_ndp_feature_tool_summary.tape",
            "visual_loop/screenshots/semantic_ndp_feature_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="california_nws_warnings",
        title="California NWS warnings",
        artifact_name="california_nws_warnings.json",
        report_markers=("California NWS", "warning", "ISO"),
        real_capture_stem="ndp_tui_real_california_nws_warnings",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_nws_warnings_tool_summary.tape",
            "visual_loop/screenshots/semantic_nws_warnings_tool_summary.png",
        ),
    ),
    DemoCase(
        case_id="fresno_cimis_weather",
        title="Fresno CIMIS weather profile and visualization",
        artifact_name="cimis_fresno_weather.png",
        report_markers=("CIMIS", "Fresno", "weather"),
        real_capture_stem="ndp_tui_real_fresno_cimis",
        deterministic_artifacts=(
            "visual_loop/tapes/semantic_cimis_weather_tool_summary.tape",
            "visual_loop/screenshots/semantic_cimis_weather_tool_plot_summary.png",
        ),
    ),
)


REAL_STILL_CAPTURE_SUFFIXES: tuple[str, ...] = ("prompt.png", "early.png", "live.png")
REAL_RECORDING_SUFFIX = "short.gif"
REAL_CAPTURE_SUFFIXES: tuple[str, ...] = (*REAL_STILL_CAPTURE_SUFFIXES, REAL_RECORDING_SUFFIX)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
GIF_SIGNATURES = (b"GIF87a", b"GIF89a")
REQUIRED_MANIFEST_FIELDS: tuple[str, ...] = (
    "case_id",
    "session_id",
    "backend",
    "artifact_name",
    "recording_path",
    "still_capture_paths",
    "session_status",
    "assistant_message_count",
    "verified_artifact",
    "requested_user_input",
    "provider_streaming_limitation",
    "live_streaming_false",
    "turn_cancelled",
    "completion_timeout",
    "semantic_event_count",
    "live_observed_event_count",
    "streaming_event_types",
)


def artifact_ok_pattern(artifact_name: str) -> re.Pattern[str]:
    return re.compile(re.escape(artifact_name) + r"[^\n]*\(ok,", re.IGNORECASE)


def report_case_evidence(case: DemoCase, report_text: str) -> dict[str, object]:
    markers = {marker: marker.lower() in report_text.lower() for marker in case.report_markers}
    artifact_mentioned = case.artifact_name.lower() in report_text.lower()
    artifact_ok = bool(artifact_ok_pattern(case.artifact_name).search(report_text))
    return {
        "report_markers": markers,
        "report_mentions_artifact": artifact_mentioned,
        "report_artifact_ok": artifact_ok,
        "ok": all(markers.values()) and artifact_mentioned and artifact_ok,
    }


def existing_paths(root: Path, rels: tuple[str, ...]) -> dict[str, bool]:
    return {rel: (root / rel).exists() for rel in rels}


def real_capture_artifact_status(root: Path, rel: str) -> dict[str, object]:
    path = root / rel
    if not path.exists():
        return {"ok": False, "state": "missing"}
    if not path.is_file():
        return {"ok": False, "state": "not a file"}
    size = path.stat().st_size
    if size == 0:
        return {"ok": False, "state": "empty"}
    suffix = path.suffix.lower()
    with path.open("rb") as fh:
        header = fh.read(8)
    if suffix == ".png" and not header.startswith(PNG_SIGNATURE):
        return {"ok": False, "state": "invalid png"}
    if suffix == ".gif" and not any(header.startswith(sig) for sig in GIF_SIGNATURES):
        return {"ok": False, "state": "invalid gif"}
    return {"ok": True, "state": "present", "bytes": size}


def real_capture_artifact_statuses(root: Path, rels: tuple[str, ...]) -> dict[str, dict[str, object]]:
    return {rel: real_capture_artifact_status(root, rel) for rel in rels}


def real_capture_paths(case: DemoCase) -> tuple[str, ...]:
    return tuple(f"visual_loop/screenshots/{case.real_capture_stem}_{suffix}" for suffix in REAL_CAPTURE_SUFFIXES)


def real_still_capture_paths(case: DemoCase) -> tuple[str, ...]:
    return tuple(
        f"visual_loop/screenshots/{case.real_capture_stem}_{suffix}"
        for suffix in REAL_STILL_CAPTURE_SUFFIXES
    )


def real_recording_path(case: DemoCase) -> str:
    return f"visual_loop/screenshots/{case.real_capture_stem}_{REAL_RECORDING_SUFFIX}"


def real_capture_manifest_path(case: DemoCase) -> str:
    return f"visual_loop/screenshots/{case.real_capture_stem}_manifest.json"


def real_capture_manifest_status(root: Path, case: DemoCase) -> dict[str, object]:
    rel = real_capture_manifest_path(case)
    path = root / rel
    if not path.exists():
        return {
            "ok": False,
            "state": "streaming proof manifest missing",
            "path": rel,
            "required": True,
        }
    if not path.is_file():
        return {"ok": False, "state": "not a file", "path": rel, "required": True}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"ok": False, "state": f"invalid json: {exc}", "path": rel, "required": True}
    missing_fields = [field for field in REQUIRED_MANIFEST_FIELDS if field not in data]
    case_id_ok = data.get("case_id") == case.case_id
    artifact_name_ok = data.get("artifact_name") == case.artifact_name
    recording_path_ok = data.get("recording_path") == real_recording_path(case)
    still_capture_paths_ok = data.get("still_capture_paths") == list(real_still_capture_paths(case))
    session_id_ok = bool(str(data.get("session_id", "")).strip())
    backend_ok = bool(str(data.get("backend", "")).strip())
    assistant_message_count = int_value(data.get("assistant_message_count"))
    semantic_event_count = int_value(data.get("semantic_event_count"))
    live_observed_event_count = int_value(data.get("live_observed_event_count"))
    streaming_event_types = data.get("streaming_event_types")
    streaming_event_types_ok = isinstance(streaming_event_types, list) and any(
        isinstance(item, str) and item.strip() for item in streaming_event_types
    )
    verified_artifact = bool_field(data, "verified_artifact")
    requested_user_input = bool_field(data, "requested_user_input")
    provider_streaming_limitation = bool_field(data, "provider_streaming_limitation")
    live_streaming_false = bool_field(data, "live_streaming_false")
    turn_cancelled = bool_field(data, "turn_cancelled")
    completion_timeout = bool_field(data, "completion_timeout")
    ok = (
        not missing_fields
        and case_id_ok
        and artifact_name_ok
        and recording_path_ok
        and still_capture_paths_ok
        and session_id_ok
        and backend_ok
        and assistant_message_count > 0
        and semantic_event_count > 0
        and live_observed_event_count > 0
        and streaming_event_types_ok
        and verified_artifact is True
        and requested_user_input is False
        and provider_streaming_limitation is False
        and live_streaming_false is False
        and turn_cancelled is False
        and completion_timeout is False
    )
    problems: list[str] = []
    if missing_fields:
        problems.append("manifest missing required fields: " + ", ".join(missing_fields))
    if not case_id_ok:
        problems.append("manifest case_id does not match case")
    if not artifact_name_ok:
        problems.append("manifest artifact_name does not match case")
    if not recording_path_ok:
        problems.append("manifest recording_path does not match expected short GIF")
    if not still_capture_paths_ok:
        problems.append("manifest still_capture_paths do not match expected still captures")
    if not session_id_ok:
        problems.append("manifest session_id is empty")
    if not backend_ok:
        problems.append("manifest backend is empty")
    if assistant_message_count <= 0:
        problems.append("no assistant message observed")
    if semantic_event_count <= 0:
        problems.append("no semantic events observed")
    if live_observed_event_count <= 0:
        problems.append("no live-observed semantic events observed")
    if not streaming_event_types_ok:
        problems.append("streaming_event_types is empty")
    if verified_artifact is None:
        problems.append("manifest verified_artifact must be boolean true")
    elif not verified_artifact:
        problems.append("expected artifact not observed in assistant output")
    if requested_user_input is None:
        problems.append("manifest requested_user_input must be boolean false")
    elif requested_user_input:
        problems.append("assistant requested user input instead of completing the case")
    if provider_streaming_limitation is None:
        problems.append("manifest provider_streaming_limitation must be boolean false")
    elif provider_streaming_limitation:
        problems.append("provider did not expose live streaming")
    if live_streaming_false is None:
        problems.append("manifest live_streaming_false must be boolean false")
    elif live_streaming_false:
        problems.append("manifest records live_streaming=false")
    if turn_cancelled is None:
        problems.append("manifest turn_cancelled must be boolean false")
    elif turn_cancelled:
        problems.append("turn was cancelled before completing the case")
    if completion_timeout is None:
        problems.append("manifest completion_timeout must be boolean false")
    elif completion_timeout:
        problems.append("turn did not complete before manifest timeout")
    return {
        "ok": ok,
        "state": "verified" if ok else "; ".join(problems),
        "path": rel,
        "required": True,
        "data": data,
    }


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


def bool_field(data: dict[str, object], key: str) -> bool | None:
    value = data.get(key)
    if isinstance(value, bool):
        return value
    return None


def case_status(root: Path, report_text: str, case: DemoCase) -> dict[str, object]:
    report = report_case_evidence(case, report_text)
    deterministic = existing_paths(root, case.deterministic_artifacts)
    real_captures = real_capture_artifact_statuses(root, real_capture_paths(case))
    manifest = real_capture_manifest_status(root, case)
    still_visual_ok = all(real_captures[rel]["ok"] for rel in real_still_capture_paths(case))
    short_recording_ok = bool(real_captures[real_recording_path(case)]["ok"])
    streaming_ok = short_recording_ok and bool(manifest["ok"])
    return {
        "id": case.case_id,
        "title": case.title,
        "artifact": case.artifact_name,
        "clio_report": report,
        "deterministic_tui": {
            "artifacts": deterministic,
            "ok": all(deterministic.values()),
        },
        "real_tui_recording": {
            "artifacts": real_captures,
            "manifest": manifest,
            "visual_ok": still_visual_ok,
            "still_visual_ok": still_visual_ok,
            "short_recording_ok": short_recording_ok,
            "streaming_ok": streaming_ok,
            "ok": streaming_ok,
        },
        "ready_for_real_demo": bool(report["ok"]) and streaming_ok,
    }


def check_readiness(root: Path, report_path: Path = DEFAULT_REPORT) -> dict[str, object]:
    report_exists = report_path.exists()
    report_text = report_path.read_text(encoding="utf-8") if report_exists else ""
    cases = [case_status(root, report_text, case) for case in CASES]
    return {
        "ok": all(case["ready_for_real_demo"] for case in cases),
        "report": {
            "path": str(report_path),
            "exists": report_exists,
        },
        "cases": cases,
        "summary": {
            "case_count": len(cases),
            "clio_report_ready": sum(1 for case in cases if case["clio_report"]["ok"]),
            "deterministic_tui_ready": sum(1 for case in cases if case["deterministic_tui"]["ok"]),
            "real_tui_stills": sum(1 for case in cases if case["real_tui_recording"]["still_visual_ok"]),
            "short_recordings": sum(1 for case in cases if case["real_tui_recording"]["short_recording_ok"]),
            "streaming_proof_ready": sum(1 for case in cases if case["real_tui_recording"]["streaming_ok"]),
            "real_tui_ready": sum(1 for case in cases if case["real_tui_recording"]["streaming_ok"]),
            "ready_for_real_demo": sum(1 for case in cases if case["ready_for_real_demo"]),
        },
    }


def render_markdown(result: dict[str, object]) -> str:
    lines = ["# NDP Demo Readiness", ""]
    report = result["report"]
    lines.append(f"- report: `{report['path']}`")
    lines.append(f"- report exists: `{str(report['exists']).lower()}`")
    lines.append(f"- ready for real demo: `{str(result['ok']).lower()}`")
    lines.append("")
    lines.append("| Case | CLIO artifact proof | Deterministic TUI | Real TUI stills | Short GIF | Live-run manifest | Ready |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for case in result["cases"]:
        lines.append(
            "| {title} | {clio} | {det} | {visual} | {recording} | {streaming} | {ready} |".format(
                title=case["title"],
                clio="yes" if case["clio_report"]["ok"] else "no",
                det="yes" if case["deterministic_tui"]["ok"] else "no",
                visual="yes" if case["real_tui_recording"]["still_visual_ok"] else "no",
                recording="yes" if case["real_tui_recording"]["short_recording_ok"] else "no",
                streaming="yes" if case["real_tui_recording"]["streaming_ok"] else "no",
                ready="yes" if case["ready_for_real_demo"] else "no",
            )
        )
    lines.append("")
    lines.append("## Streaming Proof Contract")
    lines.append("")
    lines.append(
        "A short GIF proves that the terminal view moved over time, but it does "
        "not prove that the run was a live CLIO stream. Each real run must also "
        "write a streaming proof manifest: a small JSON receipt produced by the "
        "capture helper after inspecting the owned backend session."
    )
    lines.append("")
    lines.append("Required manifest fields:")
    lines.extend(f"- `{field}`" for field in REQUIRED_MANIFEST_FIELDS)
    lines.append("")
    lines.append(
        "A manifest only counts as live-run proof when the case/artifact match, "
        "the referenced short GIF and still captures match the expected case "
        "artifacts, an assistant message and expected artifact were observed, "
        "at least one `semantic_event_count` and one "
        "`live_observed_event_count` were recorded, `streaming_event_types` is "
        "non-empty, and the run did not request user input, time out, cancel, "
        "or report `provider_streaming_limitation` / `live_streaming_false`."
    )
    lines.append("")
    lines.append("## Real Capture Inventory")
    lines.append("")
    lines.append("| Case | Still captures | Short GIF | Live-run manifest | Artifact observed | Streaming events | Session status |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for case in result["cases"]:
        artifacts = case["real_tui_recording"]["artifacts"]
        manifest = case["real_tui_recording"].get("manifest", {})
        data = manifest.get("data", {}) if isinstance(manifest, dict) else {}
        still_ok = case["real_tui_recording"]["still_visual_ok"]
        recording_ok = case["real_tui_recording"]["short_recording_ok"]
        manifest_exists = bool(manifest) and manifest.get("state") != "streaming proof manifest missing"
        artifact_observed = bool_field(data, "verified_artifact") if data else "legacy"
        streaming_limitation = bool_field(data, "provider_streaming_limitation") if data else None
        live_streaming_disabled = bool_field(data, "live_streaming_false") if data else None
        streaming_proof = (
            "yes"
            if data and streaming_limitation is False and live_streaming_disabled is False
            else "no"
            if data or manifest_exists
            else "no"
        )
        session_status = str(data.get("session_status", "legacy")) if data else "legacy"
        lines.append(
            "| {title} | {stills} | {recording} | {manifest} | {artifact} | {streaming} | {status} |".format(
                title=case["title"],
                stills="yes" if still_ok else "no",
                recording="yes" if recording_ok else "no",
                manifest="yes" if manifest_exists else "no",
                artifact=artifact_observed if isinstance(artifact_observed, str) else "yes" if artifact_observed else "no",
                streaming=streaming_proof,
                status=session_status,
            )
        )
    lines.append("")
    for case in result["cases"]:
        if case["ready_for_real_demo"]:
            continue
        lines.append(f"## Missing: {case['title']}")
        missing = [
            (rel, artifact["state"])
            for rel, artifact in case["real_tui_recording"]["artifacts"].items()
            if not artifact["ok"]
        ]
        if not case["clio_report"]["ok"]:
            lines.append("- CLIO report/artifact proof is incomplete.")
        if missing:
            lines.append("- Real TUI recording artifacts missing or invalid:")
            lines.extend(f"  - `{rel}` ({state})" for rel, state in missing)
        manifest = case["real_tui_recording"].get("manifest", {})
        if manifest and not manifest["ok"]:
            lines.append("- Live-run manifest does not prove streaming-ready demo semantics:")
            lines.append(f"  - `{manifest['path']}` ({manifest['state']})")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_markdown_report(result: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_markdown(result), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="gact-tui repository root")
    parser.add_argument("--report", default=str(DEFAULT_REPORT), help="four-case CLIO evidence report")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of Markdown")
    parser.add_argument(
        "--write-report",
        help="also write the Markdown readiness report to this path",
    )
    parser.add_argument("--strict", action="store_true", help="exit non-zero unless every case has real TUI proof")
    args = parser.parse_args()

    result = check_readiness(Path(args.root), Path(args.report))
    if args.write_report:
        write_markdown_report(result, Path(args.write_report))
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(render_markdown(result), end="")
    if args.strict and not result["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
