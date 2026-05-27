Output "visual_loop/screenshots/semantic_sidebar_filter.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Tab
Sleep 200ms
Type "f"
Sleep 200ms
Type "seeded"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_sidebar_filter.png"

Type "q"
