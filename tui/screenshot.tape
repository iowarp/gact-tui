Output "/tmp/gact-empty.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 1s
Wait+Screen /SESSIONS/
Screenshot "/home/jcernuda/tui/screenshots/01-initial.png"
Sleep 500ms
Type "q"
