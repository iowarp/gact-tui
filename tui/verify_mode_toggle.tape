# Verify /mode cycles routing modes + a follow-up off-topic question
# routes to chat instead of /none.
Output "/tmp/gact-verify-mode.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# Create a fresh session.
Ctrl+N
Sleep 800ms

# Cycle /mode auto → chat.
Type "/mode"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_mode_chat_toast.png"

# Now ask something that would otherwise route to /none.
Sleep 500ms
Type "what is the capital of france"
Sleep 200ms
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_mode_chat_answer.png"

Sleep 200ms
Type "q"
