Output "visual_loop/screenshots/semantic_permissions_inspector.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_permissions_inspector.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/permissions"
Enter
Wait+Screen /Review queue/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_permissions_inspector.png"

Type "d"
Wait+Screen /no pending requests/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permissions_inspector_denied.png"

Type "q"
