Output "visual_loop/screenshots/live_clio_artifacts.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_d993083e3584 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_clio_artifact_transcript.png"

# Move focus to the transcript and expand the bottom answer/tool evidence.
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "G"
Sleep 300ms
Up
Sleep 200ms
Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_artifact_detail.png"

Escape
Sleep 200ms
Type "q"
