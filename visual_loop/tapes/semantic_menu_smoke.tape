Output "visual_loop/screenshots/semantic_menu_smoke.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

# Help tab strip: verifies unified tab hit geometry still renders cleanly.
Type "?"
Sleep 300ms
Right
Right
Right
Right
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_help_commands.png"
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
Wait+Screen /Backend Metrics/
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
Wait+Screen /Tool/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_tool_detail.png"
Escape
Sleep 300ms

# Doctor tabs: verifies the health/capability tab strip uses the shared
# modal surface and render-time hit geometry.
Type "/doctor"
Enter
Wait+Screen /Doctor/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_doctor_health.png"
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_doctor_capabilities.png"
Escape
Sleep 300ms

Type "q"
