#!/usr/bin/env bash
set -euo pipefail

port="${GACT_BLUEPRINT_TREE_PORT:-41932}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-agent-blueprint-tree-stress.log"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -long-agent-blueprints \
  -seed-sessions "ws_default=1" \
  -active-agent-blueprint "san-diego-earthscope-and-ndp-live-benchmark-review-with-very-long-name" >"$log" 2>&1 &
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
  if curl -fsS "${backend}/v1/agent-blueprints" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
