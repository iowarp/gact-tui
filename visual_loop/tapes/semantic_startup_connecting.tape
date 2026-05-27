Output "visual_loop/screenshots/semantic_startup_connecting.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_connecting_hang.sh"
Enter
Show

Wait+Screen /click to retry connection/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_startup_connecting.png"

Ctrl+C
