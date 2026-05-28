# apps/ — STATUS

**Last updated:** 2026-05-28 (post-v0.9.0 development pass)
**Branch:** `feat/apps-harness`
**Phase:** v0.9.1 in flight on `feat/apps-harness` HEAD

## v0.9.1 blockers (what must be true before re-tagging)

1. **WebView CORS fix verified end-to-end** — commit `38a65bf` routes
   every frontend HTTP through the Rust `gact_http` Tauri command so
   the WebView origin doesn't get blocked when talking to a localhost
   sidecar that doesn't emit `Access-Control-Allow-Origin`. Verified
   live on this Windows machine: launching `clio-desktop.exe` after
   the fix produces a clean trace in `clio-server.log` (capabilities,
   sessions, messages, permissions, SSE). The macOS / Linux WebViews
   should behave identically but haven't been driven manually yet —
   the release CI matrix smoke is the canonical check.

2. **macOS aarch64 installer builds** — commit `37afdf9` swapped the
   bash-4 associative array in `fetch-sidecar.sh` for a case
   statement so macos-14 runners (which ship bash 3.2) can build the
   sidecar launcher. v0.9.0 shipped without the macOS dmgs because of
   this. Re-tagging will produce all four installer triples in one
   workflow run.

3. **ALCF hello round-trip** — the user has clio-agent-gact running
   on `:17800` from the develop branch with `argonne_metis /
   gpt-oss-120b` as the LM. The supervisor's attach-first probes
   that port and the desktop attaches cleanly. End-to-end `hello`
   was attempted three times and each came back with
   `litellm.AuthenticationError: Token introspection: Token is either
   not active or invalid`, despite `argonne_auth status` reporting
   the access token as valid. The user reports auto-refresh works in
   the upstream `clio` TUI; the symptom is consistent with the
   running clio-agent-gact process caching the token at startup and
   not reloading after refresh. Validate by:
     a. `python -m clio_agent.providers.argonne_auth authenticate`
     b. kill the :17800 listener, relaunch `clio-agent-gact --host
        127.0.0.1 --port 17800` from `D:\Libraries\Documents\projects\clio-agent\.venv\Scripts`
     c. `curl -X PUT http://127.0.0.1:17800/v1/providers/lm` with
        `{provider: argonne_metis, api_base: ..., model: gpt-oss-120b}`
     d. POST a hello message; expect a non-error stop_reason.
   This is not a CLIO Desktop bug — it's a clio-agent token-cache
   behaviour — but worth getting to green so v0.9.1's first real
   product test passes against ALCF.

When all three are clear: push tag `clio-desktop-v0.9.1` from
`feat/apps-harness` HEAD. The release workflow handles the rest
(Windows .exe + .msi, macOS aarch64/x64 .dmg, Linux .deb/.AppImage/
.rpm, pure-web .zip, SHA256SUMS per triple, attached to a fresh
GitHub Release via softprops/action-gh-release@v2).

## Phase status

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

## Open blockers / partial-release state

The `clio-desktop-v0.9.0` GitHub Release shipped with:

  - ✅ Windows `.exe` + `.msi` + SHA256SUMS
  - ✅ Linux `.deb` + `.AppImage` + `.rpm` + SHA256SUMS
  - ✅ Pure-web `clio-web-v0.9.0.zip` + SHA256SUMS
  - ❌ macOS aarch64 `.dmg` — CI failed at the sidecar-launcher build
        step (bash 3.2 doesn't support `declare -A`); fix landed on
        `feat/apps-harness` at commit `37afdf9` but is past the
        v0.9.0 tag.
  - ❌ macOS x64 `.dmg` — never ran (Apple Intel runners were
        saturated for 2+ hours).

Neither macOS variant blocks the manual-test cycle on the user's
Windows / Linux box. The next tag cut (likely v0.9.1) will pick up
the bash-3.2 fix from feat/apps-harness HEAD and produce the full
4-platform installer set in one run.

## Post-tag development pass (2026-05-28)

After the v0.9.0 tag landed I shifted from CI watching to actual
development against the user's running `clio-agent-gact` on `:17800`.
Probing the real server surfaced three load-bearing wire drifts that
the fixtures-only test set had hidden — every one of them is now fixed.

### Drift 1 — Capabilities envelope is nested, not flat
`/v1/capabilities` returns
`{contract_version, backend, capabilities, transports, auth, extensions}`
per SPEC §3.3 — boolean flags live under `caps.capabilities.<flag>`,
the SSE/WebSocket toggles under `caps.transports.<key>`, and the auth
schemes under `caps.auth`. Our `@clio/core` type had them all at the
top level, so every `<Show when={caps.X}>` was reading undefined
against a real backend.

### Drift 2 — SSE envelope uses `payload`, not `data`
SPEC §7.2 envelope is `{type, occurred_at, payload}`. The harness
parser spread the JSON onto the envelope, then the reducer read flat
fields. Against the real server every `message.part.delta` would be a
no-op. `@clio/core`'s `parseSseBlock`, `EventEnvelope<T>`, and the
Solid reducer in `apps/web/src/live.ts` now all speak the `payload`
shape.

### Drift 3 — Part deltas key by `part_id`, not `part_index`
`message.part.delta` carries `{message_id, part_id, delta: {text_append}}`
per SPEC §7.4. The harness reducer expected `part_index` flat on the
envelope. `applyTextAppend` now takes `partId`; the index-based variant
lives at `applyTextAppendAtIndex` for fixture data that pre-dates the
spec-aligned Part `id` field.

The wider GactEvent taxonomy now matches SPEC §7.3 (server.connected,
session.created/updated/deleted/status_changed/summarized/compacted,
message.part.added/delta/completed/error, tool.call.started/progress/
completed, permission.requested/resolved, cost.updated, notification).
Unknown event types are tolerated, not crashed on.

### Spec-aligned Part shapes
`PartThinking` now uses `thinking` (with `text` accepted for fixture
back-compat). `PartToolCall` uses `call_id`. `PartToolResult` accepts
either the spec's recursive `content: Part[]` or the legacy `output:
string`. New variants land: `redacted_thinking`, `image`,
`routing_decision`, `error`, `compaction`. Message grows the rich
fields the real server emits (`model`, `tokens`, `cost_usd`,
`stop_reason`, `error_info`).

### New: attach-first sidecar lifecycle (`supervisor.rs`)
The Rust supervisor now probes the conventional `clio start` port
(:17800) before spawning a fresh `clio-agent-gact`. If a healthy server
is already answering, the supervisor attaches to it (empty bearer
token; trust_socket auth handles the localhost case) and the
SplashScreen transitions immediately. This is the path the user
actually hits day-to-day: their `clio` is already running with ALCF
configured, and the desktop shell joins it instead of spawning a
competing sidecar that has no LM wired.

### New: live integration smoke (`apps/core/tests/live-clio.test.ts`)
Five vitest specs hit a real `clio-agent-gact` at `CLIO_GACT_URL`
(default :17800), exercising `/v1/capabilities`, `createSession`,
`sessions`, `messages`, and the SSE stream's first envelope. Skipped
automatically when no backend is reachable, so CI runners that don't
have clio installed don't fail on it.

## End-to-end sanity (2026-05-28, autonomous-side)

Launched the freshly-rebuilt `clio-desktop.exe` against the user's
already-running `clio-agent-gact` and verified the attach-first
supervisor path works end-to-end on real bits:

```
TCP  127.0.0.1:17800   0.0.0.0:0           LISTENING    39100  ← user's python (since May 24)
TCP  127.0.0.1:55547   127.0.0.1:17800     TIME_WAIT    0      ← supervisor's attach probe
TCP  127.0.0.1:63230   127.0.0.1:17800     ESTABLISHED  39776  ← Tauri WebView (msedgewebview2)
```

No competing sidecar was spawned — `tasklist /fi imagename eq python.exe`
showed exactly the same set of pythons before and after the launch, and
the supervisor's probe (port 55547 in TIME_WAIT above) succeeded against
the live `:17800` listener. The frontend then opened a single
ESTABLISHED connection from the WebView, presumably the SSE stream.

The test instance was killed cleanly after; the user's long-running
python (PID 39100) remained untouched.

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
