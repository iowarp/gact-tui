Output "/tmp/gact-catalog.gif"

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

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# /mcp → MCP servers list
Type "/mcp"
Sleep 300ms
Enter
Sleep 700ms
Screenshot "/home/jcernuda/tui/screenshots/51-catalog-mcp.png"
Escape
Sleep 300ms

# /tools → tools list
Type "/tools"
Sleep 300ms
Enter
Sleep 700ms
Screenshot "/home/jcernuda/tui/screenshots/52-catalog-tools.png"
Escape
Sleep 300ms

# /skills → stub row
Type "/skills"
Sleep 300ms
Enter
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/53-catalog-skills.png"
Escape
Sleep 300ms

Sleep 200ms
