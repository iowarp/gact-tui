Output "visual_loop/screenshots/semantic_doctor_smoke.gif"

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

# Doctor tabs: verifies the health/capability tab strip uses the shared
# modal surface and render-time hit geometry.
Type "/doctor"
Enter
Wait+Screen /Doctor/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_menu_doctor_health.png"
Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_menu_doctor_capabilities.png"
Escape
Sleep 300ms

Type "q"
