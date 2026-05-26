Output "visual_loop/screenshots/semantic_diff_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_diff_actions.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 300ms
Ctrl+n
Wait+Screen /new session/
Sleep 300ms
Type "propose a diff"
Enter
Wait+Screen /apply/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_diff_actions.png"

Ctrl+C
