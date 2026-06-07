Output "visual_loop/screenshots/semantic_duplicate_success.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_duplicate_success.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /seismic review/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "duplicate"
Wait+Screen /Copy title and expert/
Enter
Wait+Screen /seismic review \(copy\)/
Wait+Screen /no messages yet/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_duplicate_success.png"

Type "q"
