#!/usr/bin/env bash
set -euo pipefail

expect <<'EXPECT'
set timeout 30
log_user 1

set env(TERM) xterm-256color
set env(TERM_PROGRAM) Apple_Terminal

spawn -noecho visual_loop/run_semantic_earthscope_tool.sh
expect "sac result:"
after 500

# SGR mouse protocol, 1-based terminal-cell coordinates.
# left press, left-button drag motion, hold for VHS screenshot, release.
# Select a meaningful tool-result row rather than a tiny label so the
# captured proof shows a realistic operator copy workflow.
send "\033\[<0;34;15M"
after 100
send "\033\[<32;52;15M"
after 3500
send "\033\[<0;52;15m"

expect "copied visible text"
after 1200
send "q"
expect eof
EXPECT
