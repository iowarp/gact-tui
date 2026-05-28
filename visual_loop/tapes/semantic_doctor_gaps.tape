Output "visual_loop/screenshots/semantic_doctor_gaps.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/doctor"
Enter
Wait+Screen /Doctor/
Sleep 500ms
Tab
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_doctor_gaps.png"

Type "q"
