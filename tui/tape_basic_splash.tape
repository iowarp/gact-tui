Output "/tmp/gact-basic-splash.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/home/jcernuda/tui/tui/gact --backend http://localhost:8788"
Enter
Show

Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/basic_splash_frame_a.png"

Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/basic_splash_frame_b.png"

Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/basic_splash_frame_c.png"

Type " "
Sleep 200ms
