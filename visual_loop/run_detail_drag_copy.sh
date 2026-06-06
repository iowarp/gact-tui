#!/usr/bin/env bash
set -euo pipefail

expect <<'EXPECT'
set timeout 30
log_user 1

set env(TERM) xterm-256color
set env(TERM_PROGRAM) Apple_Terminal

spawn -noecho bash visual_loop/run_semantic_event_detail.sh
expect "NDP catalog search completed"
after 600
send "\t"
after 200
send "\t"
after 200
send "\005"
expect "NDP catalog search result"
after 500

# SGR mouse protocol, 1-based terminal-cell coordinates.
# Drag across the visible "status: completed" line in the detail modal.
send "\033\[<0;41;15M"
after 100
send "\033\[<32;57;15M"
after 3500
send "\033\[<0;57;15m"

expect "copied detail selection"
after 1200
send "q"
expect eof
EXPECT
