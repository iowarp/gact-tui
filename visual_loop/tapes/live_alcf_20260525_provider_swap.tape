Output "visual_loop/screenshots/live_alcf_20260525_provider_swap.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_286ec4360014 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /demo provider_swap/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_provider_swap_top.png"
Type "G"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_provider_swap_bottom.png"

Ctrl+C
Sleep 200ms
Ctrl+C
