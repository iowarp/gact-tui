Output "/tmp/gact-intro.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

# Splash should appear immediately. Capture before pressing anything.
Sleep 700ms
Screenshot "/home/jcernuda/tui/screenshots/71-intro-splash.png"

# Dismiss + connect
Type " "
Sleep 800ms
Wait+Screen /SESSIONS/

Type "q"
