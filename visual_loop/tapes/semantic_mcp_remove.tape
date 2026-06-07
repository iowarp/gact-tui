Output "visual_loop/screenshots/semantic_mcp_remove.gif"

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

Type "/"
Wait+Screen /Commands/
Type "mcp"
Enter
Wait+Screen /MCP Connections/
Sleep 700ms

Down
Down
Down
Down
Down
Wait+Screen /▌.*fake-mcp/
Type "d"
Wait+Screen /Remove MCP connection/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_mcp_remove.png"

Enter
Wait+Screen /confirm remove/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_mcp_remove_confirm.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
