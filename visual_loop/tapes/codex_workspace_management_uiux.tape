Output "visual_loop/screenshots/codex_workspace_management_uiux.gif"

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
Wait+Screen /folder/
Wait+Screen /git/
Wait+Screen /remove/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_workspace_management_switch.png"

Type "d"
Wait+Screen /switch to another workspace before removing this one/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_workspace_management_remove_current_blocked.png"

Down
Type "d"
Wait+Screen /press d again or y to confirm/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_workspace_management_remove_confirm.png"

Type "u"
Wait+Screen /Remove unregisters inactive entries only/
Sleep 300ms

Type "g"
Wait+Screen /Clone workspace from Git/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_workspace_management_git.png"
Type "git@github.com:iowarp/clio-agent.git"
Wait+Screen /clio-agent/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_workspace_management_git_derived.png"

Escape
Sleep 100ms
Escape
Sleep 100ms
Type "q"
