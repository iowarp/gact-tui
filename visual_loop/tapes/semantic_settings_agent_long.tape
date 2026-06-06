Output "visual_loop/screenshots/semantic_settings_agent_long.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_management_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent"
Enter
Wait+Screen /Settings/
Wait+Screen /Expert/
Wait+Screen /Long Routing Title/
Wait+Screen /Fragile User Expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_settings_agent_long_top.png"

Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Wait+Screen /Fragile User Expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_settings_agent_long_scrolled.png"

Enter
Wait+Screen /Expert ·/
Wait+Screen /Can use/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_settings_agent_long_detail.png"

Type "q"
