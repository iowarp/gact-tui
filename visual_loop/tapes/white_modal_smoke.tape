Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900
Set Theme "Builtin Light"
Set Padding 0
Set MarginFill "#ffffff"

Hide
Type "cd /home/jcernuda/gact-tui && bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms
Screenshot "visual_loop/screenshots/white_modal_smoke_base.png"

Ctrl+S
Sleep 500ms
Screenshot "visual_loop/screenshots/white_modal_smoke_settings.png"
Escape
Sleep 300ms

Type "?"
Sleep 500ms
Screenshot "visual_loop/screenshots/white_modal_smoke_help.png"
Escape
Sleep 300ms

Type "/"
Sleep 500ms
Screenshot "visual_loop/screenshots/white_modal_smoke_palette.png"
