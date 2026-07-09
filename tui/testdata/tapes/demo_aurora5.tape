# Iter 5 — full demo path on the deployed agent: connect, chat, propose-edit + apply.
Output "/tmp/gact-demo5.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact connect aurora-demo --no-intro"
Enter
Show
Sleep 2500ms
Ctrl+N
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/aurora5_01_connected.png"

# Chat: simple identity intercept (no LM round-trip)
Type "what model are you?"
Sleep 200ms
Enter
Sleep 4000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora5_02_model_id.png"

# Propose edit on a workspace-rooted file
Sleep 500ms
Type "propose an edit to /home/jcernuda/tui/clio-agent/scratch-perm.txt -- replace the whole content with hello-from-aurora"
Sleep 200ms
Enter
Sleep 12000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora5_03_propose.png"

# Tab to body, apply with 'a'
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora5_04_applied.png"

Sleep 200ms
Type "q"
