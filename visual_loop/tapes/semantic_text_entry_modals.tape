Output "visual_loop/screenshots/semantic_text_entry_modals.gif"

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

Tab
Sleep 300ms

Type "e"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_rename_modal.png"
Escape
Sleep 200ms

Type "o"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_context_add_modal.png"
Escape
Sleep 200ms

Ctrl+C
Sleep 100ms
Ctrl+C
