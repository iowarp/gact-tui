Output "visual_loop/screenshots/semantic_startup_intro.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "./tui/gact --backend http://127.0.0.1:41917"
Enter
Show

Wait+Screen /press any key to continue/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_startup_intro.png"

Ctrl+C
