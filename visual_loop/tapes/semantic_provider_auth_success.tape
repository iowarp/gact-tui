Output "visual_loop/screenshots/semantic_provider_auth_success.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_provider_auth_success.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Ctrl+S
Sleep 300ms
Enter
Wait+Screen /Provider/
Up
Wait+Screen /ALCF Sophia/
Wait+Screen /Provider unavailable/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_provider_auth_success_before.png"

Enter
Wait+Screen /Authenticate/
Sleep 200ms
Enter
Wait+Screen /ALCF Globus token ready/
Wait+Screen /gpt-oss-120b/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_provider_auth_success_after.png"

Type "q"
