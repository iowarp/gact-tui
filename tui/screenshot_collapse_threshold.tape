Output "/tmp/gact-collapse-threshold.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

# Open Settings on the TUI tab and show the new collapse-threshold control.
Ctrl+S
Sleep 300ms
# Skip Model (0) → Agent (1) → Theme (2) → TUI (3).
Tab
Tab
Tab
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/41-settings-tui-threshold.png"

# Bump threshold from 5 to 12 with ▶.
Right
Right
Right
Right
Right
Right
Right
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/42-settings-tui-threshold-12.png"

Escape
Sleep 200ms

# Trigger a bulky tool output to verify the new threshold applies inline.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/
Type "dump the log"
Enter
Sleep 5000ms
Screenshot "/home/jcernuda/tui/screenshots/43-bulky-threshold-12.png"

Sleep 200ms
