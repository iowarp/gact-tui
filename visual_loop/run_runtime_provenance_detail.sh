#!/usr/bin/env bash
set -euo pipefail

port="${GACT_RUNTIME_DETAIL_PORT:-41937}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-runtime-provenance-detail.log"
workspace_dir="$(mktemp -d)"
export_path="${TMPDIR:-/tmp}/gact-runtime-provenance-detail-session.json"

cleanup() {
  kill "$srv" 2>/dev/null || true
  rm -rf "$workspace_dir" "$export_path"
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
json.dump({
    "format": "gact-v1",
    "exported_at": "2026-06-05T00:00:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "runtime provenance detail",
        "status": "idle",
    },
    "messages": [
        {
            "role": "assistant",
            "metadata": {
                "runtime_provenance": {
                    "schema_version": "clio.runtime_provenance.v1",
                    "turn": {
                        "trace_id": "trace_demo_01",
                        "turn_id": "turn_demo_01",
                        "user_message_id": "msg_user_demo",
                        "assistant_message_id": "msg_asst_demo"
                    },
                    "workspace": {
                        "workspace_id": "demo",
                        "root_path": "/workspace/demo"
                    },
                    "agent": {
                        "selected_agent_id": "data",
                        "active_expert_id": "ndp_catalog",
                        "route_source": "lm",
                        "parent_id": "main"
                    },
                    "blueprint": {
                        "id": "seismic-waveform-review",
                        "definition_path": "/workspace/demo/.clio/agent-blueprints/seismic-waveform-review/AGENT.md"
                    },
                    "provider": {
                        "provider_id": "argonne_sophia",
                        "model_id": "openai/gpt-oss-120b"
                    },
                    "tools": {
                        "observed": [{"tool_name": "ndp_search_datasets", "status": "completed", "duration_ms": 1200, "server_id": "ndp"}]
                    },
                    "memory": {
                        "policy_summary": "session plus workspace search",
                        "context_frame_count": 1
                    },
                    "artifacts": [{"path": "/workspace/demo/current_wildfires_ca.json", "status": "verified", "size_bytes": 2048}],
                    "errors": [{"tool_name": "ndp_search_datasets", "recoverable": True, "message": "retry succeeded"}]
                }
            }
        }
    ]
}, sys.stdout)
PY

session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${export_path}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro
