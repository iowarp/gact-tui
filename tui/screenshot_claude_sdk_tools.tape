# KKKKKKK1: drive the live claude-agent-sdk sidecar against real
# Claude with an Edit tool call so the screenshot captures
# tool_call + file_diff rendering. Caller pre-creates the session,
# pre-seeds a fixture file in the workspace, and pre-allows perms
# via a background responder script.
#
# Output: screenshots/SDK-claude-tools.png

Output "/tmp/gact-claude-tools.gif"

Set Shell "bash"
Set FontSize 13
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact --backend http://127.0.0.1:7785 attach $SID"
Enter
Show

Sleep 2500ms

# Ask Claude to edit the fixture file. Auto-allower in caller
# accepts the Write/Edit permission so the turn doesn't block.
Type "Use the Edit tool to change 'hello' to 'GACT' in fixture.txt. Don't ask, just do it."
Sleep 200ms
Enter

# Generous wait for: turn starts, edit tool call, file_diff Part
# rendered, turn settles to idle.
Sleep 25000ms
Screenshot "/home/jcernuda/tui/screenshots/SDK-claude-tools.png"

Sleep 500ms
Ctrl+C
