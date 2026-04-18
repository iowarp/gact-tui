Output "/tmp/gact-themes-content.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --theme solarized-light"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

Type "read main.go"
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/60-solarized-light-convo.png"
Sleep 300ms
