"""Shared live-capture manifest validation helpers."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from readiness_artifacts import artifact_status

ManifestValuePredicate = Callable[[str, object], bool]


def default_manifest_value_ok(_key: str, value: object) -> bool:
    return bool(str(value).strip()) if value is not None else False


def manifest_status(
    root: Path,
    manifest: str | None,
    required_keys: tuple[str, ...],
    artifact_refs: tuple[tuple[str, str], ...] = (),
    value_ok: ManifestValuePredicate = default_manifest_value_ok,
) -> dict[str, object]:
    if manifest is None:
        return {"ok": True, "state": "not required", "missing_keys": []}
    status = artifact_status(root, manifest)
    if not status["ok"]:
        return {"ok": False, "state": status["state"], "missing_keys": list(required_keys)}
    path = root / manifest
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"ok": False, "state": f"invalid json: {exc}", "missing_keys": list(required_keys)}
    if not isinstance(data, dict):
        return {"ok": False, "state": "manifest is not an object", "missing_keys": list(required_keys)}
    missing = [key for key in required_keys if not value_ok(key, data.get(key))]
    invalid_artifacts = [
        {
            "key": key,
            "expected": expected,
            "actual": str(data.get(key, "")).strip(),
        }
        for key, expected in artifact_refs
        if key not in missing and str(data.get(key, "")).strip() != expected
    ]
    return {
        "ok": not missing and not invalid_artifacts,
        "state": "present",
        "missing_keys": missing,
        "invalid_artifacts": invalid_artifacts,
        "keys": sorted(data.keys()),
    }
