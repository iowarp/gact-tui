# CLIO subagent demo — nanoagent spawn from the AnalysisExpert
# parallel detection (#9). Driver script seeds the parent
# turn server-side via curl before invoking VHS so the screenshot
# captures the steady state: parent session at the top of the
# sidebar with two child "analysis_validator subagent" rows
# indented underneath.

Output "/tmp/gact-clio-subagent.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

# 1.5s for sidebar to populate from /v1/sessions list, then
# screenshot. The AAATARGET session id is supplied via env to
# pre-select the parent so the conversation pane shows the spawn
# answer; without it we'd land on the most-recent session.
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/clio_subagent.png"

Sleep 300ms
Type "q"
