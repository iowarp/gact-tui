Output "visual_loop/screenshots/semantic_workspace_remove_outcomes.gif"

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
Wait+Screen /analysis/
Down
Type "d"
Wait+Screen /press d again or y to confirm/
Type "d"
Wait+Screen /active benchmark profile/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_remove_failure.png"

Type "u"
Wait+Screen /Remove unregisters inactive entries only/
Down
Wait+Screen /default/
Type "d"
Wait+Screen /press d again or y to confirm/
Type "d"
Wait+Screen /removed workspace/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_workspace_remove_success.png"

Escape
Sleep 200ms
Type "q"
