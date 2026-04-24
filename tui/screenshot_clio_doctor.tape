# CLIO-BBBBBBBBBB17: /doctor against clio-agent-gact-smoke.
#
# Proves the modal reads real integration rows from CLIO's /v1/health.

Output "/tmp/gact-clio-doctor.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1200ms

Type "/"
Sleep 300ms
Type "doctor"
Sleep 300ms
Enter
Sleep 800ms

Screenshot "/home/jcernuda/tui/screenshots/clio_doctor.png"

Sleep 500ms
Escape
Sleep 200ms
Type "q"
