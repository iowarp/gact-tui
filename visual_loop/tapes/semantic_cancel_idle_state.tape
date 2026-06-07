Output "visual_loop/screenshots/semantic_cancel_idle_state.gif"

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

Type "/"
Wait+Screen /Commands/
Type "cancel"
Wait+Screen /Cancel/
Enter
Wait+Screen /nothing running in selected session/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_cancel_idle_state.png"

Type "q"
