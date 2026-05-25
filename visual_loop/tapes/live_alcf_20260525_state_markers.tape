Output "visual_loop/screenshots/live_alcf_20260525_state_markers.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_286ec4360014 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_provider_swap_top.png"
Type "G"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_provider_swap_bottom.png"
Ctrl+C
Sleep 300ms

Hide
Type "GACT_ATTACH_SESSION_ID=sess_f2eb419f7ca0 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
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
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_compaction_bottom.png"
Ctrl+C
