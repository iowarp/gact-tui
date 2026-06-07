Output "visual_loop/screenshots/semantic_drop_backend_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_context_remove_failure.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /visual/
Sleep 1800ms

Type "/"
Wait+Screen /Commands/
Type "drop"
Wait+Screen /drop selected context/
Enter
Wait+Screen /remove failed/
Wait+Screen /visual/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_drop_backend_failure.png"

Type "q"
