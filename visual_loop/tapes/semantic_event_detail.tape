Output "visual_loop/screenshots/semantic_event_detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_event_detail.sh"
Enter
Show

Wait+Screen /NDP catalog search completed/
Sleep 600ms
Tab
Sleep 200ms
Tab
Sleep 200ms
Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_event_detail.png"
PageDown
PageDown
Wait+Screen /Tool evidence/
Wait+Screen /input: search_terms=seismic/
Screenshot "visual_loop/screenshots/semantic_event_detail_evidence.png"
Escape
Sleep 200ms
Type "q"
