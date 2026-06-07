Output "visual_loop/screenshots/semantic_conversation_footer_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 2600
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
Type "hello from footer actions"
Enter
Wait+Screen /ASSISTANT/
Sleep 700ms
Tab
Sleep 200ms
Tab
Wait+Screen /drag CLIO copy/
Wait+Screen /Alt\+drag terminal select/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_conversation_footer_actions.png"

Ctrl+C
