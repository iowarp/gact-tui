Output "visual_loop/screenshots/semantic_theme_cycle.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_theme_cycle.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_theme_cycle_before.png"

Type "/theme-next"
Enter
Wait+Screen /theme:/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_theme_cycle_next.png"

Type "/theme-prev"
Enter
Wait+Screen /theme:/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_theme_cycle_prev.png"

Type "q"
