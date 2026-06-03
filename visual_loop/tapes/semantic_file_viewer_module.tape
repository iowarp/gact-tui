Output "visual_loop/screenshots/semantic_file_viewer_module.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_file_viewer.sh"
Enter
Show

Wait+Screen /FILES/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_file_viewer_module_initial.png"

Tab
Sleep 200ms
Right
Sleep 200ms
Down
Sleep 200ms
Enter
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_file_viewer_module_expanded.png"

Down
Sleep 150ms
Down
Sleep 150ms
Enter
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_file_viewer_module_detail.png"
Type "u"
Wait+Screen /uploaded/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_file_viewer_module_upload.png"
Escape
Sleep 150ms

Type "q"
