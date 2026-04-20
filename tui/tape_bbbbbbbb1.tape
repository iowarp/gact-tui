Output "/tmp/gact-bbbb1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "GACT_DETACHED_PATH=/tmp/gact-bbb/.config/gact/detached.json /home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/

# Sidebar should already show the seeded session with the ↩ marker.
# Add one more session for contrast (no marker on it).
Tab
Sleep 200ms
Type "n"
Sleep 600ms

Screenshot "/home/jcernuda/tui/screenshots/BBBBBBBB1_detached_marker.png"

Sleep 200ms
Type "q"
