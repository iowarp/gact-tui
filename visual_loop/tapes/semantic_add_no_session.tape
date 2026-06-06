Output "visual_loop/screenshots/semantic_add_no_session.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_workspace.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /no sessions/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "add"
Wait+Screen /open add context/
Enter
Wait+Screen /no active session to add context/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_add_no_session.png"

Type "q"
