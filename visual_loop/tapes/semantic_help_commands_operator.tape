Output "visual_loop/screenshots/semantic_help_commands_operator.gif"

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
Right
Right
Wait+Screen /Commands/
Wait+Screen /Runtime/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_help_commands_operator.png"

Type "q"
