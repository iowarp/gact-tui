# Full /doctor with both tabs against the live CLIO with all
# capabilities landed (28/30 supported; only LSP + voice false).
Output "/tmp/gact-doctor-full.gif"
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
# Health view
Screenshot "/home/jcernuda/tui/screenshots/clio_doctor_health.png"

Sleep 400ms
Tab
Sleep 700ms
# Capabilities view (the scorecard)
Screenshot "/home/jcernuda/tui/screenshots/clio_doctor_caps_final.png"

Sleep 300ms
Escape
Sleep 200ms
Type "q"
