Output "visual_loop/screenshots/semantic_new_session_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_session_create_failure.sh new"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /no sessions/
Sleep 300ms

Type "/"
Wait+Screen /Commands/
Type "new"
Wait+Screen /Create a new session/
Enter
Wait+Screen /session create failed/
Wait+Screen /workspace registry is temporarily unavailable/
Wait+Screen /no sessions/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_new_session_failure.png"

Type "q"
