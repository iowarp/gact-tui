Output "/tmp/gact-collapse.gif"

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

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Trigger the big-tool-output scenario.
Type "dump the log"
Enter
Sleep 7000ms
# At this point the conversation shows a collapsed tool_result with
# "[N more lines — Ctrl+E to expand]".
Screenshot "/home/jcernuda/tui/screenshots/27-bulky-collapsed.png"

# Press Ctrl+E to open the floating detail view.
Tab
Sleep 200ms
Ctrl+E
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/28-bulky-expanded.png"

# Scroll the detail view to prove it works.
PageDown
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/29-bulky-scrolled.png"

Escape
Sleep 200ms
