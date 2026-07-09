Output "/tmp/gact-attach.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
# Pre-create the session via CLI in the background, then attach.
Type "/tmp/gact tell attach-demo --async 'pre-seed message' >/dev/null"
Enter
Sleep 800ms

# attach lands directly on the session. GACT_NO_INTRO skips the splash.
Type "GACT_NO_INTRO=1 /tmp/gact attach attach-demo"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/
Screenshot "/home/jcernuda/tui/screenshots/72-attach-direct.png"

Sleep 300ms
Type "q"
