Output "visual_loop/screenshots/semantic_agent_blueprint_sources.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_prompt_catalog.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent-blueprints"
Enter
Wait+Screen /Blueprint library/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png"

Type "s"
Wait+Screen /Marketplace sources/
Wait+Screen /Enter source details/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_registry.png"

Type "d"
Wait+Screen /confirm remove/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_remove_confirm.png"

Down
Wait+Screen /Seismic Waveform Review/
Wait+Screen /Enter install selected blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_install_row.png"

Up
Wait+Screen /Enter source details/
Sleep 300ms
Enter
Wait+Screen /Marketplace connection/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png"
Escape
Sleep 300ms
Wait+Screen /Marketplace sources/

Down
Wait+Screen /Enter install selected blueprint/

Enter
Wait+Screen /agent blueprint installed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_installed.png"

Type "q"
