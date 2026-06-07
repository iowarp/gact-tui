#!/usr/bin/env bash
set -euo pipefail

port="${GACT_SEMANTIC_DETAIL_PORT:-41938}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-event-detail.log"
workspace_dir="$(mktemp -d)"
config_dir="$(mktemp -d)"
export_path="${TMPDIR:-/tmp}/gact-semantic-event-detail-session.json"

cleanup() {
  kill "$srv" 2>/dev/null || true
  rm -rf "$workspace_dir" "$config_dir" "$export_path"
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

python3 - "$workspace_id" >"$export_path" <<'PY'
import json
import sys

workspace_id = sys.argv[1]
event = {
    "schema_version": "clio.semantic_event.v1",
    "event_id": "sem_demo_01",
    "event_type": "tool.call.completed",
    "status": "completed",
    "summary": "NDP catalog search completed.",
    "session_id": "session_demo",
    "workspace_id": "demo",
    "trace_id": "trace_demo_01",
    "turn_id": "turn_demo_01",
    "span_id": "span_tool",
    "parent_span_id": "span_delegate",
    "detail_level": "semantic",
    "live_observed": True,
    "occurred_at": "2026-06-05T00:00:00Z",
    "actor": {"agent_id": "ndp_catalog", "role": "child_expert", "tool": "ndp_search_datasets"},
    "subject": {"call_id": "call_1", "agent_id": "ndp_catalog"},
    "blueprint": {"pack_id": "seismic", "pack_version": "1.0.0", "definition_path": "/workspace/demo/AGENT.md"},
    "provider": {"provider_id": "argonne_sophia", "model_id": "openai/gpt-oss-120b"},
    "payload": {
        "tool": "ndp_search_datasets",
        "call_id": "call_1",
        "ok": True,
        "duration_ms": 42,
        "cached": False,
        "telemetry_source": "live_observer",
        "args_preview": "search_terms=seismic",
    },
}

json.dump({
    "format": "gact-v1",
    "exported_at": "2026-06-05T00:00:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "semantic event detail",
        "status": "idle",
    },
    "messages": [
        {
            "role": "assistant",
            "parts": [
                {
                    "type": "tool_result",
                    "tool_name": "ndp_search_datasets",
                    "content": [{"type": "text", "text": "NDP catalog search completed."}],
                    "metadata": {
                        "semantic_event": True,
                        "raw_event": event,
                    },
                }
            ],
        }
    ],
}, sys.stdout)
PY

session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${export_path}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro
