Output "/tmp/gact-dddddddd1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_DETACHED_PATH=/tmp/gact-dddd/detached.json /home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/

Screenshot "/home/jcernuda/tui/screenshots/DDDDDDDD1_header_detached_chip.png"

Sleep 200ms
Type "q"
