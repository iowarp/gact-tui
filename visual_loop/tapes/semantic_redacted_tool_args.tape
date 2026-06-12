Output "visual_loop/screenshots/semantic_redacted_tool_args.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_redacted_semantic_tool.sh"
Enter
Show

Wait+Screen /SAC waveform visualization\(\)/
Screenshot "visual_loop/screenshots/semantic_redacted_tool_args_started.png"
Wait+Screen /sac_plot_traces completed/
Wait+Screen /SAC waveform visualization\(\)/
Screenshot "visual_loop/screenshots/semantic_redacted_tool_args_completed.png"
Tab
Sleep 200ms
Tab
Sleep 200ms
Up
Sleep 200ms
Ctrl+E
Wait+Screen /Operator view/
Wait+Screen /input redacted by runtime/
Screenshot "visual_loop/screenshots/semantic_redacted_tool_args_detail.png"
Escape
Sleep 200ms
Wait+Screen /idle/
Screenshot "visual_loop/screenshots/semantic_redacted_tool_args_final.png"
Sleep 300ms
Type "q"
