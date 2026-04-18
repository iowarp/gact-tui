Output "/tmp/gact-long-reply.gif"

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

# Trigger the long-writeup scenario + let it run.
Type "please write a long explain"
Enter
Sleep 8000ms
Screenshot "/home/jcernuda/tui/screenshots/22-long-reply.png"

Sleep 300ms
