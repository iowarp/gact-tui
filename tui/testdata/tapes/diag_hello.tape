# Diagnostic: send "hello" and screenshot the assistant reply.
Output "/tmp/gact-diag-hello.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Type "hello"
Sleep 200ms
Enter
Sleep 12000ms
Screenshot "/home/jcernuda/tui/screenshots/diag_hello_reply.png"
Sleep 300ms
Type "q"
