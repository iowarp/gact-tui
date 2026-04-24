# CLIO-BBBBBBBBBB14 end-to-end smoke.
#
# Expects (driver script's job, not the tape's):
#   - clio-agent-gact-smoke running at $GACT_BACKEND with at least one
#     session already created (curl POST /v1/sessions before invoking VHS)
#   - /tmp/gact binary built from HEAD
#
# Proves: TUI loads the session list from a live clio-agent process,
# POSTs a message, receives routed assistant reply via SSE, renders
# the v0.2 routing badge + answer.

Output "/tmp/gact-clio-e2e.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms

# Matches data_expert via the scripted keyword table.
Type "please analyze /tmp/sample.parquet"
Enter

Sleep 4500ms
Screenshot "/home/jcernuda/tui/screenshots/clio_e2e.png"

Sleep 500ms
Type "q"
