Output "visual_loop/screenshots/semantic_workspace_startup_selected.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_START_WORKSPACE=analysis bash visual_loop/run_workspace_switch.sh"
Enter
Show

Wait+Screen /workspace: analysis/
Sleep 1200ms
Screenshot "visual_loop/screenshots/semantic_workspace_startup_selected.png"

Ctrl+C
Sleep 100ms
Ctrl+C
