#!/usr/bin/env bash
set -euo pipefail

port="${GACT_PROVIDER_AUTH_SUCCESS_PORT:-41961}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-provider-auth-success.log"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-sessions ws_default=1 \
  -seed-messages "${session_id}=1" \
  -provider-edge-states \
  -provider-auth-succeeds >"$log" 2>&1 &
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

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
