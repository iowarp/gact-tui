Output "visual_loop/screenshots/semantic_agent_blueprint_tree_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_blueprint_tree_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent-blueprints"
Enter
Wait+Screen /Agent Blueprints/
Wait+Screen /◆ San Diego/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_catalog.png"

Down
Down
Enter
Wait+Screen /Agent Blueprint/
Wait+Screen /EarthScope/
Wait+Screen /Visualization/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_detail.png"

Down
Down
Down
Down
Enter
Wait+Screen /seismic analysis/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_expert_detail.png"
Escape
Wait+Screen /Agent Blueprint/

Escape
Wait+Screen /Agent Blueprints/
Type "s"
Wait+Screen /Marketplace sources/
Wait+Screen /EarthScope NDP Demo Marketplace/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_sources.png"

Type "q"
