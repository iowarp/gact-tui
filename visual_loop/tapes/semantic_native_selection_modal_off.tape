Output "visual_loop/screenshots/semantic_native_selection_modal_off.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_mouse_native_selection.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Type "/mouse"
Enter
Wait+Screen /mouse mode: terminal select - drag selects text in the terminal/
Type "?"
Wait+Screen /Global/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_native_selection_modal_off.png"
