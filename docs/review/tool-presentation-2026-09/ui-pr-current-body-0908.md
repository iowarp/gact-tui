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

Stacks on #390 (`codex/transcript-tool-output-ui`), above #389. Companion backend iowarp/clio-agent#1332 is above #1330/#1329. This remains a stacked PR, not a parallel branch off develop.

Tools and children share compact conversation activity rows and readable 14px details. Declared result blocks show what happened and what was learned/changed. Raw tool arguments/results stay behind the row's information icon in a separate scrollable Technical details dialog. No frontend tool-name/result-key inference or model-output rewrite.

- Rendered Markdown/skill procedures, source/code, truthful short diffs, exact shell command with ordered live output, artifact/resource/file/child links, typed todo states, and explicit error/empty results.
- Default five actual display lines (ten maximum for diffs), with soft wrapping. Three whole todo items initially. Local Appearance preference 1–50.
- One Show more reveals a complete short result or opens a separate complete long/paged viewer; no user-facing page ladder. All output remains available. Show less, keyboard focus, Escape, and vertical/horizontal scroll work.
- Pending/in-progress/completed icons have readable labels and tooltips on focus/hover, without acting as editable checkboxes.
- Shared reading anchors preserve position when opening/resizing the canvas; new output follows only when already following the end.
- File links use basenames, resolve workspace paths and select actual explorer entries. Plan attachments use the exact registered artifact ID, not a same-name version; missing identity never substitutes another plan.
- Latest real PDF review exposed intrinsic-width expansion from wide code/URLs. The shared result grid now uses a zero-minimum column, and declared Markdown is width-constrained with wrapping. Wide source remains scrollable inside its block.
- TUI has declared-block rendering and terminal-delta regression coverage.

## Compact-header refinement (historical checkpoint)

UI `4720c62bb7bf222f2cd2d868fa28331cc9270d42`; backend `e000c14235c60f8abdf3aa1ef9fc62b8f4af81dc`.

- Declared `Write (filename)`, `Read (filename)` and other concise action/subject headers replace duplicated standalone target lines. The payload remains in the effect; technical identity/arguments stay in the information dialog.
- Filename suffixes survive truncation; long full-path tooltips wrap at 14px and filenames open existing file-explorer tabs. Status/duration stay beside the shrinking subject.
- Results have subtle theme-aware shading and complete padded borders; diff additions/deletions have distinct semantic backgrounds. Existing AI Elements/shadcn components are reused.
- Final focused checks: 17 component tests and 13 browser tests passed, no retries; lint and typecheck/build passed. Earlier 27 presentation and 3 core transport tests also passed (overlap not summed).
- Contrast regression first failed at 3.2696:1 in light mode. Highlighted additions/deletions now use theme foreground over semantic tints; the browser test requires >=4.5:1 using composited actual backgrounds in both themes.
- Built-in browser review of the actual retained Plan session caught tooltip overflow, header wrapping and inherited button shrink-0 overlap. All were fixed with browser regressions. Final installed narrow-column review: 574px row with no overflow; subject ends at x=688.31, status starts at x=705.48. The full path wraps at 14px and file selection opens the named explorer tab. Actual file contents were also reviewed. Retained tabs remain open.
- CI 34252915956 failed during the welcome-to-docked-composer fixture transition. Setup now explicitly awaits the populated log and removal of the outgoing welcome region, while retaining the strict one-control assertion and zero retries. No assertions/deadlines weakened.
- Authoritative exact-head workspace CI: https://github.com/iowarp/gact-tui/actions/runs/34259567869 — PASSED, including native WebView proof and Windows/Linux desktop builds. Go CI 34259567865 and schema 34259567868 PASSED. Previous-head run 34253933578 is not substituted for this revision.
- Final exact-head installation passed readiness after historical rehydration; actual retained Write/Read and file-canvas navigation were reviewed again in the built-in browser in both themes. Light and original preferences restored, retained sessions kept open.

## Earlier campaign heads and validation

UI `49b082e3c9d516f7589f3454cd12d01b171b72b6`; backend `bfdd8f6f4b545b84ef58b4aa371deaded406db15`.

- Current authoritative UI workspace CI: https://github.com/iowarp/gact-tui/actions/runs/34246645887 — PASSED, including lint/types/tests/build/browser checks, Windows/Linux desktop builds, native WebView proof and release-matrix contract. Go 34246645965 and schema 34246645912 PASSED. Conditional release publishing jobs are not PR gates. Earlier green runs are not substituted for this head.
- Latest focused suite: **23 presentation tests passed**, **11 browser tests passed**, lint and typecheck/production build passed. Plan identity: **10 UI tests + 5 core repository tests passed**.
- Red width regression measured **79,868 pixels** of document overflow before the fix. Exact-ID regressions first failed by opening v1 instead of v3 and by substituting a same-name artifact when identity was absent.
- First combined width-suite attempt hit existing composer-transition fixture timing (one missing, one duplicate response control); isolated unchanged full rerun passed all eleven. No deadline/assertion weakened or retry configured. Original failures retained.
- Earlier exact-size checks cover 1003x1037 and 640x480, keyboard end/escape/focus restoration, code/diff horizontal scroll, actual wrapped-line budgets, terminal reconnect and short-dialog sizing.

## Live browser qualification

Same preserved generation `20260905-112411-20732`, marketplace `90404b3aed23939d2e7aceed1884a5555e51f4cc`. The earlier campaign install containment/readiness passed with ARC sentinel and 13 blueprints. Built-in browser recheck of the actual converted PDF reached its final references: paragraphs and long links now wrap inside the viewer, vertical scrolling works, and the document-wide horizontal overflow is gone. The current compact-header installation also passed standalone preflight after cold rehydration; initial timed-out probes are retained as failures, with no reset or increased timeout.

- `sess_707db645a949`: actual file/code/Markdown reads and edits, missing-file error, exact shell command; stdout/stderr visible before completion, reload while Running, one final ordered sequence; filename selects the correct explorer file.
- `sess_acee83a03781`: real native loaded skill, catalog refresh with actual provider successes/errors, goal/loop empty states and complete disposable schedule lifecycle.
- `sess_62e2ac5f5af8`: real spawn/parallel/Observe/message/Wait/task collection. Latest Wait contains child status/duration but no answers. Task collection is rendered Markdown; full viewer reaches numbered observation 20. All three todo icon states expose keyboard tooltips.
- `sess_ad283c57c588`: all six native resource operations, rendered derivative and PDF canvas navigation.
- `sess_7872ba92bc32` / `sess_0fcbeea3ba69`: skill-child/alert and workflow lifecycle reviewed; real domain/input failures remain visible.
- `sess_6bc9da8dc0d9`: A2UI, question pause persisted across reload, normal user selection and distinct resumed assistant; original parts appear once.
- `sess_062de95cc427` / `sess_eb95fcba11bc`: real asynchronous PDF conversion, saved outputs, readable event history and full converted document. Latest width defect was discovered in the real final references, not concealed as a passing screenshot.
- `sess_a8d215e6e8af`: Plan review, request changes, clear-context approval, automatic Execute/posture transition and exact file. Latest review opens version 3 / b45da5438c18; original review opens version 1 / 1d20a9e1a198.

## Explicit boundaries

Generic MCP media has automated adapter/render tests, not a new production media call. Concurrent-child live conversion progress correlation is not claimed; event history and live shell streaming are verified. Six simultaneous HTTP/1 session streams can starve ordinary requests; this separate transport limitation remains, not a presentation fix. Cold rehydration can exceed the readiness probe. Runtime does not enforce OS write-confinement. Child geocode violated a no-external-services probe constraint; it is retained as a failed constraint, not a success.

Old sessions, failed attempts, model prose and technical outputs are preserved. Required failed/skipped/cancelled/unrun checks never count as accepted. Release-only conditional publishing jobs are not PR qualification checks.
