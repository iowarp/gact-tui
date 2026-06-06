Output "visual_loop/screenshots/semantic_skills_catalog.gif"

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

Type "/skills"
Enter
Wait+Screen /Skills supplied by installed experts or active workflow blueprints/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_skills_catalog.png"

Type "q"
