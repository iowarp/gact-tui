Output "visual_loop/screenshots/codex_quit_operator_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Ctrl+C
Wait+Screen /Session stays available/
Wait+Screen /close.*detach/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_quit_operator_copy.png"
