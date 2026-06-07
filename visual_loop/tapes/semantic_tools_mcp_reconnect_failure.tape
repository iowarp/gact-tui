Output "visual_loop/screenshots/semantic_tools_mcp_reconnect_failure.gif"

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

Type "/tools"
Enter
Wait+Screen /Actions and MCP/
Wait+Screen /docs-mcp/
Wait+Screen /needs attent/

Down
Down
Down
Down
Down
Down
Down
Down
Wait+Screen /r reconnect/
Type "r"
Wait+Screen /MCP reconnect failed/
Wait+Screen /probe failed/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_tools_mcp_reconnect_failure.png"

Type "q"
