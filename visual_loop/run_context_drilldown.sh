#!/usr/bin/env bash
set -euo pipefail

port="${GACT_CONTEXT_PORT:-41891}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-semantic-context.log"

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

curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  -d '{"path":"visual_loop/README.md","mode":"read"}' >/dev/null
curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  -d '{"path":"docs/ZERO_NINE_CAPABILITY_MATRIX.md","mode":"edit"}' >/dev/null
curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  -d '{"path":"tui/internal/ui/app.go","mode":"pin"}' >/dev/null

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
