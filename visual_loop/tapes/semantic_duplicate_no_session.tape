Output "visual_loop/screenshots/semantic_duplicate_no_session.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_workspace.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /no sessions/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "duplicate"
Wait+Screen /Copy title, model, expert/
Enter
Wait+Screen /no selected session to duplicate/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_duplicate_no_session.png"

Type "q"
