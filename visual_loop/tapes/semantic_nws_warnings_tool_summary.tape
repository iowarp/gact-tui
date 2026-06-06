Output "visual_loop/screenshots/semantic_nws_warnings_tool_summary.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_nws_warnings_tool.sh"
Enter
Show

Wait+Screen /NWS warning/
Screenshot "visual_loop/screenshots/semantic_nws_warnings_tool_thinking.png"
Wait+Screen /NDP feature query/
Screenshot "visual_loop/screenshots/semantic_nws_warnings_tool_started.png"
Wait+Screen /California NWS warnings/
Wait+Screen /sample: Flood Warning issued June 5/
Wait+Screen /california_nws_warnings.json/
Screenshot "visual_loop/screenshots/semantic_nws_warnings_tool_summary.png"
Wait+Screen /session: seeded session 1 .* idle/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_nws_warnings_tool_final.png"
Sleep 300ms
Type "q"
