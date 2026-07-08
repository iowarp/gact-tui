Output "/tmp/rework_rename.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1000ms
Wait+Screen /SESSIONS/
Tab
Sleep 300ms
Type "e"
Sleep 500ms
Screenshot "/home/jcernuda/gact-tui/screenshots/rework_rename_open.png"
Type " [edited via widget.TextInput]"
Sleep 400ms
Screenshot "/home/jcernuda/gact-tui/screenshots/rework_rename_typed.png"
Escape
Sleep 200ms
