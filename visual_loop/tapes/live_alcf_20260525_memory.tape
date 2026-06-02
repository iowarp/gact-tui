Output "visual_loop/screenshots/live_alcf_20260525_memory.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_f2eb419f7ca0 ./tui/gact --backend http://127.0.0.1:41918 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/"
Sleep 150ms
Type "memory"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_memory_palette.png"
Enter
Wait+Screen /Memory/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_memory_inspector.png"
PageDown
Sleep 500ms
Screenshot "visual_loop/screenshots/live_alcf_20260525_memory_inspector_pagedown.png"
Escape
Sleep 300ms

Ctrl+C
