Output "visual_loop/screenshots/semantic_long_single_line_input.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 720

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "Explore current California NWS warning features through NDP, normalize every epoch timestamp into ISO timestamps, summarize active warning records, and produce the artifact california_nws_warnings.json with concise evidence suitable for a live benchmark demo discussion."
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_long_single_line_input.png"

Ctrl+C
Sleep 100ms
Ctrl+C
