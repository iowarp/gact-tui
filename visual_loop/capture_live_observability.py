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


def unwrap_payload(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload") or {}
    if isinstance(payload, dict) and isinstance(payload.get("payload"), dict):
        return payload["payload"]
    return payload if isinstance(payload, dict) else {}


def summarize(event: dict[str, Any], t0: float) -> dict[str, Any]:
    payload = unwrap_payload(event)
    summary: dict[str, Any] = {
        "t": round(event["monotonic"] - t0, 3),
        "event": event.get("event", ""),
    }
    if "error" in event:
        summary["error"] = event["error"]
        return summary

    part = payload.get("part") if isinstance(payload.get("part"), dict) else {}
    if part:
        summary["message_id"] = payload.get("message_id", "")
        summary["part_type"] = part.get("type", "")
        for key in (
            "selected_agent",
            "execution_path",
            "tool_name",
            "call_id",
            "is_error",
            "duration_ms",
        ):
            if key in part:
                summary[key] = part[key]
        metadata = part.get("metadata") if isinstance(part.get("metadata"), dict) else {}
        for key in ("agent_id", "parent_id", "stage", "status", "route_source"):
            if key in metadata:
                summary[key] = metadata[key]
    else:
        for key in ("message_id", "stop_reason", "status", "prev_status", "reason"):
            if key in payload:
                summary[key] = payload[key]
        if "tool" in payload:
            summary["tool"] = payload.get("tool")
        if "call_id" in payload:
            summary["call_id"] = payload.get("call_id")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://127.0.0.1:17800")
    parser.add_argument("--out-dir", default="visual_loop/screenshots")
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument(
        "--prompt",
        default=(
            "Search the National Data Platform for a small seismic waveform dataset. "
            "Use the NDP/catalog tooling if available, report one concrete candidate, "
            "and do not invent missing data."
        ),
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    jsonl_path = out_dir / f"live_observability_{stamp}.jsonl"
    report_path = out_dir / f"live_observability_{stamp}.report.md"

    session = request_json(
        "POST",
        f"{args.backend}/v1/sessions",
        {"title": f"codex live observability {stamp}"},
    )
    sid = str(session["id"])

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
        request_json("POST", f"{args.backend}/v1/sessions/{sid}/messages", {"text": args.prompt})
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
    route_events = [
        s for s in summaries if s.get("event") == "message.part.added" and s.get("part_type") == "routing_decision"
    ]
    handoff_events = [
        s for s in summaries if s.get("event") == "message.part.added" and s.get("part_type") == "expert_handoff"
    ]
    tool_part_events = [
        s for s in summaries if s.get("event") == "message.part.added" and s.get("part_type") in {"tool_call", "tool_result"}
    ]
    tool_events = [s for s in summaries if str(s.get("event", "")).startswith("tool.call.")]
    completed_t = next((s["t"] for s in summaries if s.get("event") == "message.completed"), None)
    live_before_completion = [
        s
        for s in route_events + handoff_events + tool_part_events + tool_events
        if completed_t is None or s["t"] < completed_t
    ]

    verdict = "PASS" if completed and live_before_completion else "FAIL"
    report = [
        f"# Live Observability Capture {stamp}",
        "",
        f"- backend: `{args.backend}`",
        f"- session: `{sid}`",
        f"- verdict: `{verdict}`",
        f"- completed: `{completed}`",
        f"- jsonl: `{jsonl_path}`",
        "",
        "## Counts",
        "",
        f"- routing_decision parts: {len(route_events)}",
        f"- expert_handoff parts: {len(handoff_events)}",
        f"- tool_call/tool_result parts: {len(tool_part_events)}",
        f"- tool.call lifecycle events: {len(tool_events)}",
        f"- live observability events before completion: {len(live_before_completion)}",
        "",
        "## Timeline",
        "",
    ]
    for item in summaries:
        bits = [f"{item['t']:>7.3f}s", str(item["event"])]
        for key in (
            "part_type",
            "selected_agent",
            "execution_path",
            "agent_id",
            "parent_id",
            "stage",
            "tool_name",
            "tool",
            "stop_reason",
            "status",
            "error",
        ):
            if key in item:
                bits.append(f"{key}={item[key]}")
        report.append("- " + " · ".join(bits))
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    print(json.dumps({"verdict": verdict, "session_id": sid, "jsonl": str(jsonl_path), "report": str(report_path)}))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"HTTP error {exc.code}: {http_error_body(exc)}", file=sys.stderr)
        raise
