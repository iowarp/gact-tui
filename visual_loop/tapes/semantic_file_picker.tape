Output "visual_loop/screenshots/semantic_file_picker.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "@"
Sleep 900ms
Screenshot "visual_loop/screenshots/semantic_file_picker.png"

Right
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_file_picker_tree_expanded.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
