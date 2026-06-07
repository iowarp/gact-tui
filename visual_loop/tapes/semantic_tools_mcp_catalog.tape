Output "visual_loop/screenshots/semantic_tools_mcp_catalog.gif"

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
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_tools_mcp_catalog.png"

Down
Wait+Screen /Enter details/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_tools_mcp_tool_selected.png"

Type "q"
