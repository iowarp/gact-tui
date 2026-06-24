# Live capture: TUI driving REAL clio (:17800) + claude_code/haiku.
# Proves (a) a real agent turn renders end-to-end and (b) the new
# per-expert Context view (Ctrl+O) opens on real data.
#
# clio is already LM-configured (claude_code/haiku ready), so no LM
# config modal pops on connect. Haiku ~12s/call + an MCP tool round
# trip, so we budget several minutes with intermediate screenshots.

Output "/tmp/gact-earthscope-live.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "./gact --backend $GACT_BACKEND --no-intro"
Enter
Show

# Let the TUI connect, load the session list, fetch caps, focus input.
Sleep 5000ms

# Create a fresh session: Ctrl+N opens the new-session setup modal,
# Enter accepts the defaults and POSTs /v1/sessions. This guarantees
# an active session (currentID) so the prompt below actually sends.
Ctrl+N
Sleep 3000ms
Enter
Sleep 4000ms

# Short prompt that exercises an NDP MCP tool but stays quick.
Type "List two EarthScope GNSS stations from the NDP catalog with their IDs."
Sleep 500ms
Enter

# Capture the streaming / working state early.
Sleep 20000ms
Screenshot "/home/jcernuda/gact-tui/screenshots/tui-earthscope-live-stream.png"

# Give the agent + Haiku + tool time to finish the turn.
Sleep 60000ms
Sleep 60000ms
Sleep 60000ms

# Capture the final rendered turn (reasoning + tool call + result).
Screenshot "/home/jcernuda/gact-tui/screenshots/tui-earthscope-live-final.png"

# Open the per-expert Context view (segmented bar + expert selector
# + "Compact now") and capture it.
Ctrl+O
Sleep 3000ms
Screenshot "/home/jcernuda/gact-tui/screenshots/tui-earthscope-live-context.png"

Sleep 500ms
Type "q"
