# Task activity with progressive disclosure

The Work popover now shows one compact row per task, with its name, kind,
status and available progress. A child represented by a durable Subagent task
is counted once. Clicking a row reveals the complete assignment and available
result; a separate disclosure contains handles, host and backend status. Child
conversation and canvas actions open the actual recorded session.

Pause, resume, cancellation and restart stay separate from row disclosure.
Confirmation dialogs identify the task and consequence first, with the complete
assignment behind **View assignment**. Dismissing a dialog does not execute it.
Legacy child-only records retain navigation without invented task controls.

![Compact phone overview](phone-paused.png)

![Assignment and conversation actions on demand](phone-details.png)

![Compact cancellation confirmation](phone-cancel-confirmation.png)

![Desktop overview](desktop-running.png)

## Actual service review

These captures come from the production build of GACT
`ff8da5b658c023f7ac7efab4607c152e87e66e2b`, served by isolated core
`fa294aff15870aa3cb64e4ac769bb4248ceba012` on Linux with Python 3.14.6/Core 2.3.1.
Actual Codex/Luna model calls created the child and accepted its Shell operation.
The browser exercised production HTTP controls and the negotiated SSE stream;
there are no mocked task responses in this review.

The final run, `codex-ui-progressive238`, passed:

- Desktop 1280×900 and phone 390×844, with no page/HTTP errors or viewport overflow.
- Keyboard row disclosure, complete original assignment custody, nested technical
  details, exact child conversation and canvas navigation, and no duplicate child.
- A 56-pixel collapsed task row and a popover growing from 204 to 512 pixels when
  details open, rather than clipping content into its initial height.
- Five pause/resume cycles while the accepted Shell operation continued.
- Confirmation dismissal, actual subtree cancellation, physical worker absence,
  and linked restart with a new handle, retained context and no command replay.
- Compact cancellation/restart confirmations, 277/297 pixels high on the phone,
  with complete assignment text available on demand and actions still reachable.

All eleven final captures were visually inspected. The four published copies
match their source hashes below. The full trace,
transcripts, session/task snapshots, build-member hashes and verdicts remain in
the release-recovery `mcp-agent-tasks/task-ui234/qualification239.json` receipt.
Public native evidence was copied with archive CRC and every member hash checked.
Birth-identified service, worker, browser and forwarding owners have ended.
The private Core and cache have verified custody and actual retirement receipts.

Twenty-seven focused cases passed individually/sequentially with one worker and
Node 1 GiB. The six affected confirmation cases passed again after the final
refinement; filtered test names are not executed cases. Scoped Oxlint/Prettier,
TypeScript with Node 2 GiB, six unchanged guards, diff checks and online/offline
production builds passed. Final-head CI is tracked separately in draft #590.

Earlier attempts remain recorded: 235 failed during the disclosure/navigation
review; 236 failed because the recorder misdecoded the status separator; 237
passed before the final confirmation refinement. Their failures are retained.
Full Tasks qualification remains incomplete; this review qualifies the changed
UI on this Linux/model route. It does not qualify protected native/confinement,
unavailable provider/relay or oversized-SSE routes, and changes no installation.

## Published capture hashes

| Capture | SHA256 |
| --- | --- |
| desktop-running.png | ab0222d4461cdb28691b9b82d846450f69af87232656f2ba822e90defeb2db31 |
| phone-cancel-confirmation.png | c88d04f5c996f9016ea27472e1a3d448aba257cc394170a908c9b22fd10943b0 |
| phone-details.png | 9530824198a0eb28bc9636a9f97abce41d5f56868009c552546d08dc91abba84 |
| phone-paused.png | 2080164e58e88ac249411250e73bf08aa400a5762a30eff13a6c247b122c17fe |
