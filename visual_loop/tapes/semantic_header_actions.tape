Output "visual_loop/screenshots/semantic_header_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
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
