Output "/tmp/gact-zzz1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1200ms
Wait+Screen /SESSIONS/

# Create a session via the sidebar (Tab into sidebar, press n).
Tab
Sleep 200ms
Type "n"
Sleep 800ms

# Tab back to input and send a few short turns.
Tab
Tab
Sleep 200ms
Type "read main.go please"
Enter
Sleep 5000ms
Type "many tools please"
Enter
Sleep 6000ms

# Tab into body focus (input -> sidebar -> body cycle).
Tab
Sleep 200ms
Tab
Sleep 200ms

# Move cursor up to a non-latest message so the highlight is visible
# and clearly distinct from the natural "newest message" placement.
Up
Sleep 150ms
Up
Sleep 150ms
Up
Sleep 150ms

Screenshot "/home/jcernuda/tui/screenshots/ZZZZZZZ1_body_cursor_tint.png"

Sleep 200ms
Type "q"
