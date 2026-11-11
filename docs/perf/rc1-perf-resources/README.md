# RC1 performance and resources (data layer)

Before and after for the data, loading and rendering-cost fixes on
`jaimecernuda-rc1-perf-resources`. Both runs are full `pnpm perf` web runs
(3 repetitions) on the same machine (Windows 11, 12 logical CPUs, 32 GB,
Chromium 151). The before run is `c1e6e2b2` with the corrected scale fixture,
so its large-file numbers are comparable. Budgets live in
[`web/perf/budgets.json`](../../../web/perf/budgets.json).

| File                                                                        | Contents                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [perf-report.md](perf-report.md) / [perf-report.json](perf-report.json)     | `pnpm perf` after (web).                                           |
| [perf-desktop.md](perf-desktop.md) / [perf-desktop.json](perf-desktop.json) | `pnpm perf --quick --desktop --scenarios desktop` after (one run). |

## Web: before and after

Before: 13 within budget, 17 over. After: 21 within, 9 over. Bold is over
budget.

| Measure                                              | Before        | After      | Budget           |
| ---------------------------------------------------- | ------------- | ---------- | ---------------- |
| Menu open p95                                        | **318 ms**    | **288**    | 100 ms           |
| Picker open p95                                      | **311 ms**    | **186**    | 100 ms           |
| Dialog open p95                                      | **169 ms**    | 99         | 100 ms           |
| Toggle p95                                           | 96 ms         | 49         | 100 ms           |
| Keypress p95                                         | 42 ms         | 37         | 50 ms            |
| Canvas tab p95                                       | **218 ms**    | **159**    | 150 ms           |
| Tree p95                                             | 31 ms         | 38         | 100 ms           |
| First navigation p95                                 | **358 ms**    | 63         | 300 ms           |
| Older page on scroll p95                             | **370 ms**    | **341**    | 300 ms           |
| File ready p95 (20 MB CSV and log)                   | **2,499 ms**  | 403        | 500 ms           |
| Conversation switch p95 (huge tail first paint)      | **606 ms**    | **433**    | 300 ms           |
| Interaction event duration p95                       | **256 ms**    | **160**    | 100 ms           |
| Longest task during an interaction                   | **440 ms**    | **286**    | 200 ms           |
| Layout shift during a cold load                      | **0.6**       | 0.1        | 0.1              |
| Huge conversation: cold load to tail painted         | 1,439 ms      | 1,140      | 1,500 ms         |
| Huge conversation: unbounded transcript reads        | 0             | 0          | 0                |
| JS heap after opening 20 MB files                    | **450 MB**    | 36         | 300 MB           |
| DOM nodes with a 20 MB file open                     | **960,655**   | 5,804      | 30,000           |
| Renderer RSS with a 20 MB file open                  | **7,304 MB**  | 232        | 800 MB           |
| Renderer CPU idle on a running conversation          | **6.5 %**     | 4.0        | 5 % of a core    |
| Renderer RSS idle                                    | 200 MB        | 174        | 400 MB           |
| JS heap idle, huge conversation, 2,000 conversations | 30, 37, 33 MB | 30, 37, 33 | 150, 300, 150 MB |

Conversation switch and older-page steps vary by about ±60 ms between runs
while other sessions share the machine: three quick runs of the huge scenario
after the fix gave 517–580 ms for the switch and 318–354 ms for older pages.

## Desktop: before and after

Debug desktop builds (`tauri:build:debug`) of `rc1/ui-liftoff` at `bacb828f`
(before) and this branch (after), each run six times, alternating, with
`pnpm perf --quick --desktop --scenarios desktop`. Values are medians of the
six runs; latency rows are each run's p95. Both builds are within every
desktop budget.

| Measure                                 | Before   | After | Budget   |
| --------------------------------------- | -------- | ----- | -------- |
| Menu open p95                           | 164 ms   | 95    | 100 ms   |
| Picker open p95                         | 205 ms   | 131   | 100 ms   |
| Canvas tab p95                          | 177 ms   | 123   | 150 ms   |
| Toggle p95                              | 65 ms    | 38    | 100 ms   |
| Keypress p95                            | 36 ms    | 37    | 50 ms    |
| Interaction event duration p95          | 176 ms   | 116   | 100 ms   |
| Longest task during an interaction      | 197 ms   | 129   | 200 ms   |
| Huge conversation: cold load to tail    | 1,242 ms | 1,196 | 1,500 ms |
| Huge conversation: cold-load long tasks | 1,170 ms | 913   | —        |
| Total RSS idle (host + WebView2)        | 557 MB   | 551   | 600 MB   |
| Total RSS with the huge conversation    | 632 MB   | 616   | 900 MB   |

The ready-time budgets are web budgets; the desktop report lists them as not
measured and they are shown here for reference. Single desktop runs vary
widely on a shared machine (cold load to tail ranged 1,018–1,726 ms after and
1,104–1,346 ms before), hence the six-run medians. Backend RSS (`--endpoint`)
was not measured: it needs a contained live backend, and other sessions were
using the machine.

## What changed

1. **Large files.** Text files are read in 1 MB ranges (the head, more on
   scroll, or the end on request), never whole, and an unknown size no longer
   bypasses the cap. Text renders through a virtualized line view. A partial
   file shows the shared `StateView` row with Show end and Load more.
2. **Polling.** Session, message, steer, permission and question queries poll
   only while the live stream is unhealthy, and never in hidden tabs. Stream
   invalidations are coalesced.
3. **Timers.** One shared clock drives every running duration; only mounted,
   visible subscribers tick.
4. **Transcript reads.** Previews, More details, search, the subagent canvas
   and live projections read bounded pages or the tail.
5. **Huge conversation.** Message blocks decode by type before the tolerant
   union, instead of failing eight strict schemas per block. Intl formatters
   are cached. The markdown renderer loads with the tail and renders without
   suspending, so rows no longer reflow from plain text after first paint
   (the 0.6 layout shift). Closed activity chains no longer mount an empty
   node per row whose presence check forced a style recalculation.
6. **A2UI catalog.** Sessions share one decoded catalog row when the rows are
   identical (same checksum, sidecar and producibility), in a bounded cache,
   instead of each session holding its own 126 KB copy.
7. **Routes.** Secondary routes prefetch on hover, focus and idle, and a
   loaded route renders without suspending: React holds a revealed fallback
   for 300 ms.
8. **Menus.** The ten global `::highlight()` attention rules made every style
   recalculation compute highlight styles for every element. They now mount
   only while attention heat is shown. Radix modal menus cause about three
   full-document recalculations on open, so this nearly halved menu, picker
   and Ctrl+K opening.
9. **Observability.** The evidence-sources state uses `isLoading`, so a
   disabled query no longer shows loading forever.

## Still over budget, and who should own it

| Measure                                               | Cause                                                                                                                                                                                                                                                                                                                               | Owner                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Menu p95 288 ms                                       | The usage summary is a hover card with a deliberate 250 ms open delay. Other menus open in 125–160 ms.                                                                                                                                                                                                                              | Menus surface                           |
| Picker 186 ms; menus ~130 ms (desktop picker 131 ms)  | Radix `modal` menus change body styles, which forces about three full-document style recalculations of ~25 ms each. The cost is Tailwind `**:` utilities (`:is(.x *)` has no fast reject), A2UI descendant selectors and `:has()` rules. Ctrl+K also forces layout in cmdk `scrollIntoView`.                                        | Shared components (#726), menus surface |
| Canvas tab 159 ms                                     | Opening the customize-agent tab; a 5,000-entry file tree mounts every row.                                                                                                                                                                                                                                                          | Canvas and file explorer surfaces       |
| Switch 433 ms; older page 341 ms; longest task 286 ms | React Query notifies through `useSyncExternalStore`, so a new page renders synchronously: about 40 rows of markdown, footers, actions and tooltips (~2,500 nodes), then one forced style calculation of that DOM. Lighter rows are the remaining lever, for example per-row actions and tooltip wrappers mounted on hover or focus. | Conversation surface                    |
| Back to workspace 263 ms                              | Workspace page mount.                                                                                                                                                                                                                                                                                                               | Conversation and workspace surface      |

## Server follow-ups

- An `ETag` on the A2UI catalog, so a reconnect revalidates instead of
  downloading 126 KB.
- A flows-only endpoint for the Runs Flows tab. It reads whole transcripts,
  one page of sessions at a time, and keeps only the flow tool calls.
