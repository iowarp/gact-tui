Output "/tmp/gact-features.gif"

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

# Help overlay
Type "?"
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/05-help.png"
Type "?"
Sleep 200ms

# Palette
Type "/"
Sleep 250ms
Screenshot "/home/jcernuda/tui/screenshots/06-palette.png"

# Filter the palette
Type "diff"
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/07-palette-filter.png"
Escape

Sleep 200ms

# Trigger permission
Type "delete the temp dir please"
Enter
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/08-permission-banner.png"

# Allow it via keyboard
Type "a"
Sleep 4000ms
Screenshot "/home/jcernuda/tui/screenshots/09-after-allow.png"

Sleep 300ms
Type "q"
