#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${GACT_WORKSPACE_FILES_REFRESH_PORT:-41961}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-workspace-files-refresh.log"
config_dir="$(mktemp -d)"
analysis_dir="$(mktemp -d)"
clean_dir="$(mktemp -d)"
config_path="${config_dir}/config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions", "files", "context"]
  },
  "mouse_enabled": true
}
JSON

printf 'analysis workspace fixture\n' >"${analysis_dir}/analysis-only.txt"
printf 'clean workspace fixture\n' >"${clean_dir}/clean-workspace-marker.txt"

"${repo_root}/.tools/emulator-server" \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "analysis:${analysis_dir},clean:${clean_dir}" >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$config_dir" "$analysis_dir" "$clean_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

env GACT_CONFIG="$config_path" "${repo_root}/tui/gact" --backend "$backend" --workspace analysis --no-intro &
tui_pid=$!
wait "$tui_pid"
