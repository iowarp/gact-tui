#!/usr/bin/env bash
set -euo pipefail

port="${GACT_CONTEXT_REMOVE_FAILURE_PORT:-41947}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
path="visual_loop/README.md"
log="${TMPDIR:-/tmp}/gact-context-remove-failure.log"
config_dir="$(mktemp -d)"

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
  rm -rf "$config_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  -d "{\"path\":\"${path}\",\"mode\":\"read\"}" >/dev/null

(
  sleep 1.5
  curl -fsS -X DELETE "${backend}/v1/sessions/${session_id}/context/files" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"${path}\"}" >/dev/null || true
) &

XDG_CONFIG_HOME="$config_dir" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
