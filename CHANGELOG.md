# Changelog

All notable user-visible changes to gact-tui are documented here.
Internal refactors that don't change the contract or the rendered
UI aren't tracked.

## [0.9.4] — 2026-07-07

The lab-demo release. Pairs with the current CLIO backend and the GACT
protocol as it stands after the P0 hardening wave and the protocol-
convergence work that followed the 0.2 line.

### Added
- Config-aware CLI backend resolution: `resolveCLIBackend` reads
  `config.json` and surfaces a structured `reason` (e.g.
  `config_load_error`) instead of failing silently (#230).

### Changed
- SSE parsing brought to WHATWG conformance — leading-space stripping
  and multi-line `data:` accumulation handled per spec, replacing the
  ad-hoc line parser (#252).

### Notes
- **Gap 0.2.2 – 0.9.3 is not retro-documented.** The project versioned
  ahead of this changelog across the P0 wave and protocol convergence;
  those intermediate releases were not captured here at the time. For
  the per-tag detail, see the GitHub releases. This entry revives the
  changelog at the current tag (`v0.9.4`) rather than fabricating the
  intervening history.

## [0.2.1] — 2026-04-27

The "lab-ready" release. Pairs with clio-agent v0.3.1 — every advertised
capability is verified end-to-end through the TUI against the live CLIO.

### Added
- `/mcp`, `/tools`, `/catalog`, `/skills`, `/agents-list` registered as
  builtin slash-commands in the palette so the user can discover them
  without remembering the magic string. Each routes to its
  `catalogBrowser` modal as before.
- `SCREENSHOTS.md` index (now `screenshots/README.md`) — every PNG under `screenshots/` paired with
  the capability it proves and the tape that produced it.
- `docs/screenshots/clio_diff.png` — real CLIO diff path rendered inline.
- `docs/screenshots/clio_mcp_servers.png` — bundled + third-party MCP servers
  visible in the `/mcp` modal.

### Notes
- Test golden `TestView_PaletteOpen.golden` regenerated to include
  the new builtin commands.

## [0.2.0] — 2026-04-25

### Added
- GACT contract bumped to **v0.2** (`contractVersion = "0.2"` and
  `binaryVersion = "0.2.0"` in `tui/main.go`).
- `/doctor` modal grew a **Capabilities** scorecard tab next to the
  existing Health view. Shows v0.1 core / useful / v0.2 / vendor-
  specific buckets with green/red dots per capability flag from
  `/v1/capabilities`.
- LM-config modal exposes **Temperature** and **Max tokens** as
  editable rows alongside provider/model/key. Numeric input is
  filtered character-by-character so typos don't poison strconv.
  Plumbed through PUT `/v1/providers/lm` via `LMProviderRequest`'s
  new `Temperature` + `MaxTokens` fields.
- `LMProviderInfo` GET response now carries `temperature` +
  `max_tokens` so the modal can pre-fill with the active config.
- Live cost-meter — `message.completed` SSE events feed
  `applyCostUpdated` so the footer's `$X.XXXX` chip catches up
  per-turn without a full session reload.

### Changed
- `applyPartCompleted` reads `final_text` from the
  `message.part.completed` payload and replaces the buffered
  streamed text with the parsed clean answer once the part is done.
  Closes the ChatAdapter `[[ ## answer ## ]]` marker noise that was
  bleeding into visible text Parts.
- `applyCostUpdated` accepts both event shapes:
  - `cost.updated` events (session_id inside the inner payload) —
    treated as running totals.
  - `message.completed` events (session_id at the envelope level,
    payload only carries `cost_usd` + `tokens`) — treated as per-
    turn deltas added to the running total.

### Fixed
- Workspaces no longer hard-required by `Ctrl+N` against backends
  that advertise `capabilities.workspaces=false` (CLIO defaults the
  empty workspace_id to `ws_default` server-side).
- 5-tab navigation in lm_config modal (preset → model → key → temp
  → max_tokens → save) — was 3-tab before the new fields landed,
  so old tape automation broke.

## [0.1.0] — 2026-04-15

Initial GACT v0.1 release.
- Bubbletea/v2 + lipgloss/v2 TUI with sidebar (sessions + context),
  conversation pane, input pane, modal-based settings/help/palette/
  doctor/metrics/lm-config.
- v0.1 core: workspaces, sessions, subagents, mcp, files, diffs,
  permissions, providers, commands, metrics.
- v0.1 useful: session_branching, session_export, search_messages,
  cost_tracking, thinking_blocks, session_tasks.
- Five included adapter binaries plus the in-house emulator.
