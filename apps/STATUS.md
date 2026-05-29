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

## v0.9.1 polish landed since the v0.9.0 cut

Visual-proof suite (28 PNGs, Playwright + live sidecar) passes after
every step below — `pnpm --filter @clio/web test:visual` is green.

- Reading column widens from 760→960px when the inspector is
  collapsed so it doesn't leave a stranded right gutter. (a942e26)
- Cmd+K palette grew dynamic items: `jump:<sid>` per session,
  `perm:<mode>`, `rail:<route>`, new-session, copy-session-id,
  cycle-density, toggle-inspector. (327af56)
- Ctrl+Shift+Up/Down cycles through sessions, wrapping at both ends.
  (8fd72e8)
- SSE auto-reconnect with explicit 1/2/5/10s backoff ladder; topbar
  shows `sse · reconnecting in Ns` countdown. (6007513)
- Regenerate now toasts the prompt being re-sent and refuses while a
  stream is in flight. (708ce1d)
- Sticky "Jump to latest" pill counts new SSE messages while the
  user reads history. (be89664)
- Thinking parts show `Thought for ~N words · click to expand` with
  a sparkle icon. (cc629cb)
- Errored turns surface a red callout with the typed error code +
  message + Retry button when `error_info.recoverable`. (aaf6257)
- Cmd+/ opens a keyboard shortcuts cheatsheet (Navigation /
  Composer / View). (01dac66)
- Live tool indicator chip in the topbar — `running · grep, bash +N`
  driven by `tool.call.started/completed` SSE events. (4d52bf9)
- SSE `notification` events bridge into the toast system; cap
  visible toasts at 5 so notification bursts don't pile up.
  (5208bb3 / cc49af1)
- Cmd+F transcript search with `<mark>` highlights, prev/next + scroll
  the focused match into view. (4b9cd95 / 71a8e65)
- Inspector drawer becomes tabbed (Turn / Tools / Diffs / Thinking /
  Health) — tabs only appear when their data is present, last-active
  tab persists. (23b07e7)
- Tools tab expands each call to show its input JSON + output text.
  (8c45a14)
- Palette deep-links into specific Settings sections via
  `settings:<id>` ids. (0687943)
- `POST /v1/workspaces` from a `+ New workspace` form on the
  Workspaces discovery page. (0dec0f1)
- Composer drafts persist per session in `localStorage.clio.draft.*`
  — survives reload, session switches, and accidental window close.
  (eddcd8d)
- Cmd+S exports the active session as JSON. (e69e8f3)
- Cmd+, opens Settings. (5a68de7)
- Streaming cursor (▌) on the in-flight assistant turn's last text
  part. (ba7ef3d)
- Model chip in the topbar. (5a68de7)
- Pin sessions to keep them at the top of the list — scoped per
  backend, persisted in localStorage. (57a106f)
- Backend picker de-emojified — uses Icon components + named pip
  classes instead of literal 🔴/🟢/🟠 + ▼. (05ccddd)
- InlineMarkdown gains heading (#/##/###), bullet/ordered list, and
  http/https autolink support. Markdown link syntax remains
  unparsed for XSS safety. (8c35020)
- Session rows pulse for 1.8s when SSE bumps them
  (`session.updated` / `session.status_changed`). (ea97507)
- Splash error path: Retry + Manual connect buttons + OS-aware
  install recipe (PowerShell on Windows, curl|bash elsewhere).
  (a2086d4)
- Autoscroll while user is at the bottom; jump-to-bottom on
  session switch. (a81d5d7)
- AtMention picker de-emojified — Icon glyphs for file/dir/agent/
  symbol. Drop the leftover ▸/▾ triangle on the thinking summary
  too. (e435cf1 / 1b7fc1f)
- Model chip in the topbar is now a real button that deep-links
  into Settings → Models. (e4973cb)
- Notification Center popover anchored to a bell in the topbar —
  surfaces the last 50 toasts with an unseen-count badge. (9e860a6)
- `POST /v1/sessions/{id}/summarize` exposed via Client and palette
  ("summarize session" item). Result lands on SSE as
  `session.summarized` per SPEC §6.2. (18aa6af)
- Cmd/Ctrl+Enter forces a submit even when Shift is held, so
  Discord/Slack muscle memory works alongside the default
  Enter-sends convention. (72750ea)
- Esc stops a streaming turn when no overlay (palette / cheatsheet
  / search) is open. (5665ca5)
- Cmd+I toggles the inspector drawer. (a9d2f21)

## Picking up new clio-agent develop endpoints (post-v0.9.0)

The develop-branch clio-agent-gact shipped a wave of new GACT v0.2
surface (PRs #340 / #344 / #346 / #353 / #362 / #364 / #376 / #377 /
#378 / #379 / #380 / #381). Wave-5 wires what the desktop can use:

- **/v1/prompts** registry → new Prompts discovery page, capability-
  gated on the `prompts` flag, with reload + per-prompt validation
  error display. (b07d3fb)
- **/v1/sessions/{id}/{undo,rewind}** → palette 'undo last turn'
  action + `createLiveTranscript().refetch()` for post-mutation
  transcript reload. (07dd16e)
- **/v1/sessions/{id}/tasks** → Inspector gains a Tasks tab between
  Thinking and Health, showing per-task status pip + status code.
  (585efe8)
- **/v1/capability-gaps** → Doctor shows a 'Capability gaps' card
  list so 'not supported' is explicit, not inferred from 404s.
  (c443330)
- **/v1/sessions/{id}/compact** → palette 'compact session' triggers
  manual history collapse. (5d66fd1)

## Renderer / chrome polish (Wave-5 follow-up)

- InlineMarkdown gains pipe-delimited table support (a59b124) and
  '> '-prefixed blockquotes (5824863).
- Cmd+B toggles the sessions column for focus mode; the rail icon
  re-opens it when clicked while already on chat. (ab72e9a / a1a9b82)
- Per-message Quote button (branch icon) drops a markdown
  blockquote of the message body into the composer, auto-focused
  with a clean two-newline separator above and below. (f03dc2d)
- Inspector grows a **Context** tab listing
  `/v1/sessions/{id}/context/files` with edit/read mode indicators.
  (014b9e1)
- Subtle 220ms fade-in on inspector section transitions. (e1f6aba)
- Permission mode chip in topbar (click-to-reset). (a6043f2)
- Focus composer on session activation. (cf62bf1)
- UserQuestion type + Client.sessionQuestions() (orchestrator
  ask-user retry, #380). (279f418)
- Code blocks: language badge + hover Copy button. (e738d8a)
- Persist active session id per backend. (37ce315)
- Density chip is now a click-to-cycle button. (4970c18)
- Tokens chip in topbar from message.completed. (dba1b65)
- Send-message errors → toasts with LM-config hint. (dcb9ed7)
- Strikethrough + GitHub task lists in InlineMarkdown.
  (5b8f557 / a2cbdfc)
- Context tab Remove button + diff Pin-to-context button
  exercise the /v1/sessions/{id}/context/files RPCs end-to-end.
  (0c385af / 9c3992f)
- Inspector Diffs entries open the DiffPane on click. (9b2fe36)
- Cmd+Shift+S forks the current session (alongside Cmd+S export).
  (778b540)
- InlineMarkdown accepts `_italic_` and `__bold__` alongside the
  asterisk variants. (9ed74b9)
- Subtle pinned-vs-unpinned divider in SessionsColumn. (a3e265d)
- 'Reset all preferences' button in Settings → Appearance for
  triage. (69e4d63)
- Empty-state tip pointing at Cmd+K and Cmd+/. (5f3ca4d)
- Hover tooltip on per-message timestamp shows the absolute time.
  (ebf747e)
- Horizontal rule support in InlineMarkdown. (dd54ec6)
- Esc dismisses Settings shell + AddRemoteBackend wizard.
  (5078026 / 2cb50ef)
- Click topbar crumb title to copy session id. (5606f40)
- Settings → Prompts section + side-nav entry. (51be0b5)
- Topbar 'running' chip shows `tool.call.progress` % +
  per-tool status message in the hover title. (6ee032b)
- Prompt cards expand on click to fetch + render the default
  profile text via GET `/v1/prompts/{id}`. (6f1294f)
- Humanized token counts (2.34k / 12.4k) in Inspector run tab.
  (b5a1ca9)
- SessionsColumn 'Only show running' filter chip auto-renders when
  there's at least one running session. (bdb74e3)
- Blank session titles render 'Untitled session' italicized.
  (aad9820)
- Tool call I/O detail rows gain Copy buttons. (bd27021)
- Discovery search bars: Agents, Commands, Prompts, MCP,
  Workspaces — auto-render when item count exceeds a threshold so
  short lists don't waste screen on a useless filter.
  (b189841 / 05a2d20 / c240e3a / c40e24d / 7c775d4)
- About card gains a direct SPEC.md link + per-link descriptions.
  (400262a)
- Notification panel timestamps auto-refresh every minute so
  'Nm ago' stays accurate while the panel is open. (56b0365)
- Session status chip in topbar surfaces `waiting · permission` and
  `session · error` so non-running session states aren't only
  visible via the sidebar pip. (6bfa0b0)
- Stop button shows a pulsing 'stopping' state until the streaming
  signal flips (auto-clears via createEffect). (bbc6e67)
- InlineMarkdown supports `==highlight==`. (1488645)
- Cmd+Shift+arrow session nav scrolls the new row into view in the
  column. (1fb943e)
- SessionsColumn refresh button next to the connection pip wired
  to live.refetch(). (19ad24d)
- Splash hint shows elapsed time after the first 1.5s. (c75821f)
- Composer placeholder adapts when there's no active session.
  (0ded4cd)

## v0.9.1 stretch totals

`feat/apps-harness` is now ~470 commits ahead of `main`. The wave-5
polish pass added ~80 user-visible improvements on top of the
v0.9.0 cut — full list in `apps/CHANGELOG.md`. All 28 visual proof
tests pass on every commit.

## Where we stand

The desktop chrome now has 28 visual proof tests covering every
flow (all 28 green on every commit). The user-visible surface is
substantial — see `apps/CHANGELOG.md` for the full v0.9.1
shipping list. The three release blockers from the §"v0.9.1
blockers" section above remain the gating items for pushing
`clio-desktop-v0.9.1` from `feat/apps-harness` HEAD.

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

## Audit-driven medium-tier pass (this session)

A second wave of gap-closures following the 10-priority audit
(`apps/AUDIT-CLIENT-GAPS.md`). All TypeScript-only — no Tauri/Rust
changes, no contract changes, no design-system writes.

- **Per-color theme editor** (Settings → Appearance). Accent palette
  pickers persisted to `localStorage.clio.theme.tokens.v1` and applied
  via injected `<style id="clio-theme-override">` at load. (319cbae)
- **Catalog browser** — Cmd+Shift+K opens a unified modal that
  searches Agents / Commands / MCP / Prompts / Workspaces in one query
  box. Mirrors the TUI's `/catalog`. Picks route the user to the
  matching rail page. (d59d4e7)
- **Locale switcher** (en / es / ja / el). Persisted to
  `localStorage.clio.locale.v1` and forwarded on every clio request as
  `Accept-Language` via a new `getLocale` Client option. UI strings
  stay English until frontend i18n lands. (aef0e2d)
- **Ctrl+G compose modal** — fullscreen textarea that shares draft
  storage with the inline composer (`clio.draft.${sessionId}`). Cmd+↵
  to send, Esc to close-and-save. Composer re-hydrates on close via a
  `draftReloadTick` prop. (3571d12)
- **Cross-session memory search** on MemoryPage. Debounced 250ms,
  hits `GET /v1/memory/search` (PR #351). Renders role-tagged hits
  with score badges. (78c8464)
- **Archive view toggle** in SessionsColumn. When set, fetches
  `GET /v1/sessions?archived=true` into a local resource and renders
  the bucket in place of the live list. Read-only browse. (c97d6f2)
- **Autorename hint** — when SSE `session.updated` includes `title`
  in `changed_fields`, refetch the sessions list so the new title
  flows in and surface a quiet info toast. (8bce7c5)
- **lm.provider.{changed,failed} SSE toasts** — Desktop reducer was
  silent on both; TUI surfaces them. Wired as info/error toasts so
  model swaps and provider failures aren't invisible. (5c009f1)
- **Autorename hint pill** — toast alone didn't match the TUI's
  transient affordance; added a 4.5s topbar badge alongside the toast
  when SSE `session.updated` changes the title. (443274f)
- **Inspector Frames tab + session-wide pending diffs** — surfaces
  `GET /v1/sessions/{id}/context/frames` and aggregates pending diffs
  across all messages so the user sees everything at once. (9dc8a0a)
- **Inspector Schedules tab** — list/create/delete cron triggers per
  session via `GET/POST /v1/sessions/{id}/schedules` + `DELETE
  /v1/schedules/{id}`. Capability-gated via the schedule list. (cc99559)
- **Cmd+L shared session modal** — read-only viewer for
  `GET /v1/shared/{token}`. Accepts a bare token or full clio: URL,
  renders via the existing Transcript with `density: normal`. (1c71559)
- **Detached registry** — Cmd+Shift+D parks the active session in
  `localStorage.clio.detached.{url}`. Palette surfaces parked
  sessions with "walked away N ago" hints and the picker reattaches
  + removes the entry. (b6828d5)
- **SSE context.frame.{created,completed}** — reducer fires
  `onFrameChanged`; ChatScreen refetches frames so the Inspector list
  stays live. (b2f93a3)
- **runCommand for backend slash commands** — palette dispatch now
  prefers `POST /v1/sessions/{id}/commands/{cmd}` (preserving per-
  command arg schemas) with a fallback to user-message dispatch
  when the structured route 404s. (06153a6)
- **metadata.pinned mirror** — `patchSession` now accepts metadata;
  toggling a pin writes `metadata.pinned: bool` server-side, and the
  session list reads it back into the local pin set. TUI and Desktop
  now agree on which sessions are pinned. (d091abb, 73f2d05)
- **LeftRail caps coherence** — Doctor entry surfaces under either
  `caps.doctor` (TUI naming) or `caps.integration_health` (Desktop
  naming). (df2d97d)
- **Custom intro splash** — Settings → Appearance has a multi-line
  textarea persisted to `localStorage.clio.splash.intro.v1`, rendered
  on the Splash screen between the wordmark and the spinner. Mirrors
  the TUI's `intro_file` config. (983c089)
- **Hooks editor** — promoted the read-only Hooks page to read/write
  via `POST /v1/hooks` + `DELETE /v1/hooks/{id}`. Type selector
  (pre_message/post_message/pre_tool/post_tool) + URI input + per-row
  delete buttons. (23a98b1)
- **Policies JSON editor** — Policies page now exposes an Edit affordance
  that switches the JSON pretty-print into a textarea backed by
  `PUT /v1/policies`. (a18c80f)
- **Inspector Bindings tab** — swap per-session blueprint + expert
  pack live via `GET/POST /v1/sessions/{id}/agent-blueprint` and
  `/expert-pack` (PRs #386/#387, #344). Dropdowns populated from
  `/v1/agent-blueprints` + `/v1/expert-packs`. (970f1ff)
- **MCP server detail expansion** — cards now expand to lazy-fetch
  `/v1/mcp/servers/{id}/{tools,resources,prompts}` so users can see
  what each gateway actually exposes without dropping into the TUI.
  (32e0628)
- **Blueprint validate/install/uninstall** — BlueprintsPage hosts a
  JSON form that hits `POST /v1/agent-blueprints/validate` then
  `POST /v1/agent-blueprints`; per-card Uninstall button calls
  `DELETE /v1/agent-blueprints/{bp}`. (c1a29d9)
- **Expert pack validate** — dry-run validate via
  `POST /v1/expert-packs/validate` with verdict display. (d4f1748)
- **SSE session.summarized / session.compacted** — were swallowed
  alongside server.connected; now emit info toasts so the user sees
  when older turns get rolled up. (f831fd7)
- **Provider single detail** — ProviderCard surfaces
  `GET /v1/providers/{id}` (vendor, status, auth.kind, required) on
  the expansion alongside the model list. (1c6f6b1)
- **Context Frame single-detail** — frames rows expand to lazy-fetch
  `GET /v1/sessions/{id}/context/frames/{frame_id}` and pretty-print
  the payload. (cb228ce)
- **MCP resource preview** — each resource row gains a Preview button
  that calls `POST /v1/mcp/servers/{id}/resources/read` and shows the
  text inline. (480af06)
- **Workspace repo map** — WorkspaceCard toggle reveals a tree pulled
  from `GET /v1/workspaces/{id}/repo_map`, with token count chip.
  (21541e1)
- **Per-agent routing detail** — AgentCard expands to
  `GET /v1/agents/{id}` and pretty-prints routing + tool + model
  config. (b6f0476)
- **Inspector task status cycling** — Tasks rows now click to advance
  pending→running→completed via `PATCH /v1/tasks/{tid}`. (e851c8e)
- **Human cron preview** — Schedule create form prints a tagline like
  "Every 5 minutes" or "Daily at 09:00" beside the cron input. (9b0229f)
- **Voice → text via file upload** — Composer gains a file-picker
  button that uploads audio to `POST /v1/sessions/{id}/voice/transcribe`
  and injects the transcript. (c8e8a5e)
- **Voice synth Client method** — `Client.synthesizeVoice` posts text
  to `/voice/synthesize` and returns the audio Blob. (48c7aee)
- **TTS speak button** — assistant message rows gain a Speak action
  that plays the synthesized blob via `HTMLAudioElement`. (bb5f8de)
- **Browser-side mic recording** — Composer mic button uses
  `MediaRecorder` to capture audio in-browser, then routes the blob
  through the same transcribe path. Pulsing red dot while hot —
  no Tauri mic plugin required. (bf50928)
- **Blueprint MCP enable Client method** — `enableBlueprintMcp(bp,
  descriptor)` posts to `/v1/agent-blueprints/{bp}/mcp/{did}/enable`.
  (642e42b)
- **Markdown session export** — palette `export · markdown` converts
  the JSON export into a role-headed `.md` blob client-side. (fadfd06)
- **Cmd+R refresh** — intercepts the browser-reload only when a
  refetch handler is wired, otherwise falls through to F5. (3679df4)
- **Per-message permalink** — every transcript row gains a small
  arrow-up-right action that copies `clio://session/<sid>#<mid>` to
  the clipboard. (6d320db)
- **Workspace unregister** — DELETE `/v1/workspaces/{id}` surfaced
  on the workspace card. (4d41df8)
- **Doctor → LSP clients** — adds `/v1/lsp/clients` status pips
  below the integrations list. (ca55fe1)
- **Client surface bulk-up** — `patchWorkspace`, `lspClients`,
  `getTool`, `extractAgent`, `deleteAgent`, `mcpSubscribeResource`,
  `mcpUnsubscribeResource`, `mcpServerResourceTemplates`,
  `mcpGetPrompt` (`cfee73b`, `c8a6a47`) — methods are wired even
  when no UI hits them yet, so future UI work can drop straight in.
- **Cmd+E quick-edit** — re-opens the last user message in the
  composer for in-place editing. (d0bd01d)
- **Cmd+Y copy transcript** — writes the user/assistant dialogue
  to the clipboard as plain text. (bd64cb5)
- **Agent Remove + Extract** — AgentsPage card gains a Remove
  button (`a34b15c`) and the palette gains an `extract · agent`
  action that posts to `/v1/agents/extract` (`39982e4`).

Visual proofs: deferred — clio :17800 was down during the session, so
the Playwright suite couldn't run end-to-end. Re-run with `pnpm
--filter @clio/web test:visual` after relaunching clio.

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
