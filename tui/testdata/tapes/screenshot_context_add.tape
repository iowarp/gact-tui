Output "/tmp/gact-context-add.gif"

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

# Create a session so the modal has somewhere to POST to.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Focus sidebar and open the add-context prompt.
Tab
Sleep 200ms
Type "o"
Sleep 300ms
Type "cmd/main.go"
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/21-context-add.png"
Escape
Sleep 200ms
