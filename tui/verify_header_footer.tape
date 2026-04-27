Output "/tmp/gact-verify-hdr.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show
Sleep 2500ms
# Force a quick turn so memory stats become non-zero (chip otherwise hidden).
Type "what model are you?"
Sleep 200ms
Enter
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_header_model_chip.png"
Sleep 300ms
Type "q"
