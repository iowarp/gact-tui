# Verify ? in input no longer triggers help, and Settings → Model loads.
Output "/tmp/gact-diag-settings.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
# Type a message that includes a question mark — verify it lands in the input
# and does NOT open the help modal.
Type "what files are in /tmp?"
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/diag_input_qmark.png"

# Clear input by escaping then opening Settings via Ctrl+S.
Escape
Sleep 200ms
Ctrl+S
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/diag_settings_model.png"
Sleep 300ms
Escape
Sleep 200ms
Type "q"
