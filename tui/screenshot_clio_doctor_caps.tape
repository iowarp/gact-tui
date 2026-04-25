# /doctor's Capabilities tab against a configured CLIO.
Output "/tmp/gact-clio-doctor-caps.gif"

Set Shell "bash"
Set FontSize 12
Set Width 1500
Set Height 1000

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
Type "/"
Sleep 200ms
Type "doctor"
Sleep 200ms
Enter
Sleep 700ms
# Tab to Capabilities tab
Tab
Sleep 700ms

Screenshot "/home/jcernuda/tui/screenshots/clio_doctor_caps.png"

Sleep 400ms
Escape
Sleep 200ms
Type "q"
