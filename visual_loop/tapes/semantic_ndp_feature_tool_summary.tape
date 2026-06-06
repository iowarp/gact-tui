Output "visual_loop/screenshots/semantic_ndp_feature_tool_summary.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_ndp_feature_tool.sh"
Enter
Show

Wait+Screen /wildfire feature/
Screenshot "visual_loop/screenshots/semantic_ndp_feature_tool_thinking.png"
Wait+Screen /NDP feature query/
Screenshot "visual_loop/screenshots/semantic_ndp_feature_tool_started.png"
Wait+Screen /California current wildfire features/
Wait+Screen /sample: Laguna Fire/
Wait+Screen /current_wildfires_ca.json/
Screenshot "visual_loop/screenshots/semantic_ndp_feature_tool_summary.png"
Wait+Screen /session: seeded session 1 .* idle/
Screenshot "visual_loop/screenshots/semantic_ndp_feature_tool_final.png"
Sleep 300ms
Type "q"
