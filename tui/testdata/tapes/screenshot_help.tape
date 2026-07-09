Output "/tmp/gact-help.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 1000

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

# Open help overlay.
Type "?"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/26-help-overlay.png"

Sleep 200ms
