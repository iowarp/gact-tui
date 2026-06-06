Output "visual_loop/screenshots/semantic_expert_packs.gif"

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

Type "/expert-packs"
Enter
Wait+Screen /Expert Packs/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_catalog.png"

Enter
Wait+Screen /Activation blocked/
Sleep 500ms

Down
Enter
Wait+Screen /Operator summary/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_detail.png"

Type "q"
