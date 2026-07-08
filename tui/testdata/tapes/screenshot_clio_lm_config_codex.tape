# CLIO provider picker with Codex selected, used to verify local CLI
# static candidate model catalogs render without a live /models probe.
Output "screenshots/clio_lm_config_codex.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800
Env GACT_NO_INTRO "1"

Hide
Type "gact"
Enter
Show

Sleep 6500ms
Type "codex"
Sleep 1500ms
Screenshot "screenshots/clio_lm_config_codex.png"

Sleep 500ms
Type "q"
