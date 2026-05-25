Output "visual_loop/screenshots/semantic_provider_setup.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

# Settings model tab hands off to the provider setup modal.
Ctrl+S
Sleep 300ms
Enter
Wait+Screen /Provider/
Sleep 1200ms
Screenshot "visual_loop/screenshots/semantic_provider_setup.png"

# Move inside the provider picker to verify the grid redraw remains stable.
Down
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_provider_setup_provider_changed.png"

Type "q"
