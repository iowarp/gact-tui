Output "/tmp/gact-polish.gif"

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

# Empty state — no sessions
Screenshot "/home/jcernuda/tui/screenshots/10-empty.png"

# Move focus to sidebar and create a session
Tab
Sleep 200ms
Type "n"
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/11-after-new.png"

# Tab to input and send
Tab
Tab
Type "read main.go please"
Enter
Sleep 5500ms
Screenshot "/home/jcernuda/tui/screenshots/12-streamed.png"

Sleep 300ms
Type "q"
