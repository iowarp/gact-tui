Output "visual_loop/screenshots/semantic_memory_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_memory_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms
Type "/memory"
Enter
Wait+Screen /Memory · context/
Wait+Screen /retrieval status: searched current session/
Wait+Screen /5 hits/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_memory_stress_summary.png"

PageDown
PageDown
Wait+Screen /Memory search/
Wait+Screen /terms:/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_stress_search_hits.png"

PageDown
Wait+Screen /context_file_excluded_too_large/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_stress_excluded_file.png"

PageDown
Wait+Screen /reason: visible_transcript/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_stress_context_frame.png"

PageDown
Wait+Screen /Agent memory access proof/
Wait+Screen /search access: session access allowed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_stress_agent_tools.png"

Type "q"
