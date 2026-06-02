#!/usr/bin/env bash
set -euo pipefail

port="${GACT_WORKSPACE_SWITCH_PORT:-41893}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-workspace.log"

mkdir -p /tmp/gact-analysis /tmp/gact-visual
printf 'workspace visual fixture\n' >/tmp/gact-visual/README.md
printf 'workspace analysis fixture\n' >/tmp/gact-analysis/README.md

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspaces "analysis:/tmp/gact-analysis,visual:/tmp/gact-visual" >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
