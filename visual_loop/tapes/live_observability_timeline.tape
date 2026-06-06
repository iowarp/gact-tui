Output "visual_loop/screenshots/live_observability_timeline.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_live_observability_tui.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Screenshot "visual_loop/screenshots/live_observability_tui_00_start.png"
Sleep 3500ms
Screenshot "visual_loop/screenshots/live_observability_tui_01_route.png"
Sleep 3000ms
Screenshot "visual_loop/screenshots/live_observability_tui_02_tools.png"
Sleep 5000ms
Screenshot "visual_loop/screenshots/live_observability_tui_03_late_tools.png"
Sleep 10000ms
Screenshot "visual_loop/screenshots/live_observability_tui_04_settled.png"
Sleep 300ms
Type "q"
