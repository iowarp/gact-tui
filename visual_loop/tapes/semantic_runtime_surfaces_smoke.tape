Output "visual_loop/screenshots/semantic_runtime_surfaces_smoke.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

# MCP source list: verifies source health is distinct from callable tools.
Type "/mcp"
Enter
Wait+Screen /Actions and MCP/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_mcp_connections.png"
Down
Down
Down
Down
Sleep 200ms
Screenshot "visual_loop/screenshots/semantic_menu_mcp_source_selected.png"
Enter
Wait+Screen /MCP ·/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_mcp_detail.png"
