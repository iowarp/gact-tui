Output "visual_loop/screenshots/semantic_expert_packs_empty.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_expert_packs.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/expert-packs"
Enter
Wait+Screen /No expert packs installed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_empty.png"

Type "q"
