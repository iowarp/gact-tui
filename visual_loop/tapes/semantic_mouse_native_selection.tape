Output "visual_loop/screenshots/semantic_mouse_native_selection.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_mouse_native_selection.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /Alt\+drag terminal select/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_mouse_native_selection_on.png"

Type "/mouse"
Enter
Wait+Screen /mouse mode: terminal select - drag selects text in the terminal/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_mouse_native_selection_off.png"

Type "q"
