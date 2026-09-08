# Transcript results, not execution acknowledgements

The transcript should explain what the agent did, what it learned or changed,
and what is happening now. Technical details preserve maximum observability
without forcing the reader to decode JSON to understand the work.

Tools and children share `ActivityRow`: the same alignment, icon scale, readable
14px details, status, and timing. Declared blocks sit beneath the row without a
large outer card. Arguments and raw JSON remain in Technical details.

`ToolResultPresentation` renders block types, not tool names or incidental result
keys. Add an upstream presenter or MCP adapter for new semantics; do not add a
frontend `if tool.name` branch. Resource and artifact links reuse conversation
workbench navigation. Unsupported URI schemes are never executable links.

`BoundedResult` measures actual rendered text rectangles, including soft wraps.
The local Appearance setting defaults to five display lines (range 1–50); diffs
receive at most twice that budget, without padding short diffs. Show more reveals
the complete short result in one action; Show less restores its preview. Large or
paged results open a separate dialog and retrieve the remaining content cursors
there, keeping the transcript bounded. Closing the dialog cancels its outstanding
read. Controls preserve focus, expose expanded state, and announce expansion.

File results show a single clickable basename that opens the workspace canvas;
full paths remain technical evidence. The row's right-aligned information button
opens a separate Technical details dialog, never an inline JSON wall. Todos use
empty pending boxes, amber in-progress dashes, and green completed checks. Their
preview shows three whole items rather than cutting wrapped task text in half.

Running terminals retain the command and use a scrolling line-budget viewport.
They follow output until the reader scrolls away. Completed output is replaced
by the final authoritative block, not appended again. Unicode-character offsets
match Python even when JavaScript uses two code units for a character.

Indexed todos expose task content and status. Child collection displays the
actual Markdown output rather than the serialized collection envelope. Longer
results remain expandable; acknowledgement summaries do not replace content.

Local validation covers geometry fixtures, paging, navigation, settings,
streaming, and the TUI declared-block renderer. Actual wrapping, streaming before
completion, and all required tool families still require live browser acceptance.
