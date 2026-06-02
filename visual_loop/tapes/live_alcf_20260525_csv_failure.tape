Output "visual_loop/screenshots/live_alcf_20260525_csv_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_8ad20b4688f7 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_csv_failure_bottom.png"

Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 400ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_csv_failure_top.png"

Type "G"
Sleep 400ms
Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_csv_failure_detail.png"
Escape
Sleep 200ms
Ctrl+C
