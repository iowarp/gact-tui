Output "visual_loop/screenshots/session_setup_picker.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type ".tools/emulator-server -port 17981 >/tmp/gact-session-setup-emulator.log 2>&1 &"
Enter
Type "sleep 0.4"
Enter
Type "GACT_BACKEND=http://127.0.0.1:17981 ./tui/gact --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Ctrl+N
Wait+Screen /Workflow blueprint/
Wait+Screen /Expert pack/
Screenshot "visual_loop/screenshots/session_setup_picker.png"
Sleep 300ms
Type "q"
