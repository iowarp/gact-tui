Output "visual_loop/screenshots/semantic_workspace_switch.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_workspace_switch.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Ctrl+W
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_workspace_switch.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
