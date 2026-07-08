Output "/tmp/gact-skills.gif"

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

# /skills opens the catalog browser filtered to source=skill
Type "/skills"
Sleep 500ms
Enter
Sleep 700ms
Screenshot "/home/jcernuda/tui/screenshots/69-skills-catalog.png"

Escape
Sleep 200ms

# Settings > Agent shows all 4 agents (incl. skills)
Ctrl+S
Sleep 500ms
# tab to Agent (idx 1)
Tab
Sleep 500ms
Screenshot "/home/jcernuda/tui/screenshots/70-agents-settings.png"

Escape
Sleep 200ms
Type "q"
