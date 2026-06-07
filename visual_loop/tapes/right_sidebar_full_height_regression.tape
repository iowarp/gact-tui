Output "visual_loop/screenshots/right_sidebar_full_height_regression.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_right_sidebar_layout.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Screenshot "visual_loop/screenshots/right_sidebar_full_height_regression.png"
Sleep 300ms
Type "q"
