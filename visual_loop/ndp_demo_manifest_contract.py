"""Streaming proof manifest contract for NDP demo readiness."""

from __future__ import annotations

import json
from pathlib import Path


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


def manifest_status(
    root: Path,
    rel: str,
    *,
    case_id: str,
    artifact_name: str,
    recording_path: str,
    still_capture_paths: tuple[str, ...],
) -> dict[str, object]:
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
    case_id_ok = data.get("case_id") == case_id
    artifact_name_ok = data.get("artifact_name") == artifact_name
    recording_path_ok = data.get("recording_path") == recording_path
    still_capture_paths_ok = data.get("still_capture_paths") == list(still_capture_paths)
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
