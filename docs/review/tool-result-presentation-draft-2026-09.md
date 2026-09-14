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

Presenters may declare a short `action` and a `subject` block ID. A text/link
subject is rendered once inside the action row: `Write (filename)`, `Fetch (URL)`,
or `Collect (child)`. The renderer never extracts the payload or guesses which
argument is important. Long subjects truncate within the available width; hover
and keyboard focus reveal the full identity, and declared links open normally.
Unknown or non-text/link subject IDs leave all result blocks visible. Existing
records retain their original blocks. Registered adapters may supply today's
action and subject placement during read-only projection; this never reruns a
tool, reads a file, or rewrites stored content. Unknown tools keep their labels.

Diff previews retain real unified-diff syntax, with semantic addition/deletion
backgrounds. The complete preview boundary remains visible when content is
clipped; a muted result surface separates effects from conversation prose without
putting a large card around every tool.

`BoundedResult` measures actual rendered text rectangles, including soft wraps.
The local Appearance setting defaults to five display lines (range 1–50); diffs
receive at most twice that budget, without padding short diffs. Show more reveals
the complete short result in one action; Show less restores its preview. Large or
paged results open a separate dialog and retrieve the remaining content cursors
there, keeping the transcript bounded. Closing the dialog cancels its outstanding
read. Controls preserve focus, expose expanded state, and announce expansion.

Technical details and full-result dialogs share `ResultDialogContent`. The title
and close control remain fixed; its keyboard-focusable ScrollArea owns vertical
overflow, with a visible scrollbar when content exceeds the viewport. Sections
must retain their natural height, never flex-shrink into an overflow-hidden clip.
Wide code uses a separately focusable horizontal scroll pane. Running terminal
viewports are keyboard-focusable too. Browser regressions cover a short window,
long arguments/results, and complete text, Markdown, code, diff, and terminal output.

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

Reading position is user-owned. A canvas resize or streamed update cannot enable
follow-latest merely because layout temporarily puts the reader near the bottom.
Queued scroll frames re-check intent before moving the viewport; a width change
preserves the visible message and its offset. Keyboard, wheel, touch and native
scrollbar intent yield immediately, without a timed re-pin window. Latest is the
explicit way to resume following. Clipped checklist items are inert until expanded,
so their status tooltips cannot become invisible keyboard stops.
