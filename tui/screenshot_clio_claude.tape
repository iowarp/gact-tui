# CLIO-BBBBBBBBBB-D: TUI driving clio-agent-gact backed by real Claude
# via Meridian. Haiku so it's cheap + fast — ~10s per turn.

Output "/tmp/gact-clio-claude.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms

# Conversational question so CLIO's router lands on "chat" / "none"
# (the data expert's MCP tool chain needs config we don't have here).
Type "Which scientific file format suits time-series data best. one sentence."
Enter

Sleep 25000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_claude_live.png"

Sleep 500ms
Type "q"
