#!/usr/bin/env bash
set -euo pipefail

port="${1:-41919}"
nc -lk 127.0.0.1 "$port" >/dev/null &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

./tui/gact --backend "http://127.0.0.1:${port}" --no-intro
