Output "visual_loop/screenshots/semantic_mouse_drag_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_mouse_drag_copy.sh"
Enter
Show

Wait+Screen /sac result:/
Wait+Screen /release to copy/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_mouse_drag_copy_highlight.png"

Wait+Screen /copied visible text/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_mouse_drag_copy_done.png"
