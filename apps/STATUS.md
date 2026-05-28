# apps/ — STATUS

**Last updated:** 2026-05-28 (overnight v0.9 work)
**Branch:** `feat/apps-harness`
**Phase:** Wave 0 — sidecar bundling (toward v0.9.0)

## Current state

The pnpm workspace at `apps/` is scaffolded and self-contained. Three packages live in
the workspace:

- `@clio/core` — shared TypeScript GACT client (HTTP + SSE wire, transcript store,
  capability discovery). Pure logic; no DOM. Unit-tested with Vitest.
- `@clio/web` — SolidJS + Vite frontend. Connect screen, sidebar, transcript, composer,
  inline permission card. Tokens come from `apps/design/colors_and_type.css`. Unit tests
  with Solid Testing Library; visual proofs with Playwright.
- `@clio/desktop` — Tauri 2 shell that wraps `@clio/web`. Cargo crate `clio-desktop`
  with one example `harness_info` command. Locked-down CSP + capabilities.

All three packages build through pnpm workspace scripts:

```sh
cd apps && pnpm install        # bootstraps the workspace
pnpm -r lint                   # eslint per package
pnpm -r typecheck              # tsc --noEmit per package
pnpm -r test                   # vitest + node test runner
pnpm --filter @clio/web build  # static dist/
pnpm --filter @clio/desktop tauri:build:debug  # Tauri debug build, no bundling
pnpm --filter @clio/web test:visual            # Playwright screenshots
```

CI lives at `.github/workflows/apps.yml` and runs the same matrix.

Six PNG visual proofs live in `apps/web/screenshots/` after running
`pnpm --filter @clio/web test:visual`. They cover the connect screen, empty-sidebar
state, mid-stream chat, inline permission card, verbose density, and summary density.

## How to resume next session

1. `git checkout feat/apps-harness && cd apps`
2. `pnpm install` — should be a no-op if the lockfile is current
3. `pnpm -r typecheck && pnpm -r test` — sanity check
4. Open `apps/PLAN.md` and pick the top unfinished task
5. UI work? Run `pnpm --filter @clio/web dev`, edit, then refresh the screenshot
   set via `pnpm --filter @clio/web test:visual` before committing
6. End the session by:
   - Updating "Current state" above
   - Updating `apps/PLAN.md` (mark done, surface follow-ups)
   - `git push` — even partial progress with `wip:` prefix
   - **Visual changes require a fresh screenshot in `apps/web/screenshots/`**

## Wave 0 progress — sidecar bundling

The **architectural finding** from this session that changes prior assumptions:

- The system-installed `clio-agent` package on PyPI (v0.5.1, `main` branch)
  exposes a **non-GACT** REST API (`/health`, `/query`, `/experts`, `/metrics`)
  via the `clio-agent-api` console script. It does **not** satisfy the GACT
  v0.2 contract our frontend speaks.
- The GACT-conformant server lives on the `develop` branch of
  `iowarp/clio-agent` at `src/clio_agent/gact/app.py`, exposed via a peer
  console script: `clio-agent-gact = "clio_agent.gact.app:main"`. This is
  what we sidecar.
- On the user's dev machine clio-agent@develop is already installed at
  `D:\Libraries\Documents\projects\clio-agent\.venv\Scripts\clio-agent-gact.exe`,
  matching the goal's "system-installed configured for ALCF" expectation.
- The sidecar bundling pattern bundles a **launcher binary** (Go,
  `apps/desktop/sidecar-launcher/`) under Tauri's `externalBin`. The
  launcher's job at runtime is to resolve a real `clio-agent-gact` (override
  env var → PATH → per-OS install-prefix conventions) and exec it with the
  bind args + bearer token the Tauri shell passes in. If none resolves it
  exits non-zero with a Splash-screen-renderable error pointing at the
  upstream `CLIO_REF=develop` installer.

This keeps "real implementations only" intact: the launcher does not fake the
server. The product story matches upstream's existing `clio` installer (which
also assumes Python + clio-agent installed; the launcher just plugs that
recipe into the Tauri installer flow).

### Done in Wave 0 so far

- `tauri.conf.json` declares `bundle.externalBin: ["binaries/clio-agent"]`
- `apps/desktop/sidecar-launcher/` Go program resolves & execs clio-agent-gact
- `apps/desktop/scripts/fetch-sidecar.{sh,ps1}` builds the launcher per-triple
  and writes `apps/desktop/src-tauri/sidecar.lock`
- `pnpm fetch-sidecar` wired before `tauri:dev` / `tauri:build:debug` /
  `tauri:build` so the launcher is always fresh
- `apps/desktop/tests/smoke.test.mjs` checks the new wiring

### Still to do in Wave 0

- 0c: Rust supervisor that spawns the launcher, generates a fresh bearer
  token + free port, waits for `/v1/capabilities` 200, reaps on shutdown
- 0d: `get_backend()` Tauri command + frontend Splash → Chat transition
- 0e: Pure-web degraded-mode default (localhost:7777 probe)

## Open blockers

(none right now; the system-installed clio-agent issue above is resolved by
the develop-branch fallback)



- **Tauri build on Linux CI** — the `tauri:build:debug` step needs `libwebkit2gtk-4.1-dev`
  + `libsoup-3.0-dev` + `librsvg2-dev` + `libayatana-appindicator3-dev` installed on the
  runner. The workflow uses `apt-get install` on `ubuntu-22.04`; if the runner image
  drops them we'll re-pin.
- **Tauri icon set** — generated placeholder icons committed under
  `apps/desktop/src-tauri/icons/`. Replace with brand artwork from
  `apps/design/assets/` once the canonical app icon is approved.
- **Live wire vs. fixtures** — `@clio/web` renders against fixture data in
  `src/fixtures/demo.ts`. The connect screen calls `/v1/capabilities` for real, but
  the rest of the chat shell does not yet subscribe to SSE. First post-harness item.
- **No bearer-token persistence yet** — `@clio/web` keeps the token in component
  state. IndexedDB + OS-keychain persistence is PLAN.md item.
