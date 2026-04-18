Output "/tmp/gact-fixes.gif"

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

# Open a session and fill the conversation to verify the footer stays on-screen.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

Type "please write a long explain"
Enter
Sleep 8000ms
Wait+Screen /Ctrl\+N/
Screenshot "/home/jcernuda/tui/screenshots/32-footer-stays-on-long-convo.png"

# Backslash-Enter (Claude-Code muscle memory) inserts a newline —
# a terminal-portable alternative to Shift+Enter, which requires the
# Kitty keyboard protocol for VHS to send the modifier distinctly.
# VHS eats a trailing "\" inside Type strings, so split the input.
Type "line one"
Type `\`
Enter
Type "line two"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/33-backslash-enter-newline.png"

# Clear the draft before continuing.
Ctrl+U
Sleep 200ms

# Slash command /clear wipes the conversation (bugfix M4).
Type "/"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/34-palette-with-clear.png"
Enter
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/35-after-clear.png"

Sleep 200ms
