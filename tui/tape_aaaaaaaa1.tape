Output "/tmp/gact-aaaaaaaa1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "rm -f /tmp/gact-detached-aaaa.json && GACT_DETACHED_PATH=/tmp/gact-detached-aaaa.json /home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1200ms
Wait+Screen /SESSIONS/

# Create a new session with a known title.
Tab
Sleep 200ms
Type "n"
Sleep 800ms

# Tab back to input + type a tiny prompt so the session has activity.
Tab
Tab
Sleep 200ms
Type "hi"
Enter
Sleep 1500ms

# Ctrl+Z: clean detach.
Ctrl+Z
Sleep 500ms
