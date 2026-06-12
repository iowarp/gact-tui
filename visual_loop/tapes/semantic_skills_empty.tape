Output "visual_loop/screenshots/semantic_skills_empty.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_skills.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/skills"
Enter
Wait+Screen /No skills available/
Wait+Screen /agent-blueprints/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_skills_empty.png"

Type "q"
