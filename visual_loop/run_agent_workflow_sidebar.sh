#!/usr/bin/env bash
set -euo pipefail

port="${GACT_AGENT_WORKFLOW_PORT:-41909}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-agent-workflow-sidebar.log"
config_dir="$(mktemp -d)"
workspace_dir="$(mktemp -d)"
config_path="${config_dir}/config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions"],
    "right": ["agents"]
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
  rm -rf "$config_dir" "$workspace_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

workspace_id="$(curl -fsS "${backend}/v1/workspaces" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["workspaces"][0]["id"])')"
session_id="$(curl -fsS -X POST "${backend}/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"workspace_id\":\"${workspace_id}\",\"title\":\"workflow hierarchy visual\",\"metadata\":{\"active_agent_blueprint_id\":\"seismic-market\",\"active_agent_blueprint_scope\":\"session\"}}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

curl -fsS -X POST "${backend}/v1/agents" -H 'Content-Type: application/json' -d '{
  "id": "workflow_root",
  "title": "Workflow Root",
  "source": "agent_blueprint",
  "enabled": true,
  "tier": 1,
  "skills": ["ndp", "earthscope", "plotting"]
}' >/dev/null

curl -fsS -X POST "${backend}/v1/agents" -H 'Content-Type: application/json' -d '{
  "id": "waveform_review",
  "title": "Waveform Review",
  "source": "agent_blueprint",
  "enabled": true,
  "parent_id": "workflow_root",
  "tier": 2,
  "specialization": "seismic_waveform",
  "skills": ["sac", "earthscope"]
}' >/dev/null

env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
