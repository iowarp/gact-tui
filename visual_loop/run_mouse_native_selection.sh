#!/usr/bin/env bash
set -euo pipefail

port="${GACT_MOUSE_NATIVE_PORT:-41934}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-mouse-native-selection.log"
config_dir="$(mktemp -d "${TMPDIR:-/tmp}/gact-mouse-native-selection.XXXXXX")"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-sessions ws_default=4 \
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

env \
  GACT_ATTACH_SESSION_ID="$session_id" \
  GACT_CONFIG="$config_dir/config.json" \
  ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
