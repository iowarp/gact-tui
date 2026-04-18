Output "/tmp/gact-convo.gif"

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

Type "read main.go please"
Enter

# Mid-stream snapshot
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/02-streaming.png"

# Wait for completion
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/03-completed.png"

# Try a dangerous request to trigger permission
Type "delete the temp directory"
Enter

# Wait for permission.requested → banner
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/04-permission.png"

Sleep 500ms
Type "q"
