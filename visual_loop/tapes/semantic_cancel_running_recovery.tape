Output "visual_loop/screenshots/semantic_cancel_running_recovery.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_cancel_running_recovery.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /running seismic re/
Wait+Screen /running/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_cancel_running_before.png"

Type "/"
Wait+Screen /Commands/
Type "cancel"
Wait+Screen /Cancel current run/
Wait+Screen /status: running/
Enter
Wait+Screen /cancelling run/
Wait+Screen /idle/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_cancel_running_recovery.png"

Type "q"
