Output "/tmp/gact-header-semantics.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/
Screenshot "/home/jcernuda/tui/screenshots/header-semantics.png"

Sleep 300ms
Type "q"
