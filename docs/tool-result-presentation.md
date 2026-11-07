# Transcript results, not execution acknowledgements

The transcript should explain what the agent did, what it learned or changed,
and what is happening now. Technical details preserve maximum observability
without forcing the reader to decode JSON to understand the work.

## Adding or changing a tool

Human presentation is part of a tool's contract. Before coding, write a concrete
example of its collapsed row and expanded request/result. Establish what the
reader needs to know, then use the existing shared readers to show it.

| Operation      | Compact row                                                                | Content on expansion                                                               |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Delegate       | `Delegate to [Independent audit]` and status mark                          | Named assignment, recorded agent/model, actual assignment text.                    |
| Wait           | `Wait for [Build package] and [Independent audit] (1 returned, 1 running)` | Named result tabs containing the actual returned reports; no pending panel.        |
| Search         | `Search tasks for “calibration” (2 matches)` with useful scope/filter      | Linked matching tasks and relevant excerpts.                                       |
| Send a message | `Send message to [Independent audit]`                                      | Actual sent message.                                                               |
| Change memory  | `Correct [Color preferences]` and status mark                              | Actual change, such as `Favourite color: ~~red~~ → blue`, and `Scope: [Personal]`. |
| Edit a file    | `Edit [agenda.md]` and status mark                                         | Truthful bounded diff, with access to the complete retained change.                |

These are content examples, not six new component designs. Do not put every
argument in a new Input box or repeat the row under an Output heading. A simple
acknowledgement or wait with no returned content has no disclosure. Technical
details remain independently reachable. In a mixed wait, only returned content
or collection errors get tabs; do not explain again that pending tasks continue.

### Implementation path

1. For a supported first-party tool, add or update its declaration in
   `web/src/components/clio/tool-operation-contract.ts`. Choose the existing
   family and consequential subject/query/instruction fields. Use short actions
   with meaningful objects: `Search tasks`, not bare `Inspect`. Do not introduce
   compatibility aliases or hardcode an inventory count as a product limit.
2. Keep result semantics at their existing owner: producer-authored
   `ToolPresentation` blocks, the owning adapter, or the operation projection in
   `tool-operation.ts`/`tool-operation-data.ts`. Reuse `ToolOperationResult`,
   `ToolOperationSearch`, `ToolOperationValue` and `ToolResultPresentation`.
   Extend a shared reader when needed; do not add a per-tool card, file viewer
   or parallel raw-result parser. Unknown MCP tools retain the standard fallback.
3. Use exact task/session/file/resource identities and the existing
   `PresentationLink` navigation. Display names should be the links themselves.
   Preserve captured requests and results; never fetch today's state as a
   substitute for missing historical content. Keep routine IDs, cursors,
   scheduler policy and transport options in Technical details.
4. Preserve outcome distinctions. Submission accepted, execution returned and
   work accepted by review are different events. A failed fetch cannot acquire
   a success tick merely because its transport returned. An interruption has
   its own recorded cause. Never infer third-party failure from an arbitrary
   `status` field. Keep ordinary tool marks quiet; task-kind colors belong to
   the Work/task surfaces.
5. Bound long content using the existing preview, paging and full-content
   mechanisms. Use readable column widths and font sizes. Mount only the
   selected result tab, paginate large collections, defer nested data and cancel
   reads on close. A closed tool must not load every child's transcript or other
   sessions. Readable expansion must not open Technical details or duplicate a
   flow card already owned by the conversation.

### Required input/output showcase

Add representative inputs and matching recorded result shapes in the existing
test/review fixtures. Use enough data to exercise real layout: long assignments,
wrapped names, multi-page results, multiple returned reports, nested values or a
large diff as appropriate. Include a small success and the applicable running,
empty, partial, refused, failed and interrupted cases. Keep all synthetic values
in tests or fixtures, never production implementations.

Assert the actual readable input and result, the correct named navigation,
truthful status and access to complete retained content. Test null, false, zero
and empty text when those are valid results. Do not stop at "tool registered",
"panel mounted" or "call completed". Preserve the exact technical evidence.

Use `tool-operation.test.ts` for semantic projection, the owning presentation
tests for its content, and `tool-operation-result.test.tsx` for shared readers.
Extend `web/tests/review/tool-operations.tsx` and
`web/e2e/tool-operations.spec.ts` for interactive production-component examples.
Run applicable unit, type and lint checks plus the component browser suite in
`web/playwright.components.config.ts`. Inspect desktop and phone rendering,
chat and Evidence, disclosure, keyboard/focus, real link actions, paging and
overflow. Technical details should require an intentional action.

Showcases demonstrate presentation. Fresh native tool/agent runs must separately
establish that the work and all consequential intermediate outcomes were correct.
Record that distinction in the change's validation evidence.

## Shared presentation behavior

Tools share one operation row in chat and Evidence. The row contains the action,
named links, consequential query/filter context and useful counts. Status marks
remain quiet; interruptions use an amber stop mark with the cause on hover.
Ordinary acknowledgements have no disclosure. Exact arguments and raw results
remain in the separate Technical details viewer.

`tool-operation-contract.ts` declares the semantic inputs of canonical operations
once. `toolOperation` composes those declarations with recorded blocks and exact
task identities. Shared assignment, returned-result, search and literal-data
readers handle the content; `ToolResultPresentation` retains the existing file,
terminal, resource, memory, question and media renderers. Add semantics to the
declaration or the owning adapter, not another per-tool viewer. Resource and
artifact links reuse workbench navigation. Unsupported URI schemes never become
executable links. The four obsolete tool aliases are omitted from this registry.

The row and expansion have separate responsibilities. The row explains the
operation and target. Expansion shows the actual assignment, message, match,
change or answer. Do not add mandatory Request/Result panels, Work paragraphs,
status recaps, link-opening instructions, decorative dot separators or em dashes.
Use spacing to separate metadata. Memory scope values are links to a filtered
memory list, rather than links to nonexistent documents.

Delegation shows the named assignment, recorded profile/model when available and
the assignment text. A wait names its selection and returned/running counts.
It cannot expand until a result or collection error exists. Returned task tabs
mount only the selected answer; pending tasks have no empty result panel. Search
titles carry the query and scope, while expansion contains named matches and
excerpts. Structured-only and third-party output uses a bounded literal table or
field reader. False, zero, null and empty strings remain distinguishable.

Task-result continuation uses the existing authorized result endpoint and the
receipt's immutable cursor. It verifies contiguous Unicode offsets and result
reference consistency, joins fragments before parsing and cancels on tab close.
It never replaces historical results with a child's current transcript. A
missing first fragment or changed reference is an explicit read failure.
Explicit failure fields of known web/command/submission schemas are interpreted
by their owning adapter; arbitrary provider status strings do not override the
recorded execution outcome.

Flow results reuse the existing flow card and its viewport-aware loader. A
conversation boundary that already owns the card disables a second inline flow
disclosure. Opening a plain tool row does not preload children or other sessions.

The repeatable browser review is `web/e2e/tool-operations.spec.ts`, included in
`web/playwright.components.config.ts`. It renders production chat components
with labelled synthetic data at desktop and phone widths, including long
assignments, reports, result tabs, searches and model lists. This checks
presentation and navigation; it is separate from running native agents and
qualifying the meaning of their work.

The `connected_data` link target opens trusted source setup. Its `uri` is the
owning CLIO identity, and `workspace_id` must match the surrounding conversation.
The renderer checks the currently connected CLIO before opening the shared picker;
changing endpoint or credentials closes the action. The link carries no browser
authorization URL, callback, token, or source-creation authority. Authentication
stays outside the tool observation; the agent reads approved status separately.

Presenters may declare a short `action` and a `subject` block ID. A text/link
subject is rendered in the action row: `Write filename`, `Read source`,
or `Delegate to assignment`. Operation declarations identify consequential input
fields; the renderer does not guess from arbitrary payload keys. Long links truncate within the available width; hover
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
