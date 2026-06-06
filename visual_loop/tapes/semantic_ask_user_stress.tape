Output "visual_loop/screenshots/semantic_ask_user_stress.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_ask_user_stress.sh"
Enter
Show

Wait+Screen /Ready to exercise live ask-user lifecycle states/
Wait+Screen /Which evidence source should the seismic workflow inspect first/
Wait+Screen /Answer agent question/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_ask_user_choice_initial.png"

Tab
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_ask_user_choice_selected.png"
Enter
Wait+Screen /answer submitted/

Wait+Screen /Add a short operator note for the benchmark evidence report/
Type "Prefer the EarthScope trace because it produced a compact SAC artifact."
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_ask_user_freeform_draft.png"
Enter
Wait+Screen /answer submitted/

Wait+Screen /Cancel this stalled fallback branch before continuing the demo/
Wait+Screen /Ctrl\+X cancel/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_ask_user_cancel_prompt.png"
Ctrl+X
Wait+Screen /question cancelled/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_ask_user_cancelled.png"

Type "q"
