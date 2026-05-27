Output "visual_loop/screenshots/semantic_right_sidebar_layout.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_right_sidebar_layout.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /CONTEXT/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_right_sidebar_layout.png"

Type "q"
