#!/usr/bin/env bash
set -euo pipefail

port="${GACT_AGENT_RUNTIME_PORT:-41907}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-agent-runtime-sidebar.log"
config_dir="$(mktemp -d)"
workspace_dir="$(mktemp -d)"
export_path="${TMPDIR:-/tmp}/gact-agent-runtime-session.json"
config_path="${config_dir}/config.json"

mkdir -p "${workspace_dir}/data" "${workspace_dir}/.clio/agents"
printf 'sample_id,site,temperature_k\n1,arc,271.2\n' >"${workspace_dir}/data/sample.csv"
printf 'agent markdown\n' >"${workspace_dir}/.clio/agents/data.md"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions"],
    "right": ["agents", "files"]
  }
}
JSON

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "demo:${workspace_dir}" >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$config_dir" "$workspace_dir" "$export_path"
}
trap cleanup EXIT INT TERM

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
    "exported_at": "2026-06-02T00:00:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "agent runtime visual",
        "status": "idle",
        "agent": {"id": "data_expert"},
    },
    "messages": [
        {
            "role": "user",
            "parts": [{"type": "text", "text": "Analyze data/sample.csv and route to the data expert."}],
        },
        {
            "role": "assistant",
            "metadata": {
                "runtime_provenance": {
                    "schema_version": "clio.runtime_provenance.v1",
                    "agent": {
                        "active_expert_id": "data_expert",
                        "selected_agent_id": "data_expert",
                    },
                    "delegation": {
                        "events": [
                            {"stage": "delegate.started", "parent_id": "default", "agent_id": "data_expert"},
                            {"stage": "delegate.completed", "parent_id": "default", "agent_id": "data_expert"},
                            {"stage": "parent.resumed", "parent_id": "default", "agent_id": "data_expert"}
                        ]
                    },
                    "tools": {
                        "observed": [{"name": "read_file", "owner": "data_expert", "ok": True}]
                    }
                }
            },
            "parts": [
                {
                    "type": "expert_handoff",
                    "metadata": {
                        "stage": "delegate.completed",
                        "parent_id": "default",
                        "agent_id": "data_expert",
                        "reason": "structured data analysis"
                    }
                },
                {"type": "text", "text": "Data expert inspected the CSV schema and returned control to the parent."}
            ]
        }
    ]
}, sys.stdout)
PY

session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${export_path}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
