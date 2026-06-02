Output "visual_loop/screenshots/semantic_session_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 500ms

Tab
Sleep 200ms
Type "m"
Wait+Screen /Session actions|Open conversation/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_session_actions.png"

Type "q"
