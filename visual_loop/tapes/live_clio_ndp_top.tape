Output "visual_loop/screenshots/live_clio_ndp_top.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
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
Screenshot "visual_loop/screenshots/live_clio_ndp_top.png"

Type "j"
Sleep 200ms
Type "j"
Sleep 200ms
Type "j"
Sleep 200ms
Screenshot "visual_loop/screenshots/live_clio_ndp_tool_selection.png"

Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_ndp_tool_detail.png"

Escape
Sleep 200ms
Type "q"
