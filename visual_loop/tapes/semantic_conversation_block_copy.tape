Output "visual_loop/screenshots/semantic_conversation_block_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_DIFF_ACTIONS_PORT=41931 visual_loop/run_diff_actions.sh"
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
Type "y"
Wait+Screen /copied/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_conversation_block_copy.png"

Ctrl+C
