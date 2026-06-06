#!/usr/bin/env bash
set -euo pipefail

port="${GACT_EMPTY_TOOLS_PORT:-41930}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-empty-tools.log"

.tools/emulator-server -port "$port" -timing fast -empty-tools -empty-mcp-connections >"$log" 2>&1 &
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
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
