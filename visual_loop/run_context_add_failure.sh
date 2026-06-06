#!/usr/bin/env bash
set -euo pipefail

port="${GACT_CONTEXT_ADD_FAILURE_PORT:-41953}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-context-add-failure.log"
config_dir="$(mktemp -d)"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -context-add-failures >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$config_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

session_id="$(curl -fsS -X POST "${backend}/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"ws_default","title":"context add failure demo","agent":{"id":"default"}}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
