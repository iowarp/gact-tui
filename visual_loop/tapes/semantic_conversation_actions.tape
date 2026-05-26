Output "visual_loop/screenshots/semantic_conversation_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 500ms

Tab
Sleep 200ms
Tab
Sleep 200ms
Type "m"
Wait+Screen /Conversation actions|Copy block/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_conversation_actions.png"

Type "q"
