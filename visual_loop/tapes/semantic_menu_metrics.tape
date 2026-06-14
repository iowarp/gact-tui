Output "visual_loop/screenshots/semantic_menu_metrics.gif"

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
Sleep 150ms
Tab
Sleep 150ms
Type "Y"
Wait+Screen /copied full conversation/
Sleep 300ms
Tab
Sleep 150ms

Type "/metrics"
Enter
Wait+Screen /Operations Metrics/
Wait+Screen /full conversation copy/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_metrics.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
