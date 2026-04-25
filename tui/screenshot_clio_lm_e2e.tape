# CLIO-BBBBBBBBBB-D: end-to-end frictionless deploy.
# 1. Connect → modal auto-pops (CLIO ships unconfigured)
# 2. User Tabs to Save and Enters
# 3. Modal dismisses, transient hint confirms
# 4. User asks a real question; Claude (via Meridian/Haiku) answers
Output "/tmp/gact-clio-lm-e2e.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 2500ms
# Tab through fields to Save. Modal layout (post-temp/max-tokens
# knobs): preset → model → key → temperature → max_tokens → save.
# Five Tabs lands on Save.
Tab
Tab
Tab
Tab
Tab
Sleep 300ms
# Enter on Save dispatches PUT /v1/providers/lm
Enter
Sleep 8000ms
# Now the modal is gone and the agent is wired. Create session + ask.
Ctrl+n
Sleep 2000ms
Type "Hello CLIO. Tell me your name in one sentence."
Sleep 500ms
Enter

Sleep 60000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_lm_e2e.png"

Sleep 500ms
Type "q"
