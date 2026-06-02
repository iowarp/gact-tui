Output "visual_loop/screenshots/semantic_startup_error.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "./tui/gact --backend http://127.0.0.1:9 --no-intro"
Enter
Show

Wait+Screen /Connection error/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_startup_error.png"

Ctrl+C
