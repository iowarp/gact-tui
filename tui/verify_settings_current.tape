Output "/tmp/gact-vsc.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900
Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show
Sleep 2500ms
Ctrl+S
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_settings_current.png"
Sleep 200ms
Escape
Sleep 200ms
Type "q"
