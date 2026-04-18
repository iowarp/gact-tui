Output "/tmp/gact-help-tabs.gif"

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

# Open the tabbed help overlay — starts on "Global".
Type "?"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/36-help-tab-global.png"

# Right arrow → Sidebar tab.
Right
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/37-help-tab-sidebar.png"

# Right → Conversation.
Right
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/38-help-tab-conversation.png"

# Right → Input.
Right
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/39-help-tab-input.png"

# Right → Permission.
Right
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/40-help-tab-permission.png"

Escape
Sleep 200ms
