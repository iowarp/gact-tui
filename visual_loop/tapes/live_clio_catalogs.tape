Output "visual_loop/screenshots/live_clio_catalogs.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

# Agents catalog and first agent detail.
Type "/agents-list"
Enter
Wait+Screen /Agents/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_agents_catalog.png"
Enter
Wait+Screen /Agent ·/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_agent_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

# Tools catalog and tool detail.
Type "/tools"
Enter
Wait+Screen /Tools/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_tools_catalog.png"
Enter
Wait+Screen /Tool ·/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_tool_catalog_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

# MCP catalog and server detail.
Type "/mcp"
Enter
Wait+Screen /MCP/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_mcp_catalog.png"
Enter
Wait+Screen /MCP ·/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_mcp_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

Type "q"
