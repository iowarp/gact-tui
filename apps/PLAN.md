# apps/ — PLAN

Ordered queue of post-harness work. Pick the top unfinished item.

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

## Wave 1 — wire up live data

1. **Plumb live `/v1/sessions` into Sidebar.** Replace `fixturesForDemo` with a
   `createResource` over `@clio/core` against the connected backend; reconnect on
   401/5xx with a chip. Keep fixtures available via `?mock=1` for visual tests.
2. **Subscribe to per-session SSE.** Wire `EventSource` in a Solid resource keyed by
   active session id; reduce `message.created/part.added/part.delta/completed` into
   the transcript store; verify token-by-token streaming in the chat shell.
3. **POST `/v1/sessions/{id}/messages` from Composer.** Optimistically append a user
   message; surface errors as a footer toast; honor the disabled-while-streaming rule.
4. **Implement permission resolution.** POST `/v1/permissions/{pid}` from the four
   approve buttons + Deny; pull the pending queue from `/v1/permissions?session_id=`
   and reduce `permission.requested` events into it.

## Wave 2 — federated connect

5. **Per-backend bearer-token store.** Keyring on desktop (`@tauri-apps/api/store` +
   `keyring` crate); IndexedDB on web; one common `Persistence` interface in
   `@clio/core`.
6. **Backend picker in the composer footer.** Status pip per registered backend
   (green/amber/red); add-backend modal collects URL + token; web cannot manage SSH
   (degraded mode); desktop opens the Add-SSH wizard.
7. **Capability gating.** Wrap diff sidebar, MCP catalog, agent picker, memory chips
   in `<Show when={caps().X}>` — unknown caps surface in `/doctor`.

## Wave 3 — desktop-native

8. **SSH-tunneled backend support.** Tauri side: spawn `ssh -L`, parse exit code,
   surface to UI; OS keychain for keys + passphrases; auto-reconnect on tunnel drop.
9. **OS notifications + tray.** Hook `permission.requested` and `session.status:idle`
   while the window is unfocused; tray icon badges the detached-session count.
10. **Native auto-update.** Tauri's built-in updater pointed at the GitHub Releases
    manifest; sign builds on each platform.

## Wave 4 — depth

11. **Routes for Settings + Doctor + Metrics.** Full-page; sectioned per
    `apps/08-decisions.md`.
12. **Multi-buffer review tab for `file_diff` Parts.** Per-hunk Apply / Reject;
    keyboard-driven; Cmd+; side-chat affordance.
13. **Density toggle keybinding.** `Ctrl+O` cycles verbose/normal/summary;
    per-session persistence.
14. **Cmd+K slash palette + `@`-mention autocomplete** — overlay anchored to
    viewport center, anchored to composer respectively.
15. **Markdown + KaTeX + Mermaid + image rendering** in `tool_result` Parts.

## Done

- ✅ Branch `feat/apps-harness` created off `develop`.
- ✅ pnpm workspace + tsconfig base + lint/test/typecheck scripts wired.
- ✅ `@clio/core` HTTP + SSE + transcript store with unit tests.
- ✅ `@clio/web` connect + chat shell with sidebar, transcript, composer, permission card.
- ✅ `@clio/desktop` Tauri 2 scaffold with locked CSP + capabilities.
- ✅ Playwright visual loop produces the six required PNGs.
- ✅ `.github/workflows/apps.yml` running lint/typecheck/test/build/visual + Tauri
  debug build matrix.
- ✅ Harness docs (STATUS, PLAN, HARNESS, CLAUDE) committed.
