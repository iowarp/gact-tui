Output "visual_loop/screenshots/semantic_workspace_files_live_refresh.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_workspace_files_live_refresh.sh"
Enter
Show

Wait+Screen /initial-file/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_files_live_refresh_before.png"

Wait+Screen /agent-artifact/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_files_live_refresh_after.png"

Ctrl+C
Sleep 100ms
Ctrl+C
