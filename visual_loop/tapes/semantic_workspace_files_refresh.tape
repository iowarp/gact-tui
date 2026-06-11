Output "visual_loop/screenshots/semantic_workspace_files_refresh.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_workspace_files_refresh.sh"
Enter
Show

Wait+Screen /analysis-only/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_files_refresh_before.png"

Ctrl+W
Wait+Screen /Switch workspace/
Up
Enter
Wait+Screen /clean-workspace/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_files_refresh_after.png"

Ctrl+C
Sleep 100ms
Ctrl+C
