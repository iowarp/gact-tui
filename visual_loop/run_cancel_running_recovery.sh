#!/usr/bin/env bash
set -euo pipefail

port="${GACT_CANCEL_RUNNING_PORT:-41949}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-cancel-running-recovery.log"
config_dir="$(mktemp -d)"

.tools/emulator-server \
  -port "$port" \
  -timing fast >"$log" 2>&1 &
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
  -d '{"workspace_id":"ws_default","title":"running seismic review","agent":{"id":"seismic_waveform"}}' |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

curl -fsS -X PATCH "${backend}/v1/sessions/${session_id}" \
  -H 'Content-Type: application/json' \
  -d '{"status":"running"}' >/dev/null

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
