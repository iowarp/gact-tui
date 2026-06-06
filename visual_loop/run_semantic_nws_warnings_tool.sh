#!/usr/bin/env bash
set -euo pipefail

port="${GACT_SEMANTIC_NWS_WARNINGS_PORT:-41916}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-semantic-nws-warnings-tool.log"
config_dir="$(mktemp -d)"
config_path="${config_dir}/config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions"],
    "right": []
  }
}
JSON

.tools/emulator-server \
  -port "$port" \
  -timing realistic \
  -seed-sessions ws_default=1 >"$log" 2>&1 &
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

for _ in $(seq 1 60); do
  if curl -fsS "${backend}/v1/sessions?workspace_id=ws_default" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

(
  sleep 1.0
  curl -fsS -X POST "${backend}/v1/sessions/${session_id}/messages" \
    -H 'Content-Type: application/json' \
    -d '{"parts":[{"type":"text","text":"nws warning demo"}]}' >/dev/null
) &

env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
