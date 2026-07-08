Output "/tmp/gact-doctor.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1000ms
Wait+Screen /SESSIONS/

# Open palette and fire /doctor.
Type "/"
Sleep 300ms
Type "doctor"
Sleep 300ms
Enter
Sleep 600ms

Screenshot "/home/jcernuda/tui/screenshots/v0_2_doctor_modal.png"

Sleep 500ms
Escape
Sleep 200ms
Type "q"
