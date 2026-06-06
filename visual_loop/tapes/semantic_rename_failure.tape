Output "visual_loop/screenshots/semantic_rename_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_rename_failure.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /seeded session 1/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "rename"
Wait+Screen /rename/
Enter
Wait+Screen /Rename session/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_rename_failure_modal.png"

Ctrl+U
Type "reserved demo failure"
Enter
Wait+Screen /rename failed:/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_rename_failure_toast.png"

Type "q"
