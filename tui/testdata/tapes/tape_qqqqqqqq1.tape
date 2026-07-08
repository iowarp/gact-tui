Output "/tmp/gact-qqqqqqqq1.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/home/jcernuda/tui/tui/gact --backend http://localhost:8788 --no-intro"
Enter
Show

Sleep 1500ms
Wait+Screen /SESSIONS/

# Make a session, send "read main.go" twice — should produce
# different intros / source / final replies on each run.
Tab
Sleep 200ms
Type "n"
Sleep 600ms
Tab
Tab
Sleep 200ms

Type "read main.go please"
Enter
Sleep 5500ms

Type "read main.go again"
Enter
Sleep 6500ms

Screenshot "/home/jcernuda/tui/screenshots/QQQQQQQQ1_default_variants.png"

Sleep 200ms
Type "q"
