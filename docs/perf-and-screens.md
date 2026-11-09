# Performance, resources and screenshots

Two commands measure the Web and Desktop interface for the
[RC1 campaign](design/rc1-campaign.md). Both start their own deterministic
fixture stack (the e2e fixture service, a scale proxy and `vite preview` of the
built app) on private ports and stop it on exit. Neither needs a running CLIO.

```sh
pnpm build            # both commands serve web/dist
pnpm perf             # performance + resources, ~6 min
pnpm screens          # every surface and state, dark + light, 5 widths
```

Arguments pass through, for example `pnpm perf --quick --scenarios large-files`
or `pnpm screens --widths 1280 --themes light --only settings,canvas`.
Paths given to `--out` are relative to `web/`.

## `pnpm perf`

`web/perf/run.mjs` drives Chromium (Playwright) through scripted journeys that
press every reachable control: left bar, header menus, composer pickers and
menus, slash and `@` menus, transcript disclosures, workbench tabs and file
viewers, settings pages, runs, infrastructure and global search. Controls are
found by accessible role and name, like the e2e suite. A control that is
missing is reported as _not measured_ rather than failing the run, so the
report doubles as an inventory check.

Per interaction it records:

| Field                                       | Meaning                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `readyMs`                                   | Input event to the first animation frame in which the expected UI is visible (menu, dialog, listbox, heading, fetched page). |
| `eventMs`                                   | Event Timing duration: input delay + handlers + next paint.                                                                  |
| `longTaskMs`, `maxLongTaskMs`, `worstFrame` | Long tasks and Long Animation Frames until the UI settles, with the script that blocked the worst frame.                     |
| `cls`, `clsWithInput`                       | Layout shifts without and with recent input.                                                                                 |
| `heapMB`, `nodes`                           | JS heap and DOM node count from CDP after the step.                                                                          |

Process resources come from the OS (`process-sampler.mjs`): RSS, private bytes
and CPU time for the browser, its renderers, the fixture service and, with
`--desktop`, the Tauri host plus its WebView2 processes.

Scenarios (`--scenarios`):

| Scenario                  | What it exposes                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactions`            | Every control on the flat-NDP session; cold load; idle CPU and heap growth on a running conversation; request polling.                                                                                   |
| `huge-conversation`       | 5000 messages with 2 tool calls each. Tail first paint, older pages on scroll, and any unbounded `/messages` read.                                                                                       |
| `many-sessions`           | 2000 conversations across 51 workspaces. Sidebar, global search and attention with a large index.                                                                                                        |
| `large-files`             | A 5000-entry tree and 20 MB CSV and log files. Per-file heap, DOM nodes and renderer RSS after the viewer settles.                                                                                       |
| `desktop` (`--desktop`)   | The debug Tauri app over the WebView2 DevTools port (`--desktop-cdp-port`, default 9339). Build it first with `pnpm --filter @clio/desktop tauri:build:debug` or point `--desktop-exe` at another build. |
| `live` (`--endpoint URL`) | A running CLIO: backend RSS/CPU (`--backend-pid` or the endpoint's listening process), cold load and journeys against real data. Serve the web app separately and pass `--base-url`.                     |

Other flags: `--quick` (one repetition, 8 s idle windows), `--repeat N`,
`--idle S`, `--huge-messages N`, `--strict` (exit 1 when a budget fails),
`--rebudget REPORT.json` (re-evaluate an earlier report against the current
budgets without measuring).

Outputs in `--out` (default `web/test-results/perf`): `perf-report.json` with
every step, request log summary and process sample, and `perf-report.md` with
budget verdicts, per-category percentiles, the slowest interactions and
resource tables.

### Budgets

[`web/perf/budgets.json`](../web/perf/budgets.json) holds the proposed RC1
budgets. Interaction budgets are p95 of `readyMs` per category. Layout shift is budgeted per
interaction (0.05) and per cold load (0.1). Resource
budgets cover idle and large-data heap, DOM nodes, renderer and desktop RSS,
idle CPU and unbounded transcript reads. Idle CPU is sampled inside the idle
window's forced garbage collections, so the harness's own GC is not counted.
Each budget is checked against the
[baseline](perf/baseline/README.md); change a budget only with evidence from a
report.

### Memory cycles

`node web/perf/cycles.mjs [--cycles 10] [--only settings,command-menu]` opens
and closes sessions, viewers and dialogs repeatedly against the built `web/dist`.
It reports heap, DOM nodes, listeners and detached nodes after forced GC. Growth
that scales with the cycle count is a leak; a fixed step after warm-up is a cache.
Add `--snapshots` to save heap snapshots that name what grew.

## `pnpm screens`

`web/perf/screens.mjs` captures each catalogued surface and state at 1680,
1280, 1024, 768 and 390 px wide, in dark and light themes. The catalogue covers
connect (first run, unreachable), the session (conversation, loading, load
error, every header and composer menu, `@` and `/` menus, dialogs, sidebar and
activity states), every workbench tab and file viewer type, every settings
page, runs, every infrastructure page, not found, and scale states.

Determinism:

- Page clock frozen at 2026-09-01 15:00 UTC; the fixture processes run with
  `Date` frozen two minutes earlier (`perf/fixed-clock.mjs`).
- UTC, `en-US`, reduced motion (`clio.appearance.v1`), Playwright
  `animations: 'disabled'`, hidden caret, and the pointer parked off-target.
- The fixture is reset per shot and seeds fixed workspaces, files and
  conversations (`perf/scale-fixture.mjs`).
- The capture waits for fonts and for transient "Loading…" text; a placeholder
  that persists is listed in the report as a fixture gap.

Outputs in `--out` (default `web/test-results/screens`):
`<theme>/<width>/<surface>--<state>.png`, `screens-manifest.json` and
`screens-report.md`. The report lists failed captures, persistent loading
placeholders, horizontal overflow, page errors, and a theme-gap scan: large
visible surfaces painted with the other theme's background. `--merge` updates
the manifest already in `--out` instead of replacing it, so a subset rerun
(for example `--widths 390 --only settings-- --merge`) keeps the rest of the
set.

Full-page captures follow the document. The app shell scrolls inside its own
panels, so content below a panel's fold is not in the image.

### Where screenshot sets live

A full run produces about 800 PNGs (~250 MB). Do not commit them.

- Working sets stay in `web/test-results/screens/` (ignored by Git).
- Review sets for a PR: upload the folder as a CI artifact or attach a curated
  subset to the PR.
- Published images: copy curated captures into `docs/screenshots/` (this
  repository) or the CLIO site's `site/src/assets/captures/`, following
  `scripts/check_media_policy.py`. Only reports and manifests go under `docs/perf/`.

## Ports

| Command        | Fixture | Proxy | Preview |
| -------------- | ------- | ----- | ------- |
| `pnpm perf`    | 18811   | 18812 | 5181    |
| `pnpm screens` | 18821   | 18822 | 5191    |

Override with `CLIO_PERF_FIXTURE_PORT`, `CLIO_PERF_PROXY_PORT` and
`CLIO_PERF_PREVIEW_PORT`, or `--port-offset` for screens.

## Adding coverage

- A new control: add it to the matching journey in `web/perf/journeys.mjs`
  with a readiness spec (`{overlay}`, `{css, text}`, `{css, gone}`,
  `{css, changed}`, `{resource}`, `{all: [...]}`).
- A new surface or state: add a line to `catalogue()` in `web/perf/screens.mjs`.
- A new endpoint the fixture lacks: serve it from `scale-fixture.mjs`
  (see `infrastructureStubs()` and `seededFile()`).
