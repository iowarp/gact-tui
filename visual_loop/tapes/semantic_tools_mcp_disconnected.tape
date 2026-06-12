Output "visual_loop/screenshots/semantic_tools_mcp_disconnected.gif"

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
Wait+Screen /Tools & MCP/
Wait+Screen /docs-mcp/
Wait+Screen /disconnected/
Wait+Screen /repair/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_tools_mcp_disconnected_catalog.png"

Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Wait+Screen /Enter connection detail/
Wait+Screen /r reconnect/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_tools_mcp_disconnected_selected.png"

Type "q"
