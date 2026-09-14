# Tool UI refinements — installed browser qualification, 2026-09-08

Workspace: **Tool UI refinements** (`ws_5b56ce232bc2`). All fresh examples are
in this workspace. Historical sessions and tabs are preserved.

## Exact installed revision

- Backend: `3db6b243eaf226368d69b16daf745865b3265147`, PR #1332 over #1330/#1329.
- UI: `52c31eb2d15e4c591c43f4cd9768ed3005338b78`, PR #391 over #390/#389.
  Web source is unchanged from visually qualified `2ce5b782`; the final commit
  completes the Go TUI's paged-result viewer and reconnect offsets.
- Preserved generation: `20260905-112411-20732`; API 8787, UI 5174, CTE 9413.
- Both runtime worktrees are clean detached checkouts of these commits; source-heads
  manifest matches. No reset, source overlay, or replacement generation was used.
  The development checkout retains untracked `validation/` evidence, reflected by
  its source-dirty flag; all production source is committed.
- Standalone preflight reported ready with ARC sentinel and 13 blueprints. The
  initial cold rehydration exceeded the probe timeout; that failure is retained.
- Runtime still reports OS write confinement unverified. Readiness is not a claim
  of enforced sandboxing.

## Fresh built-in browser evidence

### 01 — File previews and text wrapping

http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_a616f3032c3b

Real Markdown creation/read with frontmatter, heading, table and long URL; Python
read/propose/write/read changes 42 to 43; delayed PowerShell stdout/stderr; artifact
registration. Visually inspected compact Read/Write filename headers, size in the
same panel, one bordered bounded document preview, short unpadded source and diffs,
and exact filename navigation. Markdown file explorer defaults to rendered Preview
with an exact wrapped Source tab. No duplicated full-path line or raw JSON result.

### 02 — Plan mode badge and review

http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_fa70f194984e

Real Plan-mode message retains its recorded badge across reload. The real review
stays outside both Activity and iteration disclosures when collapsed. Approval is
still pending deliberately; the qualification request said not to execute the
proposed edit, and `example.py` remains 43. Failed preliminary shell/artifact calls
remain visible. No historical mode was inferred from prose.

### 03 — Work state and live terminal

http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_4893357bfe95

Real todos and goal were observed while active. The Work canvas now shows all four
completed todos, the retained stopped goal, loop/schedule empty states, and readable
14 px details in a 320 px panel without width overflow. Session work above the
composer reads 4/4 done. Status icons expose keyboard/hover labels.

Final reconnect replay: exact 25-second-sleep PowerShell command, first screenshot
shows Running and only `reconnect-first`; reload while running; second screenshot
shows Running with retained output; completion screenshot shows each of
`reconnect-first`, `reconnect-stderr`, `reconnect-last` once in order and exit 0.
The total tool duration displayed 34 seconds (including tool overhead); do not
substitute the configured 30-second command timeout for observed tool duration.

Separate execution defect found and preserved: goal judging raises
`RuntimeError: asyncio.run() cannot be called from a running event loop` from the
Codex provider. It redrove the already successful command. The goal was explicitly
cleared through `/goal clear` to stop this, so history truthfully says stopped /
goal_abandoned / 3 iterations, not completed. This observer-only campaign does not
repair or claim qualification of that agent-loop/provider execution failure.

### 04 — Web conversion and child results

http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_f2d82b23f5ee

Real child fetched the official HDF5 SWMR PDF with to_file=true: HTTP 200, 19 pages,
679853 bytes, saved Markdown/metadata and registered report artifact. Wait presents
task identity/status/duration only, without repeating the child answer. Explicit
get_agent_task_output is rendered as bounded Markdown under Collect, with its child
link and Show more, not a JSON wall. Failed collection attempts are preserved.

Child: `sess_0466f31d0813`. Saved Markdown opens the actual explorer file. Live review
found a Radix intrinsic-width bug from the converted table; after fixing it the
294 px Markdown viewport and article both have scrollWidth 294. Source stays
available separately. This fresh fetch completed quickly; it does not independently
prove a long-running conversion-progress stream. Earlier preserved conversion runs
and adapter tests cover that path.

Canvas resize: after a clean reload of the installed UI, keyboard PageDown into the
middle puts assistant row top at -249 px / scrollTop 549. Narrowing the canvas
changes scrollTop to 609 but preserves row top -249 px; widening returns scrollTop
549 and row top -249 px. Earlier hot-reloaded state still jumped and is not counted
as passing. Regression tests now cover middle positions in both short in-flow and
virtualized conversations.

### 05 — Loaded skill and resource results

http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_9035fb8c7183

Actual native load_skill (`edit-markdown-html`), not a substituted file read.
Rendered title, numbered instructions and bundled files; bounded initial preview,
Show more / Show less, aria-expanded=true while open. Installed preview headings
measure 16 px / 24 px line height; panel clientWidth and scrollWidth both 762 px.
Relative bundled references without an authorized URL remain explicitly blocked,
not invented working links.

## Tests and CI

- Latest focused browser suite: 23 passed, zero retries/skips.
- Core unit suite: 110 passed. Exact web-source UI suite: 785 passed / 158 files,
  no skipped tests. Complete TUI compatibility suite, go vet and go build passed.
- Local lint, typecheck, build, frontend reuse and file-size guards pass.
- Backend focused suites: 143 presentation/file/adapter/goal/loop/work tests,
  8 shell server tests, and 7 API guard/work-state tests passed (overlap not summed).
- Native registration gate scans every native_tool declaration and both built-in
  filesystem/shell registries. Family tests cover actual semantics, presenter
  failure isolation, paged authorization, exact Unicode reconstruction, delta
  ordering, and absence of child-result JSON walls.
- Final exact-head workspace CI 34286817330 passed, including native WebView,
  both desktop builds, lint/typecheck/unit/build/browser proof, and release-matrix
  contract. Go CI 34286817311 and schema 34286817440 passed. Conditional release
  publishing jobs are not PR verification gates and were not run.
- Backend exact-head CI 34283477376 completed successfully. Python 3.12 and 3.13
  each reported 7,262 passed, 84 skipped, 77 deselected, and 84.68% coverage.
  Lint/mypy/guards, Flowcept integration and concurrency checks passed.
  Schema 34283477399 passed.
- Previous backend run failed the fixed route-count inventory (new Work endpoint
  made 241 routes, not 240). Fixed count in current commit; no failed run is counted
  as acceptance. Broad backend suites contain existing conditional skips; those
  tests are not represented as passed. Required skipped checks are not acceptance.

Configured CI completed on both exact installed heads. This is not full no-skips
repository acceptance: the 84 skipped and 77 deselected tests remain unverified,
not passed. Existing conditions include Windows-only tests on Linux, optional
provider SDKs, and unavailable live relay services. No skip or exclusion was added
to obtain green. The separate goal-judge failure and OS-confinement limitation above
remain explicit; neither is hidden by presentation changes.

## Final client audit

The original TUI handled bounded declared previews but expanded into raw JSON and
ignored content_ref. The new failing-first regression recorded exactly that raw
wall. Selection now opens the semantic result, fetches session/call/block-scoped
Unicode pages, checks continuity, preserves the preview on fetch failure, cancels
on close, and ignores a late response. `t` toggles separate technical evidence.
Retained observations are unchanged. Stream deltas now use the authoritative
stream_offset after a tail-only reconnect snapshot and reject duplicate offsets.
Focused tests cover these paths plus five actual wrapped lines and paged-content
expansion hints. The frozen 612-file UI package and 600-line file ratchets pass.
