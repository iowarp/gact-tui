Output "/tmp/gact-palette-hints.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

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
Sleep 4000ms

# Open palette; inline hints should appear next to /clear /theme /agent /rename.
Type "/"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/64-palette-current-values.png"

Sleep 200ms
