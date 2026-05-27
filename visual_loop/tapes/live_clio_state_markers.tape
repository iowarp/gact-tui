Output "visual_loop/screenshots/live_clio_state_markers.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

# Provider/model swap follow-up session.
Hide
Type "GACT_ATTACH_SESSION_ID=sess_a6c3a15a2a78 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_provider_swap_top.png"
Type "G"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_provider_swap_bottom.png"
Ctrl+C
Sleep 200ms
Ctrl+C
Sleep 500ms

# Context pressure + explicit compaction follow-up session.
Hide
Type "GACT_ATTACH_SESSION_ID=sess_530d7025d35f ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_compaction_top.png"
Type "G"
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_compaction_bottom.png"
Ctrl+C
Sleep 200ms
Ctrl+C
