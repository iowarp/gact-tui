Output "visual_loop/screenshots/semantic_startup_intro.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_startup_intro.sh"
Enter
Show

Wait+Screen /pick model or expert/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_startup_intro.png"

Ctrl+C
