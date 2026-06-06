Output "visual_loop/screenshots/semantic_detail_drag_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_detail_drag_copy.sh"
Enter
Show

Wait+Screen /NDP catalog search result/
Wait+Screen /release to copy/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_detail_drag_copy_highlight.png"

Wait+Screen /copied detail selection/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_detail_drag_copy_done.png"
