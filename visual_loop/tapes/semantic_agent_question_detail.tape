Output "visual_loop/screenshots/semantic_agent_question_detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_question_detail.sh"
Enter
Show

Wait+Screen /Pick the seismic workspace path/
Sleep 600ms
Tab
Sleep 200ms
Tab
Sleep 200ms
Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_agent_question_detail.png"
Escape
Sleep 200ms
Type "q"
