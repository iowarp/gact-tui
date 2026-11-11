# RC1 UI baseline

Baseline of the current UI (`rc1/ui-liftoff` at `ee6ab01c`, equal to `develop`
plus the visual-language reference) before the lift-off. Produced with the
commands in [perf-and-screens.md](../../perf-and-screens.md) on Windows 11,
12 logical CPUs, 32 GB, Chromium 151.

| File                                                                                    | Contents                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [perf-report.md](perf-report.md) / [perf-report.json](perf-report.json)                 | `pnpm perf --out ../docs/perf/baseline` (3 repetitions, web scenarios).                    |
| [perf-desktop.md](perf-desktop.md) / [perf-desktop.json](perf-desktop.json)             | `pnpm perf --quick --desktop --scenarios desktop` (debug Tauri build, WebView2).           |
| [screens-report.md](screens-report.md) / [screens-manifest.json](screens-manifest.json) | `pnpm screens`: every surface and state, 5 widths, dark and light. PNGs are not committed. |

## Numbers against budgets

Web: 16 within budget, 14 over. Desktop: 5 within, 0 over. Budgets live
in [`web/perf/budgets.json`](../../../web/perf/budgets.json). The proposed
budgets are kept: none is beyond reach, and the resource ceilings have room
the lift-off should not spend. A cold-load layout-shift budget (0.1, the
Web Vitals "good" threshold) was split from the per-interaction one.

| Measure                                                       | Web                                                       | Desktop (WebView2)         | Budget             |
| ------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- | ------------------ |
| Menu open p95                                                 | **303 ms** (usage summary 303–308, workspace actions 213) | **106 ms**                 | 100 ms             |
| Picker open p95 (search, model)                               | **242 ms**                                                | **144 ms**                 | 100 ms             |
| Dialog open p95                                               | **150 ms**                                                | —                          | 100 ms             |
| Toggle p95                                                    | 70 ms                                                     | 46 ms                      | 100 ms             |
| Keypress echo p95                                             | 29 ms                                                     | 29 ms                      | 50 ms              |
| Canvas tab p95                                                | 143 ms                                                    | 137 ms                     | 150 ms             |
| First navigation (settings, runs, infrastructure)             | **357 ms**                                                | —                          | 300 ms             |
| Longest task in an interaction                                | **269 ms**                                                | —                          | 200 ms             |
| Event duration p95                                            | **192 ms**                                                | —                          | 100 ms             |
| Cold load to conversation                                     | 942 ms                                                    | —                          | 1500 ms            |
| Huge conversation (5000 messages): tail first paint on switch | **435 ms**                                                | —                          | 300 ms             |
| Huge conversation: cold load to tail                          | 806 ms                                                    | —                          | 1500 ms            |
| Huge conversation: older page on scroll p95                   | 294 ms                                                    | —                          | 300 ms             |
| Unbounded transcript reads (huge conversation)                | 0                                                         | —                          | 0                  |
| Cold-load layout shift (huge conversation)                    | **0.57**                                                  | —                          | 0.1                |
| JS heap idle / huge conversation / 2000 conversations         | 30 / 37 / 33 MB                                           | 33 MB (huge)               | 150 / 300 / 150 MB |
| JS heap after opening 20 MB files                             | **454 MB**                                                | —                          | 300 MB             |
| DOM nodes with a 20 MB log open                               | **960,655**                                               | —                          | 30,000             |
| Renderer RSS with a 20 MB log open                            | **10,232 MB**                                             | —                          | 800 MB             |
| Renderer RSS idle                                             | 186 MB (browser total 338 MB)                             | —                          | 400 MB             |
| Desktop total RSS idle / huge conversation                    | —                                                         | 561 / 627 MB (7 processes) | 600 / 900 MB       |
| Idle CPU on a running conversation                            | **5.1 %** renderer, 6.6 % browser                         | 9.5 % total                | 5 % core           |
| Fixture backend RSS                                           | 56 MB                                                     | —                          | —                  |

The live CLIO backend (`--endpoint`) was not part of this baseline. Its RSS
budget (500 MB) is still unmeasured; run it against a contained dev backend.

The desktop numbers come from a debug build, so treat its CPU numbers as
upper bounds. Desktop interactions skipped open questions, version status,
usage summary and maximize canvas: the fixture leaves those controls hidden
at the default window size.

## Top offenders

1. **Large text files load whole and render every line.** Opening a 20 MB
   log builds 960k DOM nodes, takes the renderer to 10 GB RSS and can block
   the main thread for over 20 s.
   - [`resource-viewers.tsx:192`](../../../web/src/components/clio/resource-viewers.tsx)
     sets `canLoad = size === undefined || size <= INLINE_PREVIEW_MAX_BYTES`.
     An unknown size downloads everything.
   - Size is unknown for directory-scoped browsers and lazily expanded
     entries
     ([`workbench-resource-browser.tsx:136-139`](../../../web/src/components/clio/workbench-resource-browser.tsx)).
   - `FileTextView` → `FileSourceView` → `CodeBlock`
     ([`code-block.tsx:190`](../../../web/src/components/ai-elements/code-block.tsx))
     tokenizes and renders every line with no virtualization.
   - The CSV data view is virtualized (5.4k nodes) but takes 2.8 s to become
     ready.
2. **Polling continues while the live stream is connected and the tab is
   hidden.**
   - pending-steers every 1.5 s:
     [`use-session-mutations.ts:128-133`](../../../web/src/hooks/use-session-mutations.ts).
   - permissions and questions every 1.5 s:
     [`use-workspace-data.ts:235-263`](../../../web/src/hooks/use-workspace-data.ts).
   - The selected-session family every 1.5 s and messages every 5 s, both
     with `refetchIntervalInBackground: true`:
     [`use-workspace-data.ts:137-178`](../../../web/src/hooks/use-workspace-data.ts).
   - On top of that, the stream invalidates the same queries
     ([`use-session-live-stream.ts:442-472`](../../../web/src/hooks/use-session-live-stream.ts)).
   - The interval is `ACTIVE_SESSION_POLL_MS`
     ([`runtime-limits.ts:27`](../../../web/src/lib/runtime-limits.ts)).
   - Together with the 1 s React timers in item 3, this is the main source
     of idle CPU and of an always-busy network log.
3. **1 s React timers while idle.**
   - [`use-now.ts:3-13`](../../../web/src/hooks/use-now.ts),
     `a2ui-steps.tsx:126-133`, `conversation-gantt.tsx:48`,
     `observability-processes.tsx:85`, `use-reasoning-duration.ts:14` and
     `use-tool-duration.ts:27`.
   - Each re-renders its subtree every second, whether or not the elapsed
     text is visible.
4. **Whole-transcript reads outside the transcript view.** The transcript
   itself pages correctly (40 messages per page, 0 unbounded reads, flat
   heap). Several side panels still call `repository.transcript(id)` without
   a page
   ([`use-live-session-transcript.ts:39-43`](../../../web/src/hooks/use-live-session-transcript.ts)):
   - [`more-details-panel.tsx:54`](../../../web/src/components/clio/more-details-panel.tsx),
     `search-assistant.tsx:49` and `subagent-canvas-view.tsx:35`.
   - `use-conversation-preview.ts:10-14`, `routes/runs-page.tsx:186` and
     `use-workspace-data.ts:339`.
   - Opening any of these on a 5000-message conversation loads all of it.
5. **Menus and pickers block the main thread for 100–300 ms.**
   - Each open has a single long task. Usage summary, Ctrl+K search (333 ms
     `keydown` handler), workspace actions and the model picker are the
     slowest.
   - Model options are derived in
     [`model-options.ts`](../../../web/src/lib/model-options.ts) through
     `use-workspace-data.ts:35-36`.
   - Attention items are derived in `routes/workspace-page.tsx:101-124`.
6. **Huge conversation switch and paging.** Tail first paint takes 435 ms,
   with 250–280 ms timer/MessagePort tasks. Each older page costs 220–290 ms
   of script for 40 messages. The cold load shifts layout by 0.57 as the
   tail settles.
7. **The A2UI catalog is cached per session.** The 126 KB catalog is the
   largest cold-load request, and it is refetched for every conversation
   ([`processor-store.ts:74`](../../../web/src/lib/a2ui/processor-store.ts),
   invalidated in `a2ui-surface.tsx:330`).
8. **Lazy routes cost ~350 ms on first visit.** Settings, runs,
   infrastructure and connection each load their chunk on demand
   ([`App.tsx:29-42`](../../../web/src/App.tsx)) with no prefetch on hover
   or idle.

What is already good: keypress echo, sidebar toggles, the paged transcript
(heap flat at ~35 MB from tail to 5000 messages), 2000 conversations (33 MB,
the sidebar renders only visible groups) and idle heap growth (0.4 MB in
20 s).

## Light mode

The theme-gap scan (large surfaces painted with the other theme's
background) found no gaps in light or dark mode; see
[screens-report.md](screens-report.md). Light mode is complete enough to
capture every surface. Visual review against the reference is still part of
each surface workstream's round loop.

## UI gaps found while capturing

These are not redesign items; they are bugs or coverage gaps for the
surface workstreams.

- **Observability evidence never stops loading.**
  [`workspace-observability.tsx:70`](../../../web/src/components/clio/workspace-observability.tsx)
  sets `provenancePending: providers.isPending || execution.isPending`. The
  execution query
  ([`use-execution-provenance.ts:38-59`](../../../web/src/hooks/use-execution-provenance.ts))
  is disabled when no provider can be queried. A disabled query stays
  `isPending` in React Query v5, so "Loading evidence sources"
  ([`observability-dock.tsx:479`](../../../web/src/components/clio/observability-dock.tsx))
  spins forever next to "Recording unavailable". Using `isLoading` fixes it.
  This is why canvas observability, tab-menu and maximized are listed as
  still loading in [screens-report.md](screens-report.md).
- **Phone width (390).** The workspace menus, attention, infrastructure
  status and new-session/new-workspace dialogs are reachable only through
  the sidebar sheet; the capture opens the sheet first. The usage summary
  and Search everywhere (settings) are not reachable at all. The settings
  section navigation is hidden on phones, so the only way between settings
  pages is the back button.
- **Transcript outline** is offered only below 1280; wider layouts show the
  minimap instead. Captured at 390–1024 only.
- **Headings.** The Usage, Remote tools, Agents and Fleet settings pages
  have no `h1`. The Models `h1` reads "Models About Models".
- **Accessibility names.** There are two "Toggle Sidebar" buttons. The
  infrastructure status disclosure changes its name when expanded.
- **Layout.**
  - When the canvas is collapsed, its resize separator covers the "Open a
    canvas tab" button; the desktop journey could not click it.
  - The header "with [ ]" model select renders empty.
  - At narrow canvas widths the composer wraps "Queue" onto a second row.
- **Fixture coverage** (harness, not product).
  - `/v1/sessions/{id}/summon-targets` and the infrastructure
    catalog/model-server/provenance connections are not served, so
    infrastructure shows partial-load alerts.
  - The web `@` mention menu needs `x_clio_context_references.enabled`. It
    is measured on desktop (50 ms) but not on web.

## Screenshot inventory

Where screenshots are used today. The campaign replaces these with captures
from `pnpm screens`; nothing is replaced in this baseline.

### This repository

| Location                                | Images      | Used by                                                                                                                                                                       |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/screenshots/`                     | 54          | `docs/design/settings-organization.md`, `docs/workspace-presentation.md`, `docs/science-log-graph.md`, `CHANGELOG.md`, review notes. The root `README.md` has no screenshots. |
| `docs/design/visual-language/previews/` | 14          | The visual-language reference pages (spec, not product screenshots).                                                                                                          |
| `docs/ref/`                             | 11          | Frozen TUI studies; not product documentation.                                                                                                                                |
| `.github/workflows/apps.yml:254-268`    | CI artifact | Native desktop screenshots uploaded per build.                                                                                                                                |

Broken image references: `docs/science-log-graph.md:30-33` and
`docs/workspace-presentation.md:71-77` point to files that no longer exist.
There is no documentation site in this repository.

### CLIO site (`clio-agent/site`, Starlight)

| Location                    | Images | Notes                                     |
| --------------------------- | ------ | ----------------------------------------- |
| `site/src/assets/captures/` | 101    | Rendered through `GuideScreenshot.astro`. |
| `site/public/media/`        | 78     | Inline media.                             |
| `site/public/takes/`        | 65     | Recorded takes.                           |

No page switches images between light and dark; every capture is one theme.

Pages without screenshots: install, install-with-ai, connect-a-model,
workspace-panels, sessions, questions, models-and-usage,
managed-infrastructure, server-setup, search, evidence, working-with-files,
widgets, widgets/components, agents-and-plugins, extensions, mcp-servers,
flows, live-sources, following-work, permissions.

### Where full sets should live

A full `pnpm screens` run is about 800 PNGs. Keep it out of Git: review sets
as CI artifacts or PR attachments, and copy only curated images into
`docs/screenshots/` or the site's `src/assets/captures/` (both themes, using
a light/dark `<picture>` or the site's theme-aware image component).
