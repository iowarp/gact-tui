#!/usr/bin/env python3
"""Capture a real CLIO/GACT SSE timeline for temporal observability checks."""

from __future__ import annotations

import argparse
import json
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from assert_live_observability import (
    observations,
    ordered_sequence_before_completion,
    runtime_provenance_agreement,
    render_report as render_temporal_report,
)
from live_observability_summary import summarize, unwrap_payload


BENCHMARK_HIERARCHY_REQUIRED = [
    "route_or_delegate",
    "child_expert_active",
    "tool_started",
    "tool_completed",
    "parent_resumed",
]
DEFAULT_MIN_LIVE_LEAD_S = 0.25
__all__ = ["http_error_body", "main", "request_json", "sse_reader", "summarize", "unwrap_payload"]


def request_json(method: str, url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def http_error_body(exc: urllib.error.HTTPError) -> str:
    return exc.read().decode("utf-8", "replace")


def sse_reader(url: str, out: "queue.Queue[dict[str, Any]]", stop: threading.Event) -> None:
    req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            event_type = ""
            data_lines: list[str] = []
            while not stop.is_set():
                raw = resp.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if line.startswith("event:"):
                    event_type = line[len("event:") :].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[len("data:") :].strip())
                elif line == "":
                    if data_lines:
                        payload_raw = "\n".join(data_lines)
                        try:
                            payload = json.loads(payload_raw)
                        except json.JSONDecodeError:
                            payload = {"raw": payload_raw}
                        out.put(
                            {
                                "monotonic": time.monotonic(),
                                "event": event_type or payload.get("type") or "",
                                "payload": payload,
                            }
                        )
                    event_type = ""
                    data_lines = []
    except Exception as exc:  # noqa: BLE001
        out.put({"monotonic": time.monotonic(), "event": "reader.error", "error": repr(exc)})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://127.0.0.1:17800")
    parser.add_argument("--out-dir", default="visual_loop/screenshots")
    parser.add_argument(
        "--stamp",
        default=None,
        help="override the output filename stamp for deterministic corpus captures",
    )
    parser.add_argument(
        "--strict-report",
        default=None,
        help="optional path for the strict temporal assertion report",
    )
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument(
        "--prompt",
        default=(
            "Search the National Data Platform for a small seismic waveform dataset. "
            "Use the NDP/catalog tooling if available, report one concrete candidate, "
            "and do not invent missing data."
        ),
    )
    parser.add_argument(
        "--agent-blueprint",
        default="",
        help="optional Agent Blueprint id to activate on the captured session",
    )
    parser.add_argument(
        "--agent-overlay-json",
        default="",
        help="optional JSON object to apply to /agent-overlay before sending the prompt",
    )
    parser.add_argument(
        "--agent-id",
        default="",
        help="optional per-turn agent_id override for the prompt",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = args.stamp or time.strftime("%Y%m%d_%H%M%S")
    jsonl_path = out_dir / f"live_observability_{stamp}.jsonl"
    report_path = out_dir / f"live_observability_{stamp}.report.md"
    strict_report_path = Path(args.strict_report) if args.strict_report else None

    session = request_json(
        "POST",
        f"{args.backend}/v1/sessions",
        {"title": f"codex live observability {stamp}"},
    )
    sid = str(session["id"])
    if args.agent_blueprint:
        request_json(
            "POST",
            f"{args.backend}/v1/sessions/{sid}/agent-blueprint",
            {"blueprint_id": args.agent_blueprint},
        )
    if args.agent_overlay_json:
        request_json(
            "PUT",
            f"{args.backend}/v1/sessions/{sid}/agent-overlay",
            json.loads(args.agent_overlay_json),
        )

    q: "queue.Queue[dict[str, Any]]" = queue.Queue()
    stop = threading.Event()
    reader = threading.Thread(
        target=sse_reader,
        args=(f"{args.backend}/v1/sessions/{sid}/events", q, stop),
        daemon=True,
    )
    reader.start()
    time.sleep(0.5)

    t0 = time.monotonic()
    try:
        message_body = {"text": args.prompt}
        if args.agent_id:
            message_body["agent_id"] = args.agent_id
        request_json("POST", f"{args.backend}/v1/sessions/{sid}/messages", message_body)
    except urllib.error.HTTPError as exc:
        stop.set()
        error_body = http_error_body(exc)
        item = {
            "t": round(time.monotonic() - t0, 3),
            "event": "capture.error",
            "status": exc.code,
            "error": error_body,
        }
        jsonl_path.write_text(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
        report = [
            f"# Live Observability Capture {stamp}",
            "",
            f"- backend: `{args.backend}`",
            f"- session: `{sid}`",
            "- verdict: `FAIL`",
            "- completed: `False`",
            f"- jsonl: `{jsonl_path}`",
            "",
            "## Capture Error",
            "",
            f"- status: `{exc.code}`",
            "",
            "```json",
            error_body,
            "```",
        ]
        report_path.write_text("\n".join(report) + "\n", encoding="utf-8")
        print(
            json.dumps(
                {
                    "verdict": "FAIL",
                    "session_id": sid,
                    "jsonl": str(jsonl_path),
                    "report": str(report_path),
                    "error_status": exc.code,
                }
            )
        )
        return 1

    summaries: list[dict[str, Any]] = []
    completed = False
    deadline = time.monotonic() + args.timeout
    with jsonl_path.open("w", encoding="utf-8") as fh:
        while time.monotonic() < deadline:
            try:
                event = q.get(timeout=0.5)
            except queue.Empty:
                continue
            item = summarize(event, t0)
            summaries.append(item)
            fh.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
            fh.flush()
            if item["event"] == "message.completed":
                completed = True
                break

    stop.set()
    obs = observations(summaries)
    strict_ok, strict_chosen, strict_missing = ordered_sequence_before_completion(
        obs,
        BENCHMARK_HIERARCHY_REQUIRED,
        min_live_lead_s=DEFAULT_MIN_LIVE_LEAD_S,
    )
    runtime_agreement = runtime_provenance_agreement(summaries)
    temporal_report = render_temporal_report(
        jsonl_path,
        obs,
        BENCHMARK_HIERARCHY_REQUIRED,
        DEFAULT_MIN_LIVE_LEAD_S,
        runtime_agreement,
    )
    if strict_report_path is not None:
        strict_report_path.parent.mkdir(parents=True, exist_ok=True)
        strict_report_path.write_text(temporal_report, encoding="utf-8")
    route_events = [item for item in obs if item.kind == "route_or_delegate"]
    child_events = [item for item in obs if item.kind == "child_expert_active"]
    tool_started_events = [item for item in obs if item.kind == "tool_started"]
    tool_completed_events = [item for item in obs if item.kind == "tool_completed"]
    parent_resumed_events = [item for item in obs if item.kind == "parent_resumed"]

    verdict = "PASS" if completed and strict_ok and runtime_agreement.ok else "FAIL"
    report = [
        f"# Live Observability Capture {stamp}",
        "",
        f"- backend: `{args.backend}`",
        f"- session: `{sid}`",
        f"- verdict: `{verdict}`",
        f"- completed: `{completed}`",
        f"- strict_benchmark_hierarchy: `{strict_ok}`",
        f"- runtime_provenance_agreement: `{runtime_agreement.ok}`",
        f"- min_live_lead_s: `{DEFAULT_MIN_LIVE_LEAD_S:g}`",
        f"- jsonl: `{jsonl_path}`",
        "",
        "## Counts",
        "",
        f"- route/delegate observations: {len(route_events)}",
        f"- child expert active observations: {len(child_events)}",
        f"- tool started observations: {len(tool_started_events)}",
        f"- tool completed observations: {len(tool_completed_events)}",
        f"- parent resumed observations: {len(parent_resumed_events)}",
        "",
        "## Required Order",
        "",
        f"- required: `{', '.join(BENCHMARK_HIERARCHY_REQUIRED)}`",
        f"- missing: `{', '.join(strict_missing) if strict_missing else 'none'}`",
        "",
        "## Runtime Provenance Agreement",
        "",
        f"- missing_or_mismatched: `{', '.join(runtime_agreement.missing) if runtime_agreement.missing else 'none'}`",
        f"- matched: `{', '.join(runtime_agreement.matched) if runtime_agreement.matched else 'none'}`",
        "",
        "## Matched Sequence",
        "",
    ]
    if strict_chosen:
        for item in strict_chosen:
            suffix = f" · {item.detail}" if item.detail else ""
            report.append(f"- {item.t:>7.3f}s · {item.kind} · {item.event}{suffix}")
    else:
        report.append("- none")
    report.extend([
        "",
        "## Temporal Assertion Report",
        "",
        temporal_report.rstrip(),
        "",
        "## Raw Timeline",
        "",
    ])
    for item in summaries:
        bits = [f"{item['t']:>7.3f}s", str(item["event"])]
        for key in (
            "event_type",
            "part_type",
            "trace_id",
            "turn_id",
            "selected_agent",
            "execution_path",
            "agent_id",
            "parent_id",
            "stage",
            "tool_name",
            "tool",
            "call_id",
            "stop_reason",
            "status",
            "error",
        ):
            if key in item:
                bits.append(f"{key}={item[key]}")
        report.append("- " + " · ".join(bits))
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    result = {"verdict": verdict, "session_id": sid, "jsonl": str(jsonl_path), "report": str(report_path)}
    if strict_report_path is not None:
        result["strict_report"] = str(strict_report_path)
    print(json.dumps(result))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"HTTP error {exc.code}: {http_error_body(exc)}", file=sys.stderr)
        raise
