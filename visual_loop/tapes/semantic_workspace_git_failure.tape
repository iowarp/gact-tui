Output "visual_loop/screenshots/semantic_workspace_git_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_workspace_git_failure.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Ctrl+W
Wait+Screen /Switch workspace/
Type "g"
Wait+Screen /Clone workspace from Git/
Type "https://example.invalid/codex-missing-repo.git"
Wait+Screen /codex-missing-repo/
Enter
Wait+Screen /Git clone failed/
Wait+Screen /repository/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_git_failure.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Type "q"
