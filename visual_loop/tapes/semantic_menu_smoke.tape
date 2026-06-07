Output "visual_loop/screenshots/semantic_menu_smoke.gif"

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

# Help tab strip: verifies unified tab hit geometry still renders cleanly.
Type "?"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_help_global.png"
Right
Right
Right
Right
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_help_commands.png"
Right
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_help_permission.png"
Escape
Sleep 300ms

# Settings TUI tab: verifies the shared modal surface and fixed row targets.
Ctrl+S
Sleep 300ms
Tab
Tab
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_settings_tui.png"
Escape
Sleep 300ms

# Metrics modal: verifies informational detail sections use shared modal chrome.
Ctrl+T
Wait+Screen /Operations Metrics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_metrics.png"
Escape
Sleep 300ms

# Catalog list: verifies render-derived selectable rows and shared chrome.
Type "/tools"
Enter
Wait+Screen /Tools/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_tools_catalog.png"
Enter
Wait+Screen /Built-in tools/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_tool_detail.png"
Escape
Sleep 300ms
Escape
Sleep 300ms

# MCP connection list: verifies connection health is distinct from callable tools.
Type "/mcp"
Enter
Wait+Screen /MCP Connections/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_mcp_source_selected.png"
Enter
Wait+Screen /MCP ·/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_mcp_detail.png"
