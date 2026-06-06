Output "visual_loop/screenshots/semantic_prompt_empty.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_prompts.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/prompts"
Enter
Wait+Screen /No prompts available/
Wait+Screen /agent-blueprints/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_prompt_empty.png"

Type "q"
