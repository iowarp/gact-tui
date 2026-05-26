Output "visual_loop/screenshots/semantic_settings_lists.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_690ac12e0908 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
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
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_settings_language.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
