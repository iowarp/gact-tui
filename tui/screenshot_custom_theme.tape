Output "/tmp/gact-custom-theme.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Env GACT_THEME_FILE "/tmp/gact-custom-theme.json"
Type "/tmp/gact --backend $GACT_BACKEND --theme custom"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

Type "read main.go"
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/62-custom-theme-convo.png"

# Open Settings > Theme to verify the custom theme appears with its name.
Ctrl+S
Sleep 200ms
Tab
Tab
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/63-custom-theme-picker.png"

Sleep 200ms
