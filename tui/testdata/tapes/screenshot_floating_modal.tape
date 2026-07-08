Output "/tmp/gact-floating-modal.gif"

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

# Populate the conversation so the floating window has something to
# float over — otherwise the background is blank and the fix isn't
# visible.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/
Type "please write a long explain"
Enter
Sleep 8000ms

# Open settings — should float on top of the visible conversation,
# NOT paint a black bar across the screen.
Ctrl+S
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/23-floating-settings.png"
Escape
Sleep 200ms

# Open workspace switcher over the same conversation — same chrome,
# same width as settings (no width-shift between modals).
Ctrl+W
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/24-floating-workspace.png"
Escape
Sleep 200ms
