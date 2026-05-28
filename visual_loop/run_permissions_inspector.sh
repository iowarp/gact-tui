#!/usr/bin/env bash
set -euo pipefail

port="${GACT_PERMISSIONS_INSPECTOR_PORT:-41896}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-semantic-permissions.log"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-sessions ws_default=1 \
  -seed-messages "${session_id}=1" >"$log" 2>&1 &
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

curl -fsS -X PUT "${backend}/v1/policies" \
  -H 'content-type: application/json' \
  -d '{"policies":[{"scope":"workspace","tool_name_pattern":"shell","path_pattern":"/tmp/**","action":"ask"}]}' >/dev/null

curl -fsS -X POST "${backend}/v1/sessions/${session_id}/messages" \
  -H 'content-type: application/json' \
  -d '{"parts":[{"type":"text","text":"delete the scratch output directory"}]}' >/dev/null

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/permissions?session_id=${session_id}" | grep -q '"id"'; then
    break
  fi
  sleep 0.1
done

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
