Output "visual_loop/screenshots/semantic_drop_no_context.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /\(no files\)/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "drop"
Wait+Screen /drop selected context/
Enter
Wait+Screen /no context file selected to drop/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_drop_no_context.png"

Type "q"
