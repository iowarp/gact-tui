Output "/tmp/gact-eeeeeeee1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_DETACHED_PATH=/tmp/gact-eeee/detached.json /home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/

Screenshot "/home/jcernuda/tui/screenshots/EEEEEEEE1_empty_state_resume_hint.png"

Sleep 200ms
Type "q"
