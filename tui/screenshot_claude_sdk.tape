# GGGGGGG2: TUI driving the live claude-agent-sdk sidecar against real
# Claude (real OAuth, real Anthropic API). Caller must start the sidecar
# before invoking this tape:
#
#   cd adapters/claude-agent-sdk-server
#   uv run uvicorn gact_claude_sdk.server:main_app --port 7780 --factory &
#   GACT_BACKEND=http://127.0.0.1:7780 vhs tui/screenshot_claude_sdk.tape
#
# Output: screenshots/SDK-claude-tui.png

Output "/tmp/gact-claude-sdk.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
# Caller pre-creates the session and exports SID via the env. The
# tape just runs `gact attach $SID` so the TUI opens directly on
# the active conversation pane.
Type "/tmp/gact --backend http://127.0.0.1:7780 attach $SID"
Enter
Show

# Wait for conversation pane to render with the active session.
Sleep 2500ms

# Send a one-word prompt — short answer to keep screenshot tight
# and spend negligible.
Type "say hi in exactly two words"
Sleep 200ms
Enter

# Real round-trip against Anthropic; cold-start can take a beat.
Sleep 15000ms
Screenshot "/home/jcernuda/tui/screenshots/SDK-claude-tui.png"

Sleep 500ms
Ctrl+C
