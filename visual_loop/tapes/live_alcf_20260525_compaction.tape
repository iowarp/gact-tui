Output "visual_loop/screenshots/live_alcf_20260525_compaction.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_f2eb419f7ca0 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /demo context_pressure/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_compaction_top.png"
Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_compaction_detail.png"
Escape
Sleep 200ms
Type "G"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_compaction_bottom.png"

Ctrl+C
Sleep 200ms
Ctrl+C
