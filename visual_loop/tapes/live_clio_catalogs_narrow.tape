Output "visual_loop/screenshots/live_clio_catalogs_narrow.gif"

Set Shell "bash"
Set FontSize 14
Set Width 960
Set Height 720

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/tools"
Enter
Wait+Screen /Tools/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_tools_catalog_narrow.png"

Enter
Wait+Screen /Tool ·/
Sleep 700ms
Screenshot "visual_loop/screenshots/live_clio_tool_detail_narrow.png"

Escape
Sleep 300ms
Type "q"
