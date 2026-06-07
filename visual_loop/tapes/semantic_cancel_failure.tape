Output "visual_loop/screenshots/semantic_cancel_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_cancel_failure.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /cancel failure demo/
Wait+Screen /running/
Sleep 300ms

Type "/"
Wait+Screen /Commands/
Type "cancel"
Wait+Screen /Cancel current run/
Enter
Wait+Screen /cancel failed/
Wait+Screen /runtime supervisor did not acknowledge/
Wait+Screen /running/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_cancel_failure.png"

Type "q"
