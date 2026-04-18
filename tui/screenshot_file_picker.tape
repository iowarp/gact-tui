Output "/tmp/gact-file-picker.gif"

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

# Type @ to open the fuzzy file picker.
Type "@"
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/48-file-picker-open.png"

# Fuzzy-filter by "store".
Type "store"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/49-file-picker-filtered.png"

# Pick the top match.
Enter
Sleep 500ms
Screenshot "/home/jcernuda/tui/screenshots/50-file-picker-inserted.png"

Sleep 200ms
