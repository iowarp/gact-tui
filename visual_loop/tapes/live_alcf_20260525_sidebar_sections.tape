Output "visual_loop/screenshots/live_alcf_20260525_sidebar_sections.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_3b3102631306 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms
Tab
Sleep 300ms

Type "g"
Sleep 500ms
Up
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_header_focused.png"

Type "S"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_collapsed.png"

Down
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_sidebar_context_focused.png"

Enter
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_collapsed.png"

Up
Sleep 300ms
Enter
Sleep 300ms
Type "C"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_expanded.png"

Ctrl+C
