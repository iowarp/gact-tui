Output "visual_loop/screenshots/semantic_provider_edge_states.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_provider_edge_states.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Ctrl+S
Sleep 300ms
Enter
Wait+Screen /Provider/
Wait+Screen /Local emulator/
Wait+Screen /unavailable/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_provider_edge_catalog.png"

Up
Wait+Screen /ALCF Sophia/
Wait+Screen /token expired/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_provider_edge_auth_required.png"

Enter
Wait+Screen /Authenticate/
Sleep 200ms
Enter
Wait+Screen /Globus token expired/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_provider_edge_auth_failure.png"

Type "q"
