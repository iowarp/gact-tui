Output "visual_loop/screenshots/live_alcf_20260525_scatter.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_8ec382da38a3 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_scatter_partial.png"

Tab
Sleep 200ms
Tab
Sleep 300ms
Type "G"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_scatter_bottom.png"

Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_scatter_detail.png"
Escape
Sleep 200ms
Ctrl+C
