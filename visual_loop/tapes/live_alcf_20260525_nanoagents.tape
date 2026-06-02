Output "visual_loop/screenshots/live_alcf_20260525_nanoagents.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_3b3102631306 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_nanoagents_collapsed.png"

Tab
Sleep 300ms
Type "c"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_nanoagents_expanded.png"

Down
Sleep 150ms
Down
Sleep 150ms
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_nanoagent_child_open.png"

Ctrl+C
