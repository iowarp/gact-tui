Output "/tmp/gact-settings-tabs.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 900

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Capture Theme tab
Ctrl+S
Sleep 400ms
Tab
Tab
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/30-settings-theme.png"

# Capture TUI tab
Tab
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/31-settings-tui.png"

Escape
Sleep 200ms
