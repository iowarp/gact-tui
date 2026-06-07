Output "visual_loop/screenshots/semantic_mcp_reconnect.gif"

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
Wait+Screen /MCP Connections/
Sleep 500ms

Down
Down
Down
Down
Down
Enter
Wait+Screen /Connection capabilities/
Wait+Screen /r reconnect/
Screenshot "visual_loop/screenshots/semantic_mcp_reconnect_detail.png"

Type "r"
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_mcp_reconnect_done.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
