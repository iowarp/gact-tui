"""SSE capture helpers for CLIO-backed TUI audit sessions."""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import threading
import urllib.request


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_jsonl(path: pathlib.Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True, default=str) + "\n")


def parse_sse_block(block: list[str]) -> dict[str, object]:
    event_name = ""
    data_lines: list[str] = []
    event_id = ""
    for line in block:
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif line.startswith("id:"):
            event_id = line[3:].strip()
    data_text = "\n".join(data_lines)
    parsed = None
    if data_text:
        try:
            parsed = json.loads(data_text)
        except json.JSONDecodeError:
            parsed = None
    return {
        "kind": event_name or "message",
        "event_id": event_id,
        "raw_lines": block,
        "data_text": data_text,
        "data": parsed,
    }


class SSERecorder(threading.Thread):
    def __init__(self, base_url: str, session_id: str, out_path: pathlib.Path) -> None:
        super().__init__(daemon=True)
        self.base_url = base_url
        self.session_id = session_id
        self.out_path = out_path
        self.stop_event = threading.Event()
        self.error: str = ""

    def run(self) -> None:
        url = self.base_url + f"/v1/sessions/{self.session_id}/events"
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        event_index = 0
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                block: list[str] = []
                while not self.stop_event.is_set():
                    raw = resp.readline()
                    if not raw:
                        break
                    line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                    if line == "":
                        if block:
                            event_index += 1
                            self._write_block(event_index, block)
                            block = []
                        continue
                    block.append(line)
        except Exception as exc:  # noqa: BLE001
            self.error = repr(exc)
            write_jsonl(
                self.out_path,
                {
                    "observed_at": now(),
                    "source": "clio_sse",
                    "kind": "reader.error",
                    "error": self.error,
                },
            )

    def _write_block(self, event_index: int, block: list[str]) -> None:
        parsed = parse_sse_block(block)
        parsed.update(
            {
                "observed_at": now(),
                "source": "clio_sse",
                "event_index": event_index,
            }
        )
        write_jsonl(self.out_path, parsed)

    def stop(self) -> None:
        self.stop_event.set()
