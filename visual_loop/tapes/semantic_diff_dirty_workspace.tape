Output "visual_loop/screenshots/semantic_diff_dirty_workspace.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_dirty_git_workspace.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /no sessions/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "diff"
Wait+Screen /Show workspace changes/
Enter
Wait+Screen /Workspace diff/
Wait+Screen /Summary/
Wait+Screen /Patch/
Wait+Screen /notes.txt/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_diff_dirty_workspace.png"

Type "q"
