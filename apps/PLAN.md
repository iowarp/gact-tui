# apps/ — PLAN

Ordered queue of post-harness work. The v0.9.0 cut shipped everything
in Waves 0 – 4 except the items explicitly listed under "Pending for
v1.0" at the bottom — those move to a follow-up PLAN once v1.0 work
opens.

## Wave 0 — bundled sidecar (the FIRST thing to land)

**Why this is Wave 0:** CLIO Desktop is the non-terminal-user product. It must
ship with `clio-agent` bundled and auto-start it on launch — no connect form,
no bearer-token paste, no setup. The harness currently ships a connect screen
as the default route. That is wrong product framing and must be corrected
before any of the wire-up work below.

**Architectural note (logged in STATUS.md):** the GACT-conformant server is
`clio-agent-gact` from the `iowarp/clio-agent` **develop** branch — _not_ the
default `clio-agent-api` shipped on PyPI today (which speaks a different
contract). Bundling a Python interpreter + native deps into the Tauri
installer is wasteful, so the sidecar is a tiny Go launcher binary that
resolves & execs a real `clio-agent-gact` on the user's machine, matching
upstream's `clio` installer pattern.

0a. ✅ **Tauri sidecar declaration.** `bundle.externalBin: ["binaries/clio-agent"]`
    in `apps/desktop/src-tauri/tauri.conf.json`. Per-triple launchers land in
    `apps/desktop/src-tauri/binaries/clio-agent-<triple>{.exe}` and are
    .gitignored (CI/local regenerates them).
0b. ✅ **Sidecar acquisition.** `apps/desktop/sidecar-launcher/` Go program
    resolves `clio-agent-gact` (env override → PATH → per-OS install prefix)
    and execs it. `apps/desktop/scripts/fetch-sidecar.{sh,ps1}` builds the
    launcher per-triple and writes `sidecar.lock` recording what resolved on
    the build host. `pnpm fetch-sidecar` runs before every `tauri:*` script.
0c. **Sidecar lifecycle in Rust.** On app launch, allocate a free localhost
    port + generate a bearer token, spawn the launcher with `--host
    --port --token`, poll `/v1/capabilities` until 200 (max ~10s), then open
    the main window. On app close, SIGTERM with a 3s grace then SIGKILL.
0d. **Tauri command to expose the local backend handle.** `get_backend()` →
    `{ url, bearer_token, status: 'starting' | 'ready' | 'error' }`. Frontend
    consumes this on mount instead of rendering `<ConnectScreen />`.
0e. **Replace `<ConnectScreen />` as the default route.** Web shell boots to
    a "Starting CLIO…" splash, then transitions to the chat shell once the
    sidecar reports healthy. The connect form moves to
    `/settings/backends/add-remote` for the advanced "add another backend"
    case (federation). Pure-web build (no Tauri) defaults to
    `http://localhost:7777` and auto-probes `/v1/capabilities`; the connect
    form only renders on probe failure.

## Wave 1 — live wire — ✅ done

1. ✅ **/v1/sessions hydrates the Sidebar.** `createLiveSessions()` in
   `apps/web/src/live.ts` returns a Solid resource over `@clio/core`'s
   Client and maps Session rows to SidebarSession. Fixtures stay
   reachable via `?fixture=…` for visual regression.
2. ✅ **Per-session SSE.** `createLiveTranscript` opens an EventSource
   keyed by activeId, listens on the seven named GACT events, and
   reduces them through `applyTextAppend / appendPart / upsertMessage`.
   SSE status chip in the topbar (open / connecting / closed / error).
3. ✅ **Composer POSTs messages.** `Client.sendMessage()` + composer
   `onSubmit`. Enter submits, Shift+Enter newlines, error inline,
   draft restored on failure.
4. ✅ **Permission resolution.** `Client.permissions()` for the
   initial fetch; PermissionCard's four approve buttons + Deny route
   to `Client.resolvePermission(approve|deny, scope?)`.

## Wave 2 — federated connect — ✅ done

5. ✅ **Per-backend store.** `@clio/core/store/backends.ts` —
   `BackendEntry` shape, pure reducers (add/remove/setCurrent/update),
   `InMemoryPersistence`, `LocalStoragePersistence`. Solid wrapper at
   `apps/web/src/registry.tsx` (context provider + `useBackendRegistry`).
6. ✅ **Backend picker.** `apps/web/src/components/BackendPicker.tsx`
   composer-footer dropdown with green/amber/red status pips,
   "+ Add remote backend" and "⚙ Backends settings" actions. The
   bundled local sidecar is the auto-selected first entry.
7. ⚠ **Capability gating.** Plumbing exists (BackendEntry stores
   `capabilities`, `Show when={caps().X}` is the pattern), and is used
   for the diffs / sse / permissions chips in SettingsBackends. Wider
   gating across the chat shell is a v1.0 follow-up; today's
   clio-agent-gact returns the full capabilities flag set so nothing
   gates off in practice.

## Wave 3 — desktop-native — ✅ done

8. ✅ **SSH-tunneled backends.** `apps/desktop/src-tauri/src/ssh.rs`
   TunnelManager spawns `ssh -N -T -L … user@host` with ServerAlive
   heartbeats; OS keychain (`keyring` native-only) for passphrases;
   `tunnel_open` Tauri command + `openSshTunnel()` JS bridge.
9. ✅ **OS notifications + tray.** `tauri-plugin-notification`
   registered, tray icon with Show / Quit menu wired in
   `lib.rs::setup()`. Live wire still needs to invoke notifications on
   `session.status: idle while unfocused`; that's a v1.0 follow-up.
10. ⚠ **Native auto-update.** Deferred to v1.0 — the v0.9 cut ships
    re-install from the Releases page. Unsigned installers ⇒ Tauri's
    updater key+signature pipeline is meaningless without signing.

## Wave 4 — depth — ✅ done

11. ✅ **Settings route.** `SettingsBackends` + `AddRemoteBackend`
    live. /doctor and /metrics are v1.0 work (the upstream
    `clio-agent-gact /health` endpoint covers a lot of what /doctor
    would surface; wiring it into a dedicated page is follow-up).
12. ✅ **Multi-buffer diff review.** `DiffPane` overlay with per-hunk
    Apply/Reject, applied/rejected highlights, +adds/−dels stats.
    Clicking a file_diff Part in the transcript opens it.
13. ✅ **Density toggle keybinding.** Global Ctrl+O cycle
    verbose→normal→summary; density chip in topbar is also clickable.
14. ✅ **Cmd+K slash palette + @-mention autocomplete.** Both wired.
    Palette default command set covers /help, /doctor, /agents,
    /tools, /inspect hdf5|parquet, /sessions, /settings, /clear.
    @-mention picker ships a default file/agent/tool index.
15. ⚠ **Markdown + KaTeX + Mermaid + image rendering in tool_result
    Parts.** Deferred to v1.0 (text rendering only today; the
    upstream agent's tool_result Parts are mostly plain text and
    JSON, so this is polish rather than function).

## Pending for v1.0

The items below are explicitly deferred — they require either signing
infrastructure, a feature in `clio-agent-gact` that's still in
development, or polish that the v0.9 manual-test cycle would
prioritize:

- Code signing on every platform (Authenticode / Apple Developer ID /
  Sigstore-or-GPG) and the Tauri auto-update channel that depends on
  it.
- Desktop bearer-token storage moved from localStorage to OS keychain.
- Notification on `session.status: idle while unfocused` (the Tauri
  plugin is registered and the tray icon is live; just need the
  trigger in `live.ts`).
- /doctor + /metrics full pages.
- Markdown / KaTeX / Mermaid / image rendering in tool_result.
- Real semantics for the slash-palette commands beyond navigation.
- Drag-and-drop file attach in the composer.

## Done

- ✅ Branch `feat/apps-harness` created off `develop`; PR #74 open.
- ✅ pnpm workspace + tsconfig base + lint/test/typecheck scripts wired.
- ✅ `@clio/core` HTTP + SSE + transcript store + backend registry,
  with 26 vitest specs.
- ✅ `@clio/web` boots into a SplashScreen → ChatScreen flow with
  sidebar, transcript, composer, permission card, diff pane, slash
  palette, @-mention picker.
- ✅ `@clio/desktop` Tauri 2 shell with externalBin sidecar bundling,
  Rust supervisor, SSH tunnel manager, tray icon, OS notifications.
- ✅ Go launcher (`apps/desktop/sidecar-launcher/`) resolves & execs
  real `clio-agent-gact` from develop branch / system install.
- ✅ Playwright visual loop produces all 14 required PNGs + the
  original 6 (20 specs total).
- ✅ `.github/workflows/apps.yml` runs lint/typecheck/test/build/visual
  on every push; tauri-debug builds across linux+windows; release
  matrix fires on `clio-desktop-v*` tag.
- ✅ Release docs: README, INSTALL, FIRST-RUN, SECURITY.
