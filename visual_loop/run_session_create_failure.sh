#!/usr/bin/env bash
set -euo pipefail

mode="${1:-new}"
port="${GACT_SESSION_CREATE_FAILURE_PORT:-41952}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-session-create-failure.log"
config_dir="$(mktemp -d)"
session_id=""

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -session-create-failures >"$log" 2>&1 &
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

if [ "$mode" = "duplicate" ]; then
  session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
    -H 'Content-Type: application/json' \
    -d '{"format":"gact-v1","session":{"workspace_id":"ws_default","title":"seismic review","agent":{"id":"seismic_waveform"},"status":"idle"},"messages":[]}' |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  GACT_ATTACH_SESSION_ID="$session_id" XDG_CONFIG_HOME="$config_dir" ./tui/gact --backend "$backend" --no-intro &
else
  XDG_CONFIG_HOME="$config_dir" ./tui/gact --backend "$backend" --no-intro &
fi

tui_pid=$!
wait "$tui_pid"
