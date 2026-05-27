Output "visual_loop/screenshots/live_alcf_20260525_ndp_scroll.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_aae8071afb04 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_ndp_bottom.png"

Tab
Sleep 200ms
Tab
Sleep 300ms
PageUp
Sleep 300ms
PageUp
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_ndp_scrolled_up.png"

Type "G"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_ndp_after_g.png"

PageUp
Sleep 300ms
PageDown
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_ndp_after_pagedown.png"

Ctrl+C
