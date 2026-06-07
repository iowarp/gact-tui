#!/usr/bin/env bash
set -euo pipefail

expect <<'EXPECT'
set timeout 30
log_user 1

set env(TERM) xterm-256color
set env(TERM_PROGRAM) Apple_Terminal
set env(GACT_CLIPBOARD_FORCE_FAILURE) 1

spawn -noecho bash visual_loop/run_semantic_earthscope_tool.sh
expect "sac result:"
after 500

# SGR mouse protocol, 1-based terminal-cell coordinates.
# Select a meaningful tool-result row, then release. The forced
# clipboard failure keeps this deterministic across developer hosts.
send "\033\[<0;34;15M"
after 100
send "\033\[<32;52;15M"
after 7000
send "\033\[<0;52;15m"

expect "copy failed"
after 1200
send "q"
expect eof
EXPECT
