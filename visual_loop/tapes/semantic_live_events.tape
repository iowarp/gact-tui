Output "visual_loop/screenshots/semantic_live_events.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_semantic_live_events.sh"
Enter
Show

Wait+Screen /ReadFile/
Screenshot "visual_loop/screenshots/semantic_live_events_running.png"
Wait+Screen /idle/
Screenshot "visual_loop/screenshots/semantic_live_events_final.png"
Sleep 300ms
Type "q"
