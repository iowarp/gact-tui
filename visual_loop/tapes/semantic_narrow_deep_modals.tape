Output "visual_loop/screenshots/semantic_narrow_deep_modals.gif"

Set Shell "bash"
Set FontSize 12
Set Width 1000
Set Height 620

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/metrics"
Enter
Wait+Screen /Operations Metrics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_metrics.png"
Escape
Sleep 200ms
Ctrl+S
Wait+Screen /Settings/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_settings.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_memory_stress.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/memory"
Enter
Wait+Screen /Memory · context/
Wait+Screen /retrieval status: searched current session/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_memory.png"
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_prompt_catalog_stress.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/prompts"
Enter
Wait+Screen /Provider · Workspace/
Wait+Screen /Invalid placeholder diagnostic/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_prompts.png"
Down
Down
Down
Down
Down
Enter
Wait+Screen /Prompt · Invalid placeholder diagnostic/
Wait+Screen /Validation/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_prompt_detail.png"
Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C

Sleep 500ms
Type "bash visual_loop/run_expert_packs_stress.sh"
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Type "/expert-packs"
Enter
Wait+Screen /Expert Packs/
Wait+Screen /Data Semantics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_expert_packs.png"
Down
Enter
Wait+Screen /Expert Pack · Data Semantics/
Wait+Screen /Pack actions/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_narrow_expert_pack_detail.png"
Type "q"
