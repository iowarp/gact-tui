# Diagnostic: open /doctor (truncation + arc label) and /skills (truncation).
Output "/tmp/gact-diag-doctor.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Type "/doctor"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_doctor.png"
Sleep 300ms
Escape
Sleep 500ms
Type "/skills"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_skills.png"
Sleep 300ms
Escape
Sleep 200ms
Type "q"
