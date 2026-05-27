Output "visual_loop/screenshots/semantic_conversation_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
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
