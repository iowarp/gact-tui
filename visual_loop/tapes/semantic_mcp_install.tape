Output "visual_loop/screenshots/semantic_mcp_install.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/mcp"
Enter
Wait+Screen /MCP/
Sleep 700ms

Type "i"
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_mcp_install.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
