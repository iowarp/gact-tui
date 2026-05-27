#!/usr/bin/env bash
set -euo pipefail

port="${1:-41919}"
nc -lk 127.0.0.1 "$port" >/dev/null &
pid=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

./tui/gact --backend "http://127.0.0.1:${port}" --no-intro &
tui_pid=$!
wait "$tui_pid"
