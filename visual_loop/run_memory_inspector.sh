#!/usr/bin/env bash
set -euo pipefail

port="${GACT_MEMORY_PORT:-41889}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-memory.log"

.tools/emulator-server -port "$port" -timing fast >"$log" 2>&1 &
srv=$!
trap 'kill "$srv" 2>/dev/null || true' EXIT
sleep 0.3

exec ./tui/gact --backend "$backend" --no-intro
