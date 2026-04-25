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

# Matches analysis_expert via the .parquet heuristic. Real Parquet
# tools run server-side via the deterministic short-circuit (no LM
# round-trip needed for an obvious file question), so the answer
# lands in <5s.
Type "Inspect the schema of /tmp/clio-demo/clio_demo.parquet"
Enter

Sleep 12000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_e2e.png"

Sleep 500ms
Type "q"
