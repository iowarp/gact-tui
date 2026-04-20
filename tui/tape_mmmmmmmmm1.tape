Output "/tmp/gact-anim-splash.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/home/jcernuda/tui/tui/gact --backend http://localhost:8788"
Enter
Show

# Frame 1 — after the TUI has rendered the first splash frame
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/MMMMMMMMM1_splash_frame_a.png"

# Frame 2 — ~12 frames later at 33ms/frame
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/MMMMMMMMM1_splash_frame_b.png"

# Frame 3 — ~24 frames later
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/MMMMMMMMM1_splash_frame_c.png"

# Dismiss
Type " "
Sleep 200ms
