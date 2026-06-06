Output "visual_loop/screenshots/semantic_workspace_create_failures.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_workspace_switch.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Ctrl+W
Wait+Screen /Switch workspace/
Type "n"
Wait+Screen /Open workspace from Folder/
Tab
Ctrl+A
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Type "relative/path"
Enter
Wait+Screen /absolute local path/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_create_invalid_root.png"

Ctrl+A
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Type "/tmp/gact-analysis"
Enter
Wait+Screen /already registered/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_create_existing_conflict.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Type "q"
