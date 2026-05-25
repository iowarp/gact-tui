Output "visual_loop/screenshots/semantic_permission_banner.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_permission_banner.sh"
Enter
Show

Wait+Screen /SESSIONS/
Sleep 500ms
Ctrl+N
Wait+Screen /session:/
Sleep 500ms
Type "delete the temp directory"
Enter
Wait+Screen /Permission needed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permission_banner.png"

Type "q"
