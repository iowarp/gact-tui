#!/usr/bin/env bash
set -euo pipefail

port="${GACT_DIFF_ACTIONS_PORT:-41920}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-diff-actions.log"

.tools/emulator-server -port "$port" -timing fast >"$log" 2>&1 &
srv=$!
trap 'kill "$srv" 2>/dev/null || true' EXIT
sleep 0.3

exec ./tui/gact --backend "$backend" --no-intro
