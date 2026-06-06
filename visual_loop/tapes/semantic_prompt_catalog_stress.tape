Output "visual_loop/screenshots/semantic_prompt_catalog_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_prompt_catalog_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/prompts"
Enter
Wait+Screen /Provider · Workspace/
Wait+Screen /Seismic blueprint orchestrator/
Wait+Screen /Invalid placeholder diagnostic/
Wait+Screen /Provider · Session/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_stress_catalog.png"

Down
Down
Down
Down
Down
Enter
Wait+Screen /Prompt · Invalid placeholder diagnostic/
Wait+Screen /Validation/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_stress_invalid_detail.png"

Type "r"
Wait+Screen /Rendered prompt/
Wait+Screen /unknown placeholder/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_stress_validation_render.png"
Escape
Sleep 300ms
Escape
Sleep 300ms
Down
Enter
Wait+Screen /Prompt · Seismic blueprint orchestrator/
Down
Type "e"
Wait+Screen /Edit prompt override/
Sleep 300ms
Type " operator override"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_prompt_stress_save_editor.png"
Enter
Wait+Screen /prompt save failed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_stress_save_failure.png"

Type "q"
