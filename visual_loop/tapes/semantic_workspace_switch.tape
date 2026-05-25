Output "visual_loop/screenshots/semantic_workspace_switch.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_690ac12e0908 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
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
