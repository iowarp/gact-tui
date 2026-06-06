Output "visual_loop/screenshots/semantic_narrow_operator_surfaces.gif"

Set Shell "bash"
Set FontSize 12
Set Width 1000
Set Height 620

Hide
Type "bash visual_loop/run_palette_long_commands.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/"
Wait+Screen /Commands/
Wait+Screen /Commands \[24\]/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_palette.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/tools"
Enter
Wait+Screen /Actions and MCP/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_tools_mcp.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_permissions_stress.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 1000ms
Type "/permissions"
Enter
Wait+Screen /approval requests/
Wait+Screen /shell needs approval/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_permissions.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_provider_edge_states.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 1000ms
Ctrl+S
Sleep 300ms
Enter
Wait+Screen /Provider/
Wait+Screen /unavailable/
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_narrow_provider_setup.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_semantic_event_detail.sh"
Enter
Wait+Screen /NDP catalog search completed/
Sleep 600ms
Tab
Sleep 200ms
Tab
Sleep 200ms
Ctrl+E
Wait+Screen /NDP catalog search result/
Wait+Screen /Operator view/
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_narrow_detail_view.png"
Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
