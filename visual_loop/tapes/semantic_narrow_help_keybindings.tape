Output "visual_loop/screenshots/semantic_narrow_help_keybindings.gif"

Set Shell "bash"
Set FontSize 12
Set Width 1000
Set Height 620

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "?"
Wait+Screen /Keybindings/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_narrow_help_keybindings.png"

Right
Right
Right
Right
Wait+Screen /Commands/
Wait+Screen /Session/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_narrow_help_commands.png"

Type "q"
