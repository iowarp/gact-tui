Output "visual_loop/screenshots/codex_part_detail_labels.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_semantic_live_events.sh"
Enter
Show

Wait+Screen /package main/
Sleep 500ms
Tab
Tab
Sleep 200ms
Up
Enter
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_part_detail_labels.png"
Sleep 300ms
Type "q"
