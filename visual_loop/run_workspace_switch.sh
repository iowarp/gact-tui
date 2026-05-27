#!/usr/bin/env bash
set -euo pipefail

port="${GACT_WORKSPACE_SWITCH_PORT:-41893}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-semantic-workspace.log"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspaces "analysis:/tmp/gact-analysis,visual:/tmp/gact-visual" >"$log" 2>&1 &
srv=$!
trap 'kill "$srv" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

exec ./tui/gact --backend "$backend" --no-intro
