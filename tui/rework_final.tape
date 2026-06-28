Output "/tmp/rework_final.gif"
Set Shell "bash"
Set FontSize 13
Set Width 1500
Set Height 850

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1800ms
Screenshot "/home/jcernuda/gact-tui/screenshots/rework_final_main.png"

Tab
Sleep 300ms
Type "e"
Sleep 500ms
Type " (post-decomposition)"
Sleep 400ms
Screenshot "/home/jcernuda/gact-tui/screenshots/rework_final_rename.png"
Escape
Sleep 300ms

Ctrl+C
Sleep 500ms
Screenshot "/home/jcernuda/gact-tui/screenshots/rework_final_quitconfirm.png"
Sleep 200ms
Enter
Sleep 300ms
