Output "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow.gif"

Set Shell "bash"
Set FontSize 14
Set Width 920
Set Height 760

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
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_catalog.png"

Down
Down
Enter
Wait+Screen /Agent Blueprint/
Wait+Screen /EarthScope/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_detail.png"

Type "q"
