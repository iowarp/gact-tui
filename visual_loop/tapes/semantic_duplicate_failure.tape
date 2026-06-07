Output "visual_loop/screenshots/semantic_duplicate_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_session_create_failure.sh duplicate"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /seismic review/
Wait+Screen /idle/
Sleep 300ms

Type "/"
Wait+Screen /Commands/
Type "duplicate"
Wait+Screen /Copy title and expert/
Enter
Wait+Screen /duplicate failed/
Wait+Screen /workspace registry is temporarily unavailable/
Wait+Screen /seismic review/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_duplicate_failure.png"

Type "q"
