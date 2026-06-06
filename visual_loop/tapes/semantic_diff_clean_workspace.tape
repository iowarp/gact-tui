Output "visual_loop/screenshots/semantic_diff_clean_workspace.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_clean_git_workspace.sh"
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
Wait+Screen /No unstaged workspace changes/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_diff_clean_workspace.png"

Type "q"
