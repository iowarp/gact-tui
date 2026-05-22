# CLIO provider picker with Claude Code selected, used to verify local
# CLI static candidate aliases render without treating lack of live
# model discovery as no model selection.
Output "screenshots/clio_lm_config_claude.gif"

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
Type "claude"
Sleep 1500ms
Screenshot "screenshots/clio_lm_config_claude.png"

Sleep 500ms
Type "q"
