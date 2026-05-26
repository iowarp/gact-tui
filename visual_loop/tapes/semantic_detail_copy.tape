Output "visual_loop/screenshots/semantic_detail_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_DIFF_ACTIONS_PORT=41930 visual_loop/run_diff_actions.sh"
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
Tab
Sleep 150ms
Tab
Sleep 150ms
Ctrl+E
Wait+Screen /copy/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_detail_copy.png"

Ctrl+C
