Output "visual_loop/screenshots/issue57_ask_user_retry.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_ask_user_retry.sh"
Enter
Show

Wait+Screen /agent question/
Wait+Screen /retry attempt/
Sleep 400ms
Screenshot "visual_loop/screenshots/issue57_ask_user_retry.png"

Tab
Tab
Type "N"
Type "m"
Type "a"
Wait+Screen /Answer agent question/
Sleep 300ms
Screenshot "visual_loop/screenshots/issue57_ask_user_answer_modal.png"

Escape
Type "n"
Type "m"
Type "T"
Wait+Screen /Retry with notes/
Sleep 300ms
Screenshot "visual_loop/screenshots/issue57_retry_notes_modal.png"

Escape
Type "m"
Type "M"
Wait+Screen /Retry with model/
Type "anthropic/claude-sonnet"
Wait+Screen /provider-side KV cache/
Sleep 300ms
Screenshot "visual_loop/screenshots/issue57_retry_model_modal.png"

Escape
Type "q"
