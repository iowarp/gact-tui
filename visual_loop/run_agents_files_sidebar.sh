#!/usr/bin/env bash
set -euo pipefail

port="${GACT_AGENTS_FILES_PORT:-41903}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-agents-files-sidebar.log"
config_dir="$(mktemp -d)"
workspace_dir="$(mktemp -d)"
config_path="${config_dir}/config.json"

mkdir -p "${workspace_dir}/docs/api" "${workspace_dir}/src" "${workspace_dir}/.clio/agents"
printf '# demo\n' >"${workspace_dir}/README.md"
printf 'guide\n' >"${workspace_dir}/docs/guide.md"
printf 'spec\n' >"${workspace_dir}/docs/api/spec.md"
printf 'print("hello")\n' >"${workspace_dir}/src/main.py"
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
  -d "{\"workspace_id\":\"${workspace_id}\",\"title\":\"agents/files visual\"}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
