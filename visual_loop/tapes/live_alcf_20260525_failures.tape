Output "visual_loop/screenshots/live_alcf_20260525_failures.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_2c4a75e36258 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_scatter_partial.png"

# Move to transcript, jump to bottom, and expand the selected failure/summary block.
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "G"
Sleep 300ms
Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_scatter_partial_detail.png"
Escape
Sleep 200ms
Type "q"
Sleep 500ms

Hide
Type "GACT_ATTACH_SESSION_ID=sess_cd8fc09979a7 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_expected_errors.png"

Tab
Sleep 200ms
Tab
Sleep 300ms
Type "G"
Sleep 300ms
Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_expected_error_detail.png"
Escape
Sleep 200ms
Type "q"
