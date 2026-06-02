Output "visual_loop/screenshots/semantic_compose_modal.gif"

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

Type "Review this workflow"
Sleep 200ms
Ctrl+G
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_compose_modal.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
