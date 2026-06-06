Output "visual_loop/screenshots/semantic_mouse_drag_copy_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_mouse_drag_copy_failure.sh"
Enter
Show

Wait+Screen /sac result:/
Wait+Screen /copy failed/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_mouse_drag_copy_failure_done.png"
