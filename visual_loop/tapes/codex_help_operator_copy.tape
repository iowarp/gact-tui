Output "visual_loop/screenshots/codex_help_operator_copy.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "?"
Wait+Screen /refresh active server data/
Sleep 300ms
Screenshot "visual_loop/screenshots/codex_help_operator_copy.png"
Down
Down
Down
Down
Down
Down
Sleep 300ms
Wait+Screen /detach and leave this session running/
Screenshot "visual_loop/screenshots/codex_help_operator_copy_scrolled.png"
