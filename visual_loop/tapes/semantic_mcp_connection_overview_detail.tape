Output "visual_loop/screenshots/semantic_mcp_connection_overview_detail.gif"

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
Sleep 300ms
Down
Down
Down
Down
Down
Enter
Wait+Screen /Connection overview/
Sleep 300ms
Enter
Wait+Screen /Technical details/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_mcp_connection_overview_detail.png"

Type "q"
