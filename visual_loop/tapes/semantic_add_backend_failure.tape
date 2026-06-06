Output "visual_loop/screenshots/semantic_add_backend_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_context_add_failure.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /context add failure/
Wait+Screen /no files/
Sleep 300ms

Type "/"
Wait+Screen /Commands/
Type "add"
Wait+Screen /open add context/
Enter
Wait+Screen /Add file to context/
Type "docs/readme.md"
Enter
Wait+Screen /add failed/
Wait+Screen /workspace file index is temporarily unavailable/
Wait+Screen /no files/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_add_backend_failure.png"

Type "q"
