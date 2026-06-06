Output "visual_loop/screenshots/semantic_prompt_catalog.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_prompt_catalog.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/prompts"
Enter
Wait+Screen /Prompts/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_catalog.png"

Down
Enter
Wait+Screen /Prompt ·/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_profiles.png"

Type "r"
Wait+Screen /Rendered prompt/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_detail.png"
Escape
Sleep 300ms

Down
Down
Type "e"
Wait+Screen /Edit prompt override/
Sleep 300ms
Type " edited override"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_prompt_editor.png"
Enter
Wait+Screen /saved prompt profile codex/
Sleep 300ms

Type "s"
Wait+Screen /saved prompt profile codex/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_saved.png"

Type "q"
