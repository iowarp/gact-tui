# apps/ — PLAN

Ordered queue of post-harness work. Pick the top unfinished item.

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
