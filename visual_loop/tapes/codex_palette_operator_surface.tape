Output "visual_loop/screenshots/codex_palette_operator_surface.gif"

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

Type "/"
Wait+Screen /Commands/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_palette_operator_default.png"

Enter
Wait+Screen /Copy the selected conversation block/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_session_group.png"

Backspace
Wait+Screen /Runtime/
Sleep 200ms

Tab
Tab
Tab
Wait+Screen /Browse actions and MCP/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_catalog_group.png"

Type "tools"
Wait+Screen /Browse actions and MCP/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_catalog_filter.png"

Escape
Sleep 200ms
Type "/"
Wait+Screen /Commands/
Type "mcp"
Wait+Screen /Manage MCP connections/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_mcp_filter.png"

Escape
Sleep 200ms
Type "/"
Wait+Screen /Commands/
Enter
Wait+Screen /Copy the selected conversation block/
Backspace
Wait+Screen /Runtime/
Tab
Tab
Tab
Tab
Tab
Wait+Screen /Expert settings/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_settings_group.png"

Escape
Sleep 200ms
Type "/"
Wait+Screen /Commands/
Type "theme"
Wait+Screen /Pick a color palette/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_palette_operator_theme_filter.png"

Escape
Sleep 200ms
Type "q"
