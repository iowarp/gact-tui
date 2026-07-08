Output "/tmp/gact-compose.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

# Make sure we have a session to type into.
Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Seed the input with a short draft, then open compose.
Type "please rewrite this whole README:"
Sleep 300ms
Ctrl+G
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/44-compose-open.png"

# Type several lines inside the compose modal.
Type "## Goals"
Enter
Enter
Type "- concise"
Enter
Type "- plain english"
Enter
Type "- no marketing speak"
Enter
Enter
Type "## Audience"
Enter
Type "engineers skimming on GitHub"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/45-compose-typing.png"

# Commit back to base input.
Ctrl+S
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/46-after-compose-commit.png"

Sleep 200ms
