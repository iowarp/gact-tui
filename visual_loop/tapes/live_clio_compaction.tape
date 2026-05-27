Output "visual_loop/screenshots/live_clio_compaction.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_530d7025d35f ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_clio_compaction_top.png"
Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_compaction_detail.png"
Escape
Sleep 200ms
Type "G"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_compaction_bottom.png"

Ctrl+C
Sleep 200ms
Ctrl+C
