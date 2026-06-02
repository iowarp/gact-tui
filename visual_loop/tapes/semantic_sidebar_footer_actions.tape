Output "visual_loop/screenshots/semantic_sidebar_footer_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_DIFF_ACTIONS_PORT=41929 visual_loop/run_diff_actions.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 300ms
Ctrl+n
Wait+Screen /new session/
Sleep 300ms
Tab
Wait+Screen /e rename/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_sidebar_footer_actions.png"

Ctrl+C
