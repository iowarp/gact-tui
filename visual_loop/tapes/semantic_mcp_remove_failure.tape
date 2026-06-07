Output "visual_loop/screenshots/semantic_mcp_remove_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/mcp"
Enter
Wait+Screen /MCP Connections/
Wait+Screen /docs-mcp/
Wait+Screen /▌.*docs-mcp/
Type "d"
Wait+Screen /Remove MCP connection/
Wait+Screen /docs-mcp/

Enter
Wait+Screen /confirm remove/
Enter
Wait+Screen /MCP remove failed/
Wait+Screen /workspace profile/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_mcp_remove_failure.png"

Escape
Sleep 200ms
Escape
