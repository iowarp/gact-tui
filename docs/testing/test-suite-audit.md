# Test suite audit (RC1)

Status: proposal for review. No tests have been changed.

## Short answer

The suite is mostly not padding: about 91% of the sampled unit tests and about
60% of the e2e tests check real behaviour. It is slow and unreliable for four
structural reasons:

1. Every unit file runs in jsdom with 4 workers. About 70% of the unit time is
   collection and environment setup, not assertions.
2. The e2e suite runs on a single worker against a shared fixture server with
   global mutable state. The build also runs twice.
3. All of the above runs in one sequential CI job, and the native proof waits
   behind it.
4. One stale fixture route has turned the e2e step red in most runs.

A real thin layer of one-off markup and geometry tests exists. It sits mainly in
the surfaces RC1 is rewriting, and screenshot review guards those better.

## Evidence

### Inventory and time

| Layer                                                              | Tests                            | CI wall (median / max)                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit (vitest)                                                  | 4862 in 682 files                | 12.4 / 17.8 min                             | Reported duration 822 s: collect 1308 s, environment 719 s, setup 127 s, tests 895 s (summed across workers). `environment: 'jsdom'` applies to every file (`web/vitest.config.ts:18`), and 172 of 228 `.ts` test files never touch the DOM. `maxWorkers: 4` (`:21`). Slowest files: `conversation-viewport` 19.9 s, `deploy-clio-dialog` 16.3 s, `model-picker-search-facets` 15.1 s, `model-picker-filters` 14.5 s, `scientific-map-view` 14.3 s. |
| Core unit                                                          | 350                              | 27 s                                        | Fast. Pure logic.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Web e2e (Playwright)                                               | 182                              | 12.6 / 13.4 min                             | `workers: 1` and `fullyParallel: false` (`web/playwright.config.ts:27-30`). `pretest:e2e` runs a second production build (`web/e2e/build.mjs`). Slowest specs: `workspace` 88 s, `a2ui-data-everywhere` 81 s, `document-artifact-preview` 75 s, `component-gallery` 47 s, `composer-evidence` 46 s.                                                                                                                                                 |
| Component Playwright                                               | 53                               | 1.7–2.4 min                                 | Includes `component-gallery.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Visual comparison                                                  | 3 `toHaveScreenshot` calls       | inside e2e                                  | Only `workspace.spec.ts:703, 901, 1233`, with 6 baselines. Separately, there are 130 `page.screenshot` evidence writes, 159 `boundingBox` checks and 111 computed-CSS checks that nobody reviews as images. `pnpm screens` has no comparison step.                                                                                                                                                                                                  |
| Lint, typecheck, build                                             | not tests                        | about 1 min each                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Rust (desktop and runtime)                                         | about 332                        | inside `tauri-debug`, about 6–11 min per OS | `apps.yml:154-182` runs per-module `cargo test` filters that select about 87 tests. About 245 tests never run in CI, for example `gact_http_tests`, `clio_core_registry`, `supervisor_*`, `menu_spec_tests` and `ssh_*`.                                                                                                                                                                                                                            |
| Go (frozen TUI)                                                    | about 1389, plus about 81 others | `ci.yml` build-test 0.6 min                 | The TUI is frozen.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Python adapters                                                    | 55                               | 0.1 min                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`apps.yml` job `ci`** (lint · typecheck · test · build · visual) |                                  |                                             | **30.2 min median, 39.2 max.** `native-webview-proof` needs `ci` (`apps.yml:205`, 5.7 min), so a PR push takes about 36 min before it is green or red.                                                                                                                                                                                                                                                                                              |

Sources: job and step timings for 40 `apps.yml` runs, the per-test log of run
42492681646, and failure logs from 20 red runs.

### Where "2 hours" comes from

| Cause                   | Measurement                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI reruns               | Run 42468548103 took 136.8 min across two attempts. A red e2e step forces a full rerun of a job of about 30 min or more.                                                                                                                                                                                             |
| Serial local "run all"  | The root `pnpm test` is `pnpm -r --workspace-concurrency=1 test`. With `test:e2e` (a rebuild plus 1 worker), the components suite and `cargo test`, this runs one step after another.                                                                                                                                |
| Contended local machine | A local `vitest run` on this 12-core Windows host, shared with four RC1 sessions (46 node processes), had not finished after 38 min. It had stalled with no live workers and was stopped. CI does the same work in 13.7 min. The local unit suite is not usable as an inner loop while it uses jsdom for every file. |

### Failure history (25 of 38 runs red)

| Cluster                                                                                        | Runs                                     | Effect                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `404 /v1/sessions/sess_flat_ndp/summon-targets` trips the `unexpectedErrors` `afterEach` check | 12 of 12 sampled red runs                | The same 37 e2e failures each time. This is fixture drift: the app calls a route that `fixture-server.mjs` does not serve. It is not a flake and not a product bug. |
| `window.__TAURI_INTERNALS__.invoke is not a function` (`model-wait`, `transcript-activity`)    | about 7                                  | A test harness gap, not a product bug.                                                                                                                              |
| Other                                                                                          | 21 of 25 red runs failed in the e2e step | The unit step was rarely the cause.                                                                                                                                 |

### What the tests guard

| Sample                                      | Behaviour or contract | One-off DOM or markup | Snapshot or structure | Layout or geometry | Duplicated across layers        |
| ------------------------------------------- | --------------------- | --------------------- | --------------------- | ------------------ | ------------------------------- |
| Unit, 60 files and 333 tests (stratified)   | 303 (91%)             | 19 (5.7%)             | 10 (3%)               | n/a                | None found                      |
| Unit, heuristic over all 682 files          | about 3683            | about 268             | 0 `toMatchSnapshot`   | n/a                | 72 source-scan tests in 8 files |
| E2E, 58 files and about 247 generated tests | 145 flows             | 5                     | 2 evidence-only       | 117 (overlapping)  | None with unit tests            |

The "one-off DOM" bucket includes tests that only assert the presence of
classes, text or `data-*` attributes after rendering, with no interaction. The
"source-scan" tests read `.tsx` source and grep for patterns. These are lint
rules written as tests.

RC1 exposure: about 1550 rendered unit tests sit in surfaces S1–S4 (S1 530,
S2 357, S3 298, S4 361), and about 21 of those files are DOM-heavy. In e2e,
about 20 files and about 128 tests target layout or markup that the S1–S4
rewrites will change.

## Do HTML/DOM unit tests make sense here?

Yes, when the DOM is the interface. No, when they only freeze how the markup
currently looks.

| Keep as DOM unit tests                                                                                                          | Replace with visual review (`pnpm screens`, component gallery, `toHaveScreenshot`) |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Keyboard behaviour, focus order, roving tabindex, Escape handling                                                               | "Element has class X" or "badge text is Y" on a static render                      |
| ARIA roles, names and states (status is never colour-only, a product rule)                                                      | Pixel geometry (`boundingBox` widths and gaps) and computed CSS colours            |
| State machines rendered through the UI: streaming transcript, tool lifecycle (running, partial, failed, interrupted), selection | Toolbar ordering or icon choice                                                    |
| Contract rendering: A2UI catalog parsing, tool-operation readers, file-action registry ("one download, Export to…")             | Dense layout at desktop and phone widths                                           |
| Regression tests for real bugs                                                                                                  | Brand copy and theme tokens (already partly enforced by lint scripts)              |

Visual review is the better guard wherever the question is "does it look
right". Today that review is mostly not automated: there are 130 screenshots
written for humans and only 6 baselines compared. During RC1, appearance is
changing deliberately, so a markup assertion fails on every intended change and
catches nothing.

## Recommendations

| #   | Area                        | Action                                                                                                                                                                                                                                          | Tests affected                                 | Estimated saving                                                                               |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | E2E fixture                 | Serve `summon-targets` in `fixture-server.mjs`. Add a contract test that fails when the app calls a route the fixture does not implement, and report it as such rather than as 37 unrelated failures. Fix the `__TAURI_INTERNALS__` shim.       | +1 contract test                               | Removes the causes of about 19 of 25 red runs (drift plus the shim) and the reruns they forced |
| 2   | Unit environment            | Default `environment: 'node'`. Opt jsdom in for `*.test.tsx` and DOM files (`environmentMatchGlobs`, or `// @vitest-environment jsdom`). Use `pool: 'threads'` and let `maxWorkers` follow the core count in CI.                                | 0 changed                                      | 12.4 to about 6 min                                                                            |
| 3   | Unit DOM-only tests         | Delete the one-off markup assertions in S1–S4 files as each surface lands, and keep their behaviour tests. Rewrite the surviving tests against roles and names, not classes.                                                                    | Delete about 280, about 1270 in RC1 files kept | About 1 min, plus fewer RC1 merge conflicts                                                    |
| 4   | Source-scan tests           | Move the 8 source-scan files (72 tests) into `scripts/check_*.mjs` lint ratchets next to the existing ones.                                                                                                                                     | Convert 72                                     | Small. Clearer failures.                                                                       |
| 5   | E2E geometry and CSS checks | Replace `boundingBox` and computed-CSS assertions with `toHaveScreenshot` on component-gallery states and `pnpm screens` scenes at desktop and phone widths. Make screenshot diffs a reviewed artifact. Do this after each RC1 surface settles. | Convert or merge about 115, delete about 7     | About 4 min of e2e                                                                             |
| 6   | E2E parallelism             | Keep 1 worker per fixture server, but shard the suite across 4 CI runners, each with its own server (`--shard=i/4`). Longer term, scope fixture state per session to allow workers greater than 1.                                              | 0                                              | 13 to about 3.5 min wall, about 2.5 min after recommendation 5                                 |
| 7   | Double build                | Build once with `CLIO_REVIEW_FIXTURES=1` as an artifact. e2e and components reuse it, so `pretest:e2e` skips when the build is present.                                                                                                         | 0                                              | About 1–1.5 min                                                                                |
| 8   | CI shape                    | Split `ci` into parallel jobs: lint and typecheck, unit (2 shards), e2e (4 shards), components and visual, and build. `native-webview-proof` should depend on build only, not all of `ci`.                                                      | 0                                              | PR wall about 36 to about 10–12 min                                                            |
| 9   | Path filters                | Run web jobs only on `web/**`, `packages/**` and workflow changes. Run Rust only on `desktop/**` and `runtime/**`. Run Go only on `tui/**` (frozen). Run Python only on adapter paths. Docs-only PRs skip everything.                           | 0                                              | Most docs and design PRs take about 0–2 min                                                    |
| 10  | Rust coverage               | Replace the per-module filters with one `cargo test --lib`, using `--test-threads=1` only where required, so the 245 unrun tests execute. Gate on Linux. Run the full matrix nightly.                                                           | +245 running                                   | Costs about 1–2 min. Closes a real gap.                                                        |

### PR gate versus nightly

- **PR gate:** lint and ratchets, typecheck, unit (node by default), e2e flows
  (sharded), component gallery screenshots, Rust `--lib` on Linux, and the
  fixture-route contract. Every job is path-filtered.
- **Nightly or main:** full OS matrix for Tauri and the native WebView proof,
  the `pnpm screens` full scene set, Go TUI tests, and the release-matrix
  contract.

### Projected time

| Layer                               | Now (CI median)                       | After                                               |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Unit                                | 12.4 min                              | About 3 min wall (node env and 2 shards)            |
| E2E                                 | 12.6–13.4 min                         | About 2.5 min wall (4 shards, fewer geometry tests) |
| Components and visual               | 2.4 min                               | About 3 min (more screenshot states)                |
| PR critical path                    | About 36 min (`ci` plus native proof) | About 10–12 min                                     |
| Red runs from fixture or shim drift | About 19 of 25                        | Caught by the route contract test                   |

Counts:

- Keep about 4420 unit tests and about 145 e2e flows.
- Convert or merge about 115 e2e tests and 72 source scans.
- Delete about 280 unit tests and about 7 e2e tests.
- Add 1 contract test, and run 245 Rust tests that exist but do not run in CI.

## Method and caveats

- Classification is a stratified manual sample (60 unit files, 58 e2e files)
  plus a heuristic over all files. The counts are estimates within about ±15%.
- Rust coverage was matched by module name against the `cargo test` filters,
  so it is approximate.
- Local wall time could not be measured cleanly on the shared host. The CI
  numbers are the baseline.
- Order of work: recommendations 1, 2 and 7–9 first. They are safe now and
  touch no tests. Do recommendations 3 and 5 per surface as each RC1 workstream
  lands its rewrite.
