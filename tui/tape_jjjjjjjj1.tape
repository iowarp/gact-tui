Output "/tmp/gact-jjjjjjjj1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_DETACHED_PATH=/tmp/gact-jjjj/detached.json /home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/

# First: show the default (all sessions, mixed ↩ + plain).
Screenshot "/home/jcernuda/tui/screenshots/JJJJJJJJ1_sidebar_all.png"

# Tab into sidebar, press d to toggle detached-only.
Tab
Sleep 200ms
Type "d"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/JJJJJJJJ1_sidebar_detached_only.png"

Sleep 200ms
Type "q"
