Output "visual_loop/screenshots/semantic_palette_long_category.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_palette_long_commands.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/"
Wait+Screen /Commands/
Wait+Screen /Extension Commands \[24\]/
Tab
Tab
Tab
Tab
Tab
Tab
Tab
Wait+Screen /Extension Commands area/
Wait+Screen /runtime-demo-01/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_palette_long_category_top.png"

Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Wait+Screen /▌.*runtime-demo-17/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_palette_long_category_scrolled.png"

Escape
Sleep 200ms
Type "q"
