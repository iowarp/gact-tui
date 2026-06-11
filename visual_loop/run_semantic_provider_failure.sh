#!/usr/bin/env bash
set -euo pipefail

port="${GACT_SEMANTIC_PROVIDER_FAILURE_PORT:-41962}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-provider-failure.log"
workspace_dir="$(mktemp -d)"
config_dir="$(mktemp -d)"
export_path="${TMPDIR:-/tmp}/gact-semantic-provider-failure-session.json"

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
    "event_id": "sem_provider_failed",
    "event_type": "turn.failed",
    "status": "failed",
    "summary": "CLIO turn failed: provider_error.",
    "session_id": "session_provider_failure",
    "workspace_id": workspace_id,
    "trace_id": "trace_provider_failure",
    "turn_id": "turn_provider_failure",
    "detail_level": "semantic",
    "live_observed": True,
    "occurred_at": "2026-06-11T07:40:00Z",
    "actor": {"agent_id": "main", "role": "orchestrator"},
    "subject": {"message_id": "msg_asst_failed"},
    "blueprint": {"pack_id": "seismic-waveform-review", "pack_version": "0.1.0"},
    "provider": {
        "provider_id": "argonne_sophia",
        "model_id": "openai/gpt-oss-120b",
        "api_base": "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
    },
    "payload": {
        "error_info": {
            "error": "provider_error",
            "message": "live streaming failed before emitting output: unhandled errors in a TaskGroup (1 sub-exception)",
            "metadata": {
                "live_streaming": False,
                "stream_fallback": {
                    "category": "provider_streaming_error",
                    "description": "The live provider stream failed before emitting user-visible output.",
                },
            },
        }
    },
}

json.dump({
    "format": "gact-v1",
    "exported_at": "2026-06-11T07:40:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "semantic provider failure",
        "status": "failed",
    },
    "messages": [
        {
            "role": "user",
            "parts": [{"type": "text", "text": "hello"}],
        },
        {
            "role": "assistant",
            "stop_reason": "error",
            "parts": [
                {
                    "type": "error",
                    "code": "turn.failed",
                    "message": "Provider error: live streaming failed before visible output: unhandled errors in a TaskGroup (1 sub-exception) (argonne_sophia · openai/gpt-oss-120b).",
                    "recoverable": True,
                    "metadata": {
                        "semantic_event": True,
                        "raw_event": event,
                    },
                }
            ],
        },
    ],
}, sys.stdout)
PY

session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${export_path}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro
