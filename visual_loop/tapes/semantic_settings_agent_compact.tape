Output "visual_loop/screenshots/semantic_settings_agent_compact.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1300
Set Height 420

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
Screenshot "visual_loop/screenshots/semantic_settings_agent_compact.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
