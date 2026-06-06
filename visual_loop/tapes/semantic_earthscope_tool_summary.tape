Output "visual_loop/screenshots/semantic_earthscope_tool_summary.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_semantic_earthscope_tool.sh"
Enter
Show

Wait+Screen /EarthScope/
Screenshot "visual_loop/screenshots/semantic_earthscope_tool_thinking.png"
Wait+Screen /EarthScope waveform discovery/
Screenshot "visual_loop/screenshots/semantic_earthscope_tool_started.png"
Wait+Screen /sac result:/
Wait+Screen /CI/
Wait+Screen /BAR/
Wait+Screen /earthscope_CI_BAR/
Screenshot "visual_loop/screenshots/semantic_earthscope_tool_summary.png"
Wait+Screen /session: seeded session 1 .* idle/
Screenshot "visual_loop/screenshots/semantic_earthscope_tool_final.png"
Sleep 300ms
Type "q"
