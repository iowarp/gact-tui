#!/usr/bin/env bash
set -euo pipefail

port="${GACT_SEMANTIC_TRACE_REVISIT_PORT:-41955}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-trace-revisit.log"
workspace_dir="$(mktemp -d)"
config_dir="$(mktemp -d)"
secondary_export="$(mktemp)"
primary_export="$(mktemp)"

cleanup() {
  kill "$srv" 2>/dev/null || true
  rm -rf "$workspace_dir" "$config_dir" "$secondary_export" "$primary_export"
}
trap cleanup EXIT INT TERM

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "demo:${workspace_dir}" >"$log" 2>&1 &
srv=$!

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

workspace_id="$(curl -fsS "${backend}/v1/workspaces" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["workspaces"][0]["id"])')"

python3 - "$workspace_id" "$secondary_export" "$primary_export" <<'PY'
import json
import sys

workspace_id, secondary_path, primary_path = sys.argv[1:4]

def write_export(path, title, messages, status="idle", metadata=None):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({
            "format": "gact-v1",
            "exported_at": "2026-06-11T00:00:00Z",
            "session": {
                "workspace_id": workspace_id,
                "title": title,
                "status": status,
                "metadata": metadata or {},
            },
            "messages": messages,
        }, handle)

write_export(
    secondary_path,
    "plain comparison session",
    [
        {"role": "user", "parts": [{"type": "text", "text": "Open a plain comparison session."}]},
        {"role": "assistant", "parts": [{"type": "text", "text": "This session has no semantic trace rows."}]},
    ],
)

event = {
    "schema_version": "clio.semantic_event.v1",
    "event_id": "trace_revisit_tool_done",
    "event_type": "tool.call.completed",
    "status": "completed",
    "summary": "Tool sac_compute_trace_statistics completed.",
    "session_id": "trace_revisit",
    "workspace_id": workspace_id,
    "trace_id": "trace_revisit_01",
    "turn_id": "turn_revisit_01",
    "span_id": "span_tool",
    "parent_span_id": "span_analysis",
    "detail_level": "semantic",
    "live_observed": True,
    "occurred_at": "2026-06-11T00:00:01Z",
    "actor": {"agent_id": "sac_format", "role": "child_expert", "tool": "sac_compute_trace_statistics"},
    "subject": {"call_id": "call_trace_stats", "agent_id": "analysis"},
    "blueprint": {
        "agent_blueprint_id": "seismic-waveform-review",
        "pack_id": "seismic-waveform-review",
        "pack_version": "0.1.0",
        "parent_expert": "analysis",
        "child_expert": "sac_format",
    },
    "provider": {"provider_id": "argonne_sophia", "model_id": "openai/gpt-oss-120b"},
    "payload": {
        "tool": "sac_compute_trace_statistics",
        "call_id": "call_trace_stats",
        "duration_ms": 5.27,
        "telemetry_source": "live_observer",
        "result": {
            "trace_count": 1,
            "station": "CI.BAR",
            "channel": "BHZ",
            "artifact_path": "/tmp/ndp/sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
        },
    },
}

write_export(
    primary_path,
    "semantic trace revisit proof",
    [
        {
            "role": "user",
            "parts": [{"type": "text", "text": "Review the San Diego EarthScope trace and keep evidence stable."}],
        },
        {
            "role": "assistant",
            "parts": [
                {
                    "id": "persisted_semantic_event_1",
                    "type": "tool_result",
                    "tool_name": "sac_compute_trace_statistics",
                    "call_id": "call_trace_stats",
                    "content": [{"type": "text", "text": "SAC trace statistics completed for CI.BAR BHZ."}],
                    "metadata": {
                        "semantic_event": True,
                        "stream_source": "semantic_event",
                        "event_type": "tool.call.completed",
                        "trace_id": "trace_revisit_01",
                        "turn_id": "turn_revisit_01",
                        "raw_event": event,
                    },
                },
                {
                    "type": "text",
                    "text": "The persisted trace row should look identical after leaving and returning to this session.",
                },
            ],
        },
    ],
    metadata={
        "active_agent_blueprint_id": "seismic-waveform-review",
        "active_agent_blueprint_scope": "session",
    },
)
PY

curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${secondary_export}" >/dev/null

primary_session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${primary_export}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$primary_session_id" ./tui/gact --backend "$backend" --no-intro
