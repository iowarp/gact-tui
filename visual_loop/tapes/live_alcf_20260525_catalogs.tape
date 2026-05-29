Output "visual_loop/screenshots/live_alcf_20260525_catalogs.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_aae8071afb04 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/agents-list"
Enter
Wait+Screen /Agents/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_agents_catalog.png"
Down
Sleep 150ms
Down
Sleep 150ms
Enter
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_agent_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

Type "/skills"
Enter
Wait+Screen /Skills/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_skills_catalog.png"
Escape
Sleep 300ms

Type "/tools"
Enter
Wait+Screen /Tools/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_tools_catalog.png"
Enter
Wait+Screen /Tool ·/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_tool_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

Type "/mcp"
Enter
Wait+Screen /MCP/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_mcp_catalog.png"
Enter
Wait+Screen /MCP ·/
Sleep 900ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_mcp_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

Ctrl+C
