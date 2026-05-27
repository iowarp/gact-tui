Output "visual_loop/screenshots/semantic_header_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_header_actions_base.png"

Type "?"
Wait+Screen /Keybindings/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_header_actions_help.png"
Escape
Sleep 200ms

Ctrl+S
Wait+Screen /Settings/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_header_actions_settings.png"
Escape
Sleep 200ms

Type "q"
