Output "visual_loop/screenshots/semantic_permissions_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_permissions_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/permissions"
Enter
Wait+Screen /2 approval requests waiting in current session/
Wait+Screen /shell needs approval/
Wait+Screen /Fetch live NWS warning features/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permissions_stress_pending.png"

PageDown
PageDown
PageDown
Wait+Screen /Review guardrails/
Wait+Screen /policy conflict/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permissions_stress_policy_conflict.png"

Type "s"
Wait+Screen /permission allow session applied/
Wait+Screen /1 approval request waiting in current session/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permissions_stress_allow_session.png"

Type "w"
Wait+Screen /permission allow workspace applied/
Wait+Screen /No approval is needed for current session/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_permissions_stress_allow_workspace.png"

Type "q"
