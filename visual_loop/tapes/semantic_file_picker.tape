Output "visual_loop/screenshots/semantic_file_picker.gif"

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

Type "@"
Sleep 900ms
Screenshot "visual_loop/screenshots/semantic_file_picker.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
