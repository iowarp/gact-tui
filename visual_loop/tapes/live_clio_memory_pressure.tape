Output "visual_loop/screenshots/live_clio_memory_pressure.gif"

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

Type "/"
Sleep 150ms
Type "memory"
Sleep 300ms
Enter
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_clio_memory_pressure.png"
Escape
Sleep 300ms

Type "q"
