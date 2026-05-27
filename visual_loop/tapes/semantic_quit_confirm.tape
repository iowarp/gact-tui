Output "visual_loop/screenshots/semantic_quit_confirm.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Ctrl+C
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_quit_confirm.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
