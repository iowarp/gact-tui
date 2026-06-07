Output "visual_loop/screenshots/semantic_native_selection_modal_on.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_mouse_native_selection.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Type "?"
Wait+Screen /Global/
Wait+Screen /Alt\+drag/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_native_selection_modal_on.png"
