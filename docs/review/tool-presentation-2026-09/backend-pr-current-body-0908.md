## Current qualification — 2026-09-08

Backend `3db6b243eaf226368d69b16daf745865b3265147`; UI `52c31eb2d15e4c591c43f4cd9768ed3005338b78`. The existing stacks and preserved contained generation remain intact.

- Fresh workspace **Tool UI refinements**, with numbered real sessions: 01 files/diffs/Markdown/artifact, 02 Plan badge/review, 03 Work state/live terminal/reconnect, 04 Web conversion/Wait/Collect/child links, 05 native loaded skill.
- One compact filename/size header and one bounded bordered document; rendered Markdown in file Preview with exact wrapped Source; no document-wide horizontal scrolling. Live converted-PDF review found and fixed intrinsic-width growth in the Radix scroll container.
- Plan review remains outside both outer Activity and inner iteration disclosures. Recorded Plan mode survives reload; approval remains pending deliberately in the fresh example.
- Read-only Work canvas shows todos, current goal/loop, retained paged goal/loop history and schedules. A compact work summary sits above the composer. Prior overwritten history is explicitly unavailable; stopped is never mislabeled paused/completed.
- Canvas resizing preserves the earlier reading anchor. Live clean-reload replay preserved the same assistant row top (-249 px) while scrollTop changed 549 -> 609 -> 549 as the column narrowed/widened. New regressions cover middle positions in short in-flow and virtualized transcripts.
- Real final terminal replay: Running with only first output, reload while Running, retained output, then one ordered stdout/stderr/last sequence and exit 0. Exact command remains visible. Wait reports status/duration only; explicit Collect renders the report, not its serialized result.
- Final TUI audit found and fixed a remaining raw-detail/paging gap: semantic expansion, session/call/block-scoped Unicode page retrieval, cursor validation, separate technical toggle, close cancellation, late-response isolation, and authoritative stream offsets after tail-only reconnect snapshots. Failing-first test retained; complete compatibility suite/vet/build pass. Existing file/package ratchets are unchanged.
- Local verification: 785 web tests / 158 files; 110 core tests; 23 browser tests (zero retries/skips); lint/typecheck/build and guards pass. Backend focused groups 143, 8 and 7 pass (overlap not summed).
- Final exact-head CI completed successfully: [backend](https://github.com/iowarp/clio-agent/actions/runs/34283477376), [workspace](https://github.com/iowarp/gact-tui/actions/runs/34286817330), [Go CI](https://github.com/iowarp/gact-tui/actions/runs/34286817311), [UI schema](https://github.com/iowarp/gact-tui/actions/runs/34286817440), and [backend schema](https://github.com/iowarp/clio-agent/actions/runs/34283477399). Workspace includes the real native WebView proof and both desktop builds; release-only publishing jobs are conditional, not PR verification gates.
- Both Python 3.12 and 3.13 reported 7,262 passed, 84 skipped, 77 deselected, and 84.68% coverage. The skipped/deselected tests are NOT passed or accepted coverage: existing conditions include Windows-only checks on Linux, optional provider SDKs, and unavailable live relay services. Configured CI success is not an assertion that every repository test ran. Full no-skips acceptance remains unproven; no skip or exclusion was introduced to obtain green.
- Both exact commits are installed in clean runtime worktrees; standalone preflight ready, 13 blueprints and ARC sentinel. Original tabs/sessions are retained. Production source is committed; untracked local verification evidence is not a source overlay.

Separate execution defect discovered, not hidden or repaired in this observer-only change: the Codex goal judge raises `asyncio.run() cannot be called from a running event loop` and redrives already successful work. The probe goal was explicitly cleared and its history correctly says stopped / goal_abandoned. No claim of successful goal-judge execution. OS write confinement remains unverified; fresh fast PDF fetch does not independently qualify long-running conversion progress (earlier real conversion history and adapter tests are retained).

---

## Stack and scope

Stacks on #1330 (`codex/transcript-tool-output`), above #1329. Companion UI: iowarp/gact-tui#391, above #390/#389. No branches were flattened into develop and no merge is claimed.

Execution acknowledgement is not result presentation. The observer-only contract supplies provider-authored summaries and ordered text/Markdown, code, diff, terminal, link, checklist and media blocks. It never changes model observations, tool success, agent prose or ReAct termination. Presenter failures produce technical diagnostics, not retries or synthetic answers.

- Native registration requires a presentation declaration; the inventory gate also enumerates built-in file/shell tools. Specialized Plan, question, A2UI and handoff surfaces remain specialized.
- MCP adapter registration supports standard bounded content and CLIO Web Search. Arbitrary structured JSON stays in Technical details. New adapters need no frontend tool-name branches.
- Persisted Parts, session/call/block-scoped content pages, ordered shell deltas and reconnect snapshots retain complete output without transcript-sized JSON walls.
- File reads identify and render content; edit diffs are truthful, with one context line and newline markers. Skills show their loaded procedure. Shells show the exact command and live stdout/stderr.
- Wait shows requested children and terminal status/duration, never repeats their answers. Observe shows incremental progress; explicit task collection shows the actual readable report and child link.
- Todos, resources, goals, provider catalog, schedules, loops, messages and workflow tools declare meaningful results, including explicit empty/error states.
- Question and Plan pauses now persist the actual assistant transcript before retiring its live ledger. Resume creates a separate assistant turn; original parts survive restart exactly once. No model answer is synthesized.

## Compact-header refinement (historical checkpoint)

Backend `e000c14235c60f8abdf3aa1ef9fc62b8f4af81dc`; companion UI `4720c62bb7bf222f2cd2d868fa28331cc9270d42`.

- Registry-authored `action` and declared `subject` identify concise actions and essential targets. File reads/writes, skills, resources, collection and Web Search use this contract; model-visible inputs/results are unchanged.
- Existing retained file results receive the same declared header metadata through a read-only projection. No tool rerun, historical result rewrite, or frontend name/key inference.
- Focused group: 97 passed; later file/contract checks: 16 passed (overlapping counts). Ruff and final focused mypy passed.
- CI 34250187015 failed on optional empty header serialization and a fabricated empty file-start subject for an unrecognized argument shape. Fixed in source, preserving the existing transcript golden and execution assertions. Follow-up focused suites: 71 passed and 82 passed, without skips.
- CI 34255330314 failed the Python 3.12 fanout admission test: one child completed between running/queued assertions after its fixed sleep. Only the test synchronization changed: explicit release in finally, unchanged concurrency/terminal assertions, additional queued-reason assertion. All 34 workflow tests passed locally; Ruff passed. No runtime deadline or behavior changed.
- Authoritative exact-head CI: https://github.com/iowarp/clio-agent/actions/runs/34259661585 — PASSED. Python 3.12/3.13, flake-hunt and Flowcept integration all succeeded; schema 34259661575 PASSED. Both Python legs report 7,254 passed, 84 skipped, 77 deselected, 84.67% coverage. Skipped/deselected tests remain unverified, not accepted coverage. Prior failures are retained, not replaced with an earlier green run.
- Final installed pair `e000c142` / UI `4720c62b` passed readiness after historical rehydration; the actual Read/Write effects and file navigation were reviewed in the built-in browser in both themes. Original Light preference restored and retained sessions reopened for inspection.
- Same installed generation passed standalone containment/readiness, 13 blueprints and ARC sentinel. Cold rehydration initially exceeded startup/preflight probes; failed attempts are retained and no timeout was raised.

## Earlier campaign gates (historical heads)

Backend: `bfdd8f6f4b545b84ef58b4aa371deaded406db15`.

- Authoritative CI: https://github.com/iowarp/clio-agent/actions/runs/34220402038 — successful Python 3.12/3.13, flake-hunt and flowcept jobs. Schema 34220402045 successful.
- Broad matrix reports **7,247 passed, 84 skipped, 77 deselected** per Python leg; flake-hunt **153 passed, 1 skipped**. This is a green configured CI run, not a claim that skipped/deselected tests executed.
- Focused feature suites passed without skips: native/instrumentation/cron/presentation (101), final adapters/contract (59), loop lifecycle (30), pause/Plan/interaction regression group (63), strengthened disk-persistence/idempotence cases (2). Counts overlap and are not summed. Ruff, focused mypy and file-size ratchets passed.
- Genuine red-before-fix evidence includes provider and loop omissions and loss of paused assistant messages from disk. Previous failed CI attempts remain failed historical evidence, not replaced in place.

## Live tool inventory evidence

Contained generation `20260905-112411-20732` and marketplace `90404b3aed23939d2e7aceed1884a5555e51f4cc` preserved. No reset, session deletion, Defender weakening or model-response repair.

| Family | Actual retained qualification |
| --- | --- |
| Read / propose / apply edit / shell | `sess_707db645a949`: Markdown/code/plain reads, missing-file error, 42-to-43 edit, selected file in explorer, exact command, pre-completion stdout/stderr, reload during execution and one ordered final output. |
| Native skill / models / goals / cron / loop | `sess_acee83a03781`: real loaded procedure, eight provider results with real failures, explicit inactive goal/loop; disposable schedules created/listed/removed and final schedule list empty. |
| Spawn / parallel / Observe / message / Wait / collection | `sess_62e2ac5f5af8`: actual children, immediate and patterned observation, delivered message, committed wait with no repeated report, full rendered report through observation 20. |
| Resources | `sess_ad283c57c588`: all six resource tools; real uploaded PDF and Markdown derivative, custody identity, empty search result, filename opens the PDF. |
| Skill child / alert | `sess_7872ba92bc32`: real child skill, alert and child navigation. Child geocoded despite the probe's no-external-services restriction; that restriction FAILED and is not claimed as passed. No catalog/data staged. |
| Workflow | `sess_0fcbeea3ba69`: indexed data/analysis/visualization handoffs and returns; missing-input blockers visible. No claim that scientific acquisition succeeded. |
| A2UI / ask_user | `sess_6bc9da8dc0d9`: rendered surface, persisted waiting-user assistant, reload preserves seven original parts and question controls, Overview answer resumes a distinct assistant turn. Old failed restoration session retained. |
| Web Search / Fetch / Events | `sess_062de95cc427`, `sess_eb95fcba11bc`: real 87-second, 19-page PDF conversion `09ee742b-02bb-44cb-a048-8f0d1ec1de44`, saved Markdown/metadata, ordered queued/starting/docling/export/grobid/complete history and real document identity. Later fetch reused the conversion, not a second cold conversion. |
| Artifact / Plan / todos | Registered artifact canvas, all todo status tooltips, bounded lists; `sess_a8d215e6e8af` has Plan review/request changes/clear-context approval/Execute and exact 29-byte target. Latest UI additionally binds each Plan review to its immutable artifact version. |

## Boundaries, not hidden acceptance

- Generic MCP media has automated adapter/rendering coverage, not a new live production media-tool call in this pass.
- Conversion event history is verified; concurrent-child live conversion progress correlation is not claimed. Actual shell streaming and reconnect are verified.
- Six simultaneous HTTP/1 session streams can starve ordinary browser requests. This remains a separate transport limitation, not fixed by closing or grouping cards.
- Cold historical rehydration can exceed the ten-second readiness probe; no timeout was increased. Preflight was required again before new prompts.
- Runtime explicitly reports `codex_enforcement_unverified`; no OS write-confinement claim.
- Historical presentations, failed attempts and model mistakes remain unchanged. Required failed/skipped/cancelled/unrun checks are not acceptance.
