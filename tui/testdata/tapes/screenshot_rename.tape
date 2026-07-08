Output "/tmp/gact-rename.gif"

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

# Create a session (n works from input; empty-state cribsheet shows Ctrl+N too)
Ctrl+n
Sleep 500ms
Wait+Screen /CONVERSATION/

# Focus sidebar, then press e to open rename
Tab
Sleep 200ms
Type "e"
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/18-rename-modal.png"
Escape
Sleep 200ms
