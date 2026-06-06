#!/usr/bin/env bash
set -euo pipefail

port="${GACT_PROMPT_STRESS_PORT:-41946}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-prompt-stress.log"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-sessions ws_default=1 \
  -active-agent-blueprint seismic-waveform-review \
  -prompt-stress \
  -prompt-save-failures >"$log" 2>&1 &
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

./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"
