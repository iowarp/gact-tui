Output "visual_loop/screenshots/semantic_settings_lists.gif"

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

Ctrl+S
Sleep 300ms
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_settings_agent.png"

Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_settings_theme.png"

Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_settings_tui.png"

Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_settings_language.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
