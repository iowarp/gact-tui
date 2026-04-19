Output "/tmp/gact-task-badge.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_NO_INTRO=1 /tmp/gact attach task-badge-demo2"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/
Screenshot "/home/jcernuda/tui/screenshots/73-task-badge.png"

Sleep 300ms
Type "q"
