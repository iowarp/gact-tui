Output "visual_loop/screenshots/semantic_blocker_handoff.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_blocker_handoff.sh"
Enter
Show

Wait+Screen /blocked: resource too large/
Wait+Screen /dataset ID/
Screenshot "visual_loop/screenshots/semantic_blocker_handoff_inline.png"
Tab
Sleep 200ms
Tab
Sleep 200ms
Up
Sleep 200ms
Ctrl+E
Wait+Screen /Operator view/
Wait+Screen /blocked: resource too large/
Screenshot "visual_loop/screenshots/semantic_blocker_handoff_detail.png"
Escape
Sleep 200ms
Wait+Screen /idle/
Screenshot "visual_loop/screenshots/semantic_blocker_handoff_final.png"
Sleep 300ms
Type "q"
