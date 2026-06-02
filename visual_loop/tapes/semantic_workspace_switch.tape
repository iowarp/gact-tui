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
Screenshot "visual_loop/screenshots/semantic_workspace_header_root.png"

Ctrl+W
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_workspace_switch.png"

Type "n"
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_workspace_create_form.png"

Escape
Sleep 100ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
