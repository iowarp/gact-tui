"""Markdown reporting for NDP demo readiness results."""

from __future__ import annotations

from pathlib import Path

from ndp_demo_readiness_model import REQUIRED_MANIFEST_FIELDS, bool_field


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
