Output "/tmp/gact-demarcation.gif"

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

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

Type "many tools please"
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/25-tool-demarcation.png"

Sleep 300ms
