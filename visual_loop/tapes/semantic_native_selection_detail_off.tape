Output "visual_loop/screenshots/semantic_native_selection_detail_off.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_event_detail.sh"
Enter
Show

Wait+Screen /NDP catalog search completed/
Type "/mouse"
Enter
Wait+Screen /mouse mode: terminal select - drag selects text in the terminal/
Type "	"
Sleep 200ms
Type "	"
Sleep 200ms
Type ""
Wait+Screen /NDP catalog search result/
Wait+Screen /y copy/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_native_selection_detail_off.png"
