Output "visual_loop/screenshots/semantic_expert_packs_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_expert_packs_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/expert-packs"
Enter
Wait+Screen /Expert Packs/
Wait+Screen /Broken Pack/
Wait+Screen /Data Semantics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_stress_catalog.png"

Down
Enter
Wait+Screen /Expert Pack · Data Semantics/
Wait+Screen /Pack actions/
Wait+Screen /update/
Wait+Screen /delete/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_stress_detail.png"

Enter
Wait+Screen /Operator summary/
Wait+Screen /Source evidence/
Wait+Screen /data-semantics-agents.git/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_source_provenance.png"

Escape
Wait+Screen /Pack actions/

Type "u"
Wait+Screen /marketplace source has validation errors/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_update_failure.png"

Type "d"
Wait+Screen /confirm deleting data-semantics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_delete_confirm.png"

Type "d"
Wait+Screen /pack is active in the selected session/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_delete_failure.png"

Type "q"
