Output "visual_loop/screenshots/semantic_new_session_slash.gif"

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
Type "new"
Wait+Screen /Create a new session/
Enter
Wait+Screen /new session/
Wait+Screen /idle/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_new_session_slash.png"

Type "q"
