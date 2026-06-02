# apps/ — Harness

This file documents the visual loop, tests, CI, commit conventions, and the
screenshot policy that make this branch self-driving for future agentic sessions.

## TL;DR for a fresh session

```sh
git checkout feat/apps-harness
cd apps
pnpm install
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm --filter @clio/web build
pnpm --filter @clio/desktop tauri:build:debug
pnpm --filter @clio/web test:visual
```

All eight commands must exit 0 before you stop.

## Workspace shape

- `apps/core/` — `@clio/core` — TypeScript GACT client (no DOM)
- `apps/web/` — `@clio/web` — SolidJS + Vite browser app
- `apps/desktop/` — `@clio/desktop` — Tauri 2 shell wrapping `@clio/web`
- `apps/design/` — CLIO Design System (READ-ONLY — do not modify per goal scope)
- `apps/research/` — Reference research (READ-ONLY — historical context)
- `apps/screenshots → web/screenshots` — visual proofs live with `@clio/web`

The pnpm workspace is rooted at `apps/`. The repo root is the Go workspace; the two do
not cross. Running `pnpm` commands from the repo root will fail — always `cd apps`.

## Visual loop

The visual proof for any UI change is a Playwright-captured PNG in
`apps/web/screenshots/`. The loop:

1. Edit a `.tsx`/`.css` file under `apps/web/src/`.
2. `pnpm --filter @clio/web dev` for HMR-driven iteration if needed.
3. Refresh proofs: `pnpm --filter @clio/web test:visual`.
4. Inspect new PNGs in `apps/web/screenshots/`; commit them alongside the code change.

**Required screenshots** (each must exist before a UI-touching commit lands):

| Filename | Route | What it proves |
|---|---|---|
| `connect-screen.png` | `/` | Connect screen renders wordmark, form, atmospheric stack |
| `empty-sidebar.png` | `/?route=chat&fixture=empty-sidebar` | Zero-session affordance |
| `chat-streaming.png` | `/?route=chat&fixture=streaming` | Mid-stream assistant turn |
| `permission-card.png` | `/?route=chat&fixture=permission` | Inline permission approval card |
| `density-verbose.png` | `/?route=chat&fixture=verbose` | Verbose density (full tool bodies) |
| `density-summary.png` | `/?route=chat&fixture=summary` | Summary density (tool noise hidden) |

Add more rows as we ship features — every fixture URL gets its own PNG.

## Tests

Three layers:

1. **Unit tests** — Vitest in `apps/core/tests/` + `apps/web/tests/unit/`. Run them on
   every push via `pnpm -r test`. New components or store reducers ship with at least
   one test that covers the happy path and one edge case.
2. **Desktop smoke tests** — `apps/desktop/tests/smoke.test.mjs` exercises the Tauri
   config files with Node's built-in test runner so we don't need Rust to run them.
3. **Visual / integration** — Playwright in `apps/web/tests/visual/`. Drives the built
   `dist/` against the gact-tui emulator running on `:7777`. Adding a new route to
   `@clio/web` adds a `test('…')` block.

## CI

GitHub Actions workflow at `.github/workflows/apps.yml`. The job graph:

```
+---------+    +-----------+    +----------+    +---------------+
| install | -> | lint+type | -> | unit     | -> | web build     |
+---------+    +-----------+    +----------+    +---------------+
                                                       |
                                                       v
                                                +-------------+
                                                | visual test |
                                                +-------------+
                                                       |
                                                       v
                                                +-------------+
                                                | tauri debug |
                                                +-------------+
```

Each step must pass. Visual-test PNGs are uploaded as a workflow artifact so reviewers
can scroll through them without checking out the branch.

## Commit conventions

Conventional commits, per the global rule:

- `feat(scope): subject` — new feature
- `fix(scope): subject` — bug fix
- `refactor(scope): subject`
- `test(scope): subject`
- `docs(scope): subject`
- `chore(scope): subject`

Scope examples: `web`, `core`, `desktop`, `harness`, `ci`. One change per commit when
possible. Visual changes never land without their PNGs in the same commit.

## Screenshot policy

1. **No UI commit without a screenshot.** If your diff touches `apps/web/src/**`, the
   commit message must reference a PNG you added or updated in
   `apps/web/screenshots/`.
2. **Names are stable, content is not.** Filenames are part of the contract; replacing
   the file with a fresher render is fine (and expected).
3. **Six baseline shots are mandatory.** The visual test will fail loudly if any of the
   six required shots is missing.
4. **Screenshots are dark mode at 1440×900.** Playwright is configured this way; do not
   override per-test unless the feature you're proving needs a different viewport.

## Out of scope on this branch

Per the goal: **do not modify** `tui/`, `emulator/`, `adapters/`, `contract/`, or
`apps/design/`. The harness lives entirely under `apps/` (plus the new CI workflow).
