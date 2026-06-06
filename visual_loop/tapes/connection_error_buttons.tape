Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 720

Type "cd /home/jcernuda/gact-tui && GACT_BACKEND=http://127.0.0.1:17999 ./tui/gact"
Enter
Wait+Screen /Connection error/
Sleep 500ms
Screenshot "visual_loop/screenshots/connection_error_buttons.png"
