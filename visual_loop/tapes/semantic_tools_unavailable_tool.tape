Output "visual_loop/screenshots/semantic_tools_unavailable_tool.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/tools"
Enter
Wait+Screen /Actions and MCP/
Wait+Screen /legacy_waveform_fetch/

Down
Down
Down
Down
Down
Down
Wait+Screen /▌.*legacy_waveform_fetch/
Enter
Wait+Screen /Unable to load this detail/
Wait+Screen /EarthScope connector/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_tools_unavailable_tool.png"

Escape
Sleep 200ms
Escape
