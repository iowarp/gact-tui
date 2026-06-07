#!/usr/bin/env python3
"""Record an existing CLIO/GACT session SSE timeline without driving it."""

from __future__ import annotations

import argparse
import json
import queue
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from capture_live_observability import sse_reader, summarize


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--jsonl", required=True)
    parser.add_argument("--timeout", type=float, default=900.0)
    args = parser.parse_args()

    out = Path(args.jsonl)
    out.parent.mkdir(parents=True, exist_ok=True)

    q: "queue.Queue[dict[str, Any]]" = queue.Queue()
    stop = threading.Event()
    reader = threading.Thread(
        target=sse_reader,
        args=(f"{args.backend}/v1/sessions/{args.session_id}/events", q, stop),
        daemon=True,
    )
    reader.start()

    t0 = time.monotonic()
    deadline = time.monotonic() + args.timeout
    completed = False
    rows = 0
    with out.open("w", encoding="utf-8") as handle:
        while time.monotonic() < deadline and not completed:
            try:
                item = q.get(timeout=0.5)
            except queue.Empty:
                continue
            row = summarize(item, t0)
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            rows += 1
            if row.get("event") == "message.completed":
                completed = True

    stop.set()
    print(json.dumps({"completed": completed, "jsonl": str(out), "rows": rows}))
    return 0 if completed else 1


if __name__ == "__main__":
    raise SystemExit(main())
