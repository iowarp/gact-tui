Output "/tmp/gact-theme-readability.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

# Take a second screenshot of dracula conversation to confirm.
Hide
Type "/tmp/gact --backend $GACT_BACKEND --theme dracula"
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
Screenshot "/home/jcernuda/tui/screenshots/61-dracula-convo.png"

Sleep 300ms
