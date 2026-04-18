Output "/tmp/gact-status-dots.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

# Session 1 — trigger a running state. "realistic" timing means the
# agent turn takes a few seconds, long enough for the spinner to show.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/
Type "read main.go"
Enter
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/19-status-dot-running.png"
Sleep 4000ms

# Session 2 — trigger a waiting_permission state via a dangerous prompt.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/
Type "delete the temp dir"
Enter
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/20-status-dot-permission.png"

Sleep 300ms
