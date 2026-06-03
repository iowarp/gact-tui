Output "visual_loop/screenshots/semantic_session_summary.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/compact"
Enter
Wait+Screen /summary:/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_session_summary.png"

Type "q"
