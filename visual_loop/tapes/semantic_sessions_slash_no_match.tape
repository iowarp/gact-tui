Output "visual_loop/screenshots/semantic_sessions_slash_no_match.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /seeded session/
Sleep 500ms

Type "/"
Wait+Screen /Commands/
Type "sessions"
Wait+Screen /sessions/
Enter
Wait+Screen /filter: \(type to filter\)/
Type "zzzz-no-match"
Wait+Screen /filter: zzzz-no-match/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_sessions_slash_no_match.png"

Type "q"
