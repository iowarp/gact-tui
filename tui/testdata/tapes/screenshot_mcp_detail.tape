Output "/tmp/gact-mcp-detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

# Open the MCP catalog browser
Type "/mcp"
Sleep 600ms
Enter
Sleep 800ms

# Drill into the first MCP server (mcp_fake)
Enter
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/68-mcp-detail.png"

# Back out + close
Escape
Sleep 200ms
Escape
Sleep 200ms
Type "q"
