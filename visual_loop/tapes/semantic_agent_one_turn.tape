Output "visual_loop/screenshots/semantic_agent_one_turn.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agents-list"
Enter
Wait+Screen /Agents/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_catalog.png"

Type "o"
Wait+Screen /next turn agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_one_turn.png"

Type "q"
