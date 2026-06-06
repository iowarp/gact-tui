Output "visual_loop/screenshots/semantic_clear_confirm_and_cleared.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /seeded user message/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "clear"
Wait+Screen /confirm clear/
Enter
Wait+Screen /again to confirm wipe/
Wait+Screen /seeded user message/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_clear_confirm.png"

Type "/"
Wait+Screen /Commands/
Type "clear"
Wait+Screen /confirm clear/
Enter
Wait+Screen /cleared 2 messages/
Wait+Screen /no messages yet/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_clear_cleared.png"

Type "q"
