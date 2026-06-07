Output "visual_loop/screenshots/semantic_memory_inspector.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_memory_inspector.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Ctrl+N
Wait+Screen /session:/
Sleep 500ms

Type "/"
Sleep 150ms
Type "memory"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_memory_palette.png"
Enter
Wait+Screen /Memory · context/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_memory_inspector.png"

Escape
Sleep 200ms
Type "q"
