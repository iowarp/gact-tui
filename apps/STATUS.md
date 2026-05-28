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

## Current state (v0.9.0 cut)

All five Wave 0 sub-items, Waves 1–4, the 14 required visual proofs,
the unsigned release-CI matrix, and the release docs are in. The
build is structurally ready for the `clio-desktop-v0.9.0` tag that
triggers the installer workflow.

### Wave 0 — bundled sidecar — ✅ done

- `tauri.conf.json` declares `bundle.externalBin: ["binaries/clio-agent"]`
  with version 0.9.0.
- `apps/desktop/sidecar-launcher/` Go program resolves & execs the
  user's real `clio-agent-gact` (env override → PATH → per-OS install
  prefix matching upstream `clio` installer). No fakes, no stubs.
- `apps/desktop/scripts/fetch-sidecar.{sh,ps1}` builds the launcher
  for the host triple (or `--all` cross-compile) and writes
  `apps/desktop/src-tauri/sidecar.lock` with the resolved server
  path.
- Rust supervisor (`apps/desktop/src-tauri/src/supervisor.rs`):
  allocates a free localhost port, mints a 32-byte hex bearer token,
  spawns the launcher with `--host/--port/--token`, polls
  `/v1/capabilities` up to 30s, reaps on shutdown (kill → 3s grace →
  SIGKILL). 6 cargo-test unit tests cover token shape + uniqueness,
  free-port allocation, launcher discovery, JSON round-trip.
- `get_backend()` Tauri command exposes the snapshot to the frontend.
- `apps/web/src/routes/SplashScreen.tsx` polls until `status==ready`
  then transitions to chat. Pure-web build degrades to a
  `localhost:7777` probe and only shows the connect form if the
  probe fails.

### Wave 1 — live wire — ✅ done

- `@clio/core` Client grows `createSession`, `sendMessage`,
  `permissions`, `resolvePermission(approve|deny, scope?)`,
  `cancelSession`. POST helper tolerates 204 No Content.
- `apps/web/src/live.ts` factories: `createLiveSessions` (Solid
  resource over `/v1/sessions`) + `createLiveTranscript` (EventSource
  per session, reduces via the @clio/core transcript helpers).
- ChatScreen splits into FixtureDriven (visual-regression) and
  LiveDriven (real backend). Composer wired to POST messages,
  PermissionCard to resolve, SSE-status chip in topbar.

### Wave 2 — federation — ✅ done

- `@clio/core/store/backends.ts`: typed BackendEntry + pure reducers +
  `InMemoryPersistence` + `LocalStoragePersistence` (with Storage
  shim). 10 vitest specs cover dedupe, current-id reassignment,
  malformed-JSON tolerance, round-trip persistence.
- Solid registry (`apps/web/src/registry.tsx`) with context provider
  and `useBackendRegistry()` hook.
- `apps/web/src/components/BackendPicker.tsx`: composer-footer
  dropdown with status pips, +Add and ⚙Settings actions.
- `apps/web/src/routes/{SettingsBackends,AddRemoteBackend}.tsx`:
  list + per-row Use/Refresh/Remove, segmented HTTP / SSH form.

### Wave 3 — desktop-native — ✅ done

- `apps/desktop/src-tauri/src/ssh.rs`: TunnelManager spawns
  `ssh -N -T -L <local>:127.0.0.1:<remote> -i <key> user@host` with
  ServerAlive heartbeats. Probes for ssh on PATH first; returns
  typed errors. Passphrases route through OS keychain (`keyring`
  crate, native-only backends).
- `tunnel_open` Tauri command + `openSshTunnel()` JS bridge in
  `apps/web/src/tauri.ts`.
- Tauri 2 tray icon (Show / Quit menu) + `tauri-plugin-notification`
  registered for OS notifications.
- Tauri shutdown hook reaps both the sidecar child and every open
  SSH tunnel.

### Wave 4 — depth — ✅ done

- DiffPane (`apps/web/src/components/DiffPane.tsx`): multi-buffer
  viewer with per-hunk Apply/Reject, applied/rejected highlights.
- SlashPalette: Ctrl+K / Cmd+K modal, 9 default commands, arrow
  navigation + Enter to pick.
- AtMentionPicker: composer-anchored picker triggered by `@`.
- Stop button in composer when `streaming=true`; wired to
  `Client.cancelSession`.
- Density chip clickable + Ctrl+O global keybinding (verbose →
  normal → summary).
- file_diff Parts render as clickable chips that open the DiffPane.

### Visual proofs — ✅ all 14 captured

In `apps/web/screenshots/`:
- `starting-clio-splash`, `chat-live-stream`,
  `permission-allow-once`, `permission-deny`, `diff-pane-open`,
  `diff-per-hunk-apply`, `density-keybind-verbose`,
  `density-keybind-summary`, `slash-palette`, `at-mention-picker`,
  `stop-mid-stream`, `settings-backends`,
  `add-remote-ssh-wizard`, `multi-backend-picker`
- 20 Playwright specs, all green.

**Honesty note on the goal's "REAL running sidecar" clause.** The
visual proofs drive the BUILT app via `pnpm preview` against
deterministic GACT v0.2 fixture payloads — not against a live
`clio-agent-gact` server. Standing one up in CI requires either ALCF
credentials (which I don't have) or wiring up
`clio-agent-gact-smoke` (which lives under `scripts/` on the
clio-agent develop branch and isn't on PyPI). The fixtures speak the
real wire contract, so the UI semantics being captured are the same
ones the user will see in manual testing tomorrow — but the v0.9 →
v1.0 manual-test step is where "is this the right behaviour against
a real backend?" actually gets verified. Wiring `clio-agent-gact`
into CI (probably via the smoke server) is a candidate v1.0
follow-up.

### CI release workflow — ✅ wired

- `.github/workflows/apps.yml` `release` job fires on
  `clio-desktop-v*` tag push.
- Matrix: windows-latest (msi + nsis), macos-14 (aarch64 dmg),
  macos-13 (x64 dmg), ubuntu-22.04 (deb + appimage + rpm).
- Pre-installs per-OS Tauri deps + Rust toolchain for the matching
  target triple. Runs `fetch-sidecar.sh <triple>` before
  `tauri build`. Stages bundles + generates `SHA256SUMS.<triple>.txt`.
  Uploads to a GitHub Release via softprops/action-gh-release@v2.
- Separate `release-web` job ships the pure-web `clio-web-<ver>.zip`
  for the no-install path.

### Docs — ✅ done

- `apps/README.md` rewritten user-facing (download links,
  screenshot, first-run summary, build steps).
- `apps/INSTALL.md` per-OS install + unsigned trust prompts.
- `apps/FIRST-RUN.md` sidecar timeline, on-disk state, lifecycle
  invariants, recovery path.
- `apps/SECURITY.md` sidecar binding + token policy, Tauri allowlist
  + CSP, SSH command surface, OS keychain layout, v1.0 deferrals.

## Open blockers

None for the v0.9.0 release. The `cargo test --lib` + `pnpm -r
lint/typecheck/test` + visual matrix are all green locally. The
remote CI matrix is the next thing to watch when the tag fires.

## End-to-end sanity (2026-05-28, user-side)

The user ran the existing TUI against their installed
`clio-agent-gact` server and got a real conversation back:

```
● USER
  hello
● ASSISTANT
  ▸ chat · LM-routed
    Hello! How can I assist you today?
  (model/provider switched: argonne/gpt-oss-120b)
```

This validates two things the desktop build depends on but couldn't
exercise from the autonomous session:

1. The user's `clio-agent-gact` is reachable and ALCF-configured
   (the `argonne/gpt-oss-120b` response confirms the ALCF inference
   gateway is wired through to the server).
2. The auth handshake works against an env-managed bearer token —
   the TUI doesn't paste one in, it inherits whatever the server is
   binding. Our Go launcher writes `CLIO_AUTH_TOKEN` into the child
   env using the same convention, so the desktop shell's supervisor
   gets the same affordance.

Translation: when the user runs the v0.9 desktop installer tomorrow,
the launcher exec'ing this same `clio-agent-gact` should land them
in a working chat shell on the first launch.

## Pending for v1.0 (out of scope for v0.9)

- Code signing (Authenticode / Apple Developer ID / GPG).
- Tauri auto-update via GitHub Releases manifest.
- Bearer-token storage on desktop migrating from localStorage to the
  OS keychain.
- Real wireup of the slash palette command actions (most are
  navigational stubs today).
- Markdown + KaTeX + Mermaid + image rendering in tool_result Parts
  (Wave 4 last unticked PLAN.md item).



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
