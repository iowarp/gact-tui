"""Shared artifact validation helpers for visual readiness checks."""

from __future__ import annotations

from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


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
