Output "visual_loop/screenshots/semantic_help_conversation_copy.gif"

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

Type "?"
Wait+Screen /Global/
Right
Right
Wait+Screen /Conversation/
Wait+Screen /Drag/
Wait+Screen /Alt\+drag/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_help_conversation_copy.png"

Type "q"
