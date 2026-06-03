Output "visual_loop/screenshots/clio_semantic_live_events.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_clio_semantic_live_events.sh"
Enter
Show

Wait+Screen /tool.call.started/
Tab
Sleep 100ms
Tab
Sleep 100ms
Type "G"
Sleep 200ms
Screenshot "visual_loop/screenshots/clio_semantic_live_events_running.png"
Wait+Screen /idle/
Type "G"
Sleep 200ms
Screenshot "visual_loop/screenshots/clio_semantic_live_events_final.png"
Sleep 300ms
Type "q"
