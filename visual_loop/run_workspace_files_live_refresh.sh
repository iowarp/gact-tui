#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${GACT_WORKSPACE_FILES_LIVE_REFRESH_PORT:-41962}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-workspace-files-live-refresh.log"
config_dir="$(mktemp -d)"
workspace_dir="$(mktemp -d)"
config_path="${config_dir}/config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions", "files", "context"]
  },
  "mouse_enabled": true
}
JSON

printf 'workspace boot file\n' >"${workspace_dir}/initial-file.txt"

"${repo_root}/.tools/emulator-server" \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "demo:${workspace_dir}" >"$log" 2>&1 &
srv=$!
tui_pid=""
creator_pid=""
cleanup() {
  if [ -n "${creator_pid:-}" ]; then
    kill "$creator_pid" 2>/dev/null || true
  fi
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

(
  sleep 3
  printf 'artifact created after tui startup\n' >"${workspace_dir}/agent-artifact.txt"
) &
creator_pid=$!

env GACT_CONFIG="$config_path" "${repo_root}/tui/gact" --backend "$backend" --workspace demo --no-intro &
tui_pid=$!
wait "$tui_pid"
