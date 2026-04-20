Output "/tmp/gact-grc-splash.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/home/jcernuda/tui/tui/gact --backend http://localhost:8788"
Enter
Show

# GRC logo splash renders before the connect flow. Capture before any
# keypress so the halfblock art is on screen (it dismisses on any key).
Sleep 1200ms
Screenshot "/home/jcernuda/tui/screenshots/LLLLLLLLL1_grc_logo_splash.png"

# Dismiss
Type " "
Sleep 300ms
