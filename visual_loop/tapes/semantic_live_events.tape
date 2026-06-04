Output "visual_loop/screenshots/semantic_live_events.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_semantic_live_events.sh"
Enter
Show

Wait+Screen /thinking/
Screenshot "visual_loop/screenshots/semantic_live_events_thinking.png"
Wait+Screen /ReadFile\(\)/
Screenshot "visual_loop/screenshots/semantic_live_events_tool_started.png"
Wait+Screen /package main/
Screenshot "visual_loop/screenshots/semantic_live_events_tool_result.png"
Wait+Screen /idle/
Screenshot "visual_loop/screenshots/semantic_live_events_final.png"
Sleep 300ms
Type "q"
