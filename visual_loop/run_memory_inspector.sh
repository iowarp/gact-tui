#!/usr/bin/env bash
set -euo pipefail

port="${GACT_MEMORY_PORT:-41889}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-memory.log"

.tools/emulator-server -port "$port" -timing fast >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
sleep 0.3

./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
