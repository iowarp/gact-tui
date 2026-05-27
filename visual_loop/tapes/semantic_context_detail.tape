Output "visual_loop/screenshots/semantic_context_detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_context_drilldown.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /CONTEXT/
Sleep 800ms

Tab
Sleep 300ms
Right
Sleep 300ms
Down
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_context_row_selected.png"

Enter
Wait+Screen /Context file/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_context_detail.png"

Escape
Sleep 200ms
Ctrl+C
