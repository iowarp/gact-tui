Output "visual_loop/screenshots/semantic_native_selection_detail_on.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_event_detail.sh"
Enter
Show

Wait+Screen /NDP catalog search completed/
Type "	"
Sleep 200ms
Type "	"
Sleep 200ms
Type ""
Wait+Screen /NDP catalog search result/
Wait+Screen /Alt\+drag terminal select/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_native_selection_detail_on.png"
