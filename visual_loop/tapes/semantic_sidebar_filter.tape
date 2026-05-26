Output "visual_loop/screenshots/semantic_sidebar_filter.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_08ebaf83905e ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Tab
Sleep 200ms
Type "f"
Sleep 200ms
Type "ndp"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_sidebar_filter.png"

Type "q"
