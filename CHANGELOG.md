# Changelog

All notable user-visible changes to gact-tui are documented here.
Internal refactors that don't change the contract or the rendered
UI aren't tracked.

## [0.9.7] — 2026-07-13

The desktop-sidecar restoration release. Pairs with clio-agent v0.7.0.

### Fixed
- **Desktop sidecar launcher found on real installs** (#309): tauri-bundler
  strips the target-triple suffix when packaging `externalBin`, but the
  supervisor looked only for the suffixed dev name next to the executable —
  every installed bundle failed at boot with "sidecar launcher missing".
  The lookup now probes the installed (stripped) name first; ARM triples
  added; unit tests cover both layouts.

### Changed
- **Generic self-describing bundled runtime** (#311): a bundled backend is a
  `gact-runtime/` dir shipping a `runtime.json` manifest
  (`{"schema":1,"exec":[...],"env":{}}`) that the launcher execs with zero
  brand knowledge; `GACT_BUNDLED_RUNTIME_DIR` unified with the supervisor
  (the env-name drift had silently killed resource-dir discovery). A
  present-but-broken manifest is a hard typed error, never a fallthrough.

### Removed
- `build-clio-runtime.{sh,ps1,mjs}` — the embedding brand builds its own
  runtime (moved to iowarp/clio-agent `install/build-gact-runtime.*`);
  apps.yml exercises the generic packing with a stub runtime.

## [0.9.6] — 2026-07-13

> Retroactive entry: v0.9.6 was tagged without a CHANGELOG heading, so its
> changelog-gated neutral release never published (assets shipped via the
> clio-agent release pipeline instead). Recorded for the tag history.

### Changed
- Thinking-level control surface (#307): typed `thinking_level` plumbed
  through the web provider settings at contract parity with clio-agent
  v0.6.x (`off|low|medium|high`, effective-value reporting).
- Blocked-turn `workflow_state` carried as typed part metadata rather than
  `output_summary` prose in the web visual fixtures (#307).

## [0.9.5] — 2026-07-09

The parity-and-convergence release. Closes the two protocol-convergence
epics — #233 (the TUI renders at parity with the web client off the same
wire) and #232 (spec follows reality; conformance makes drift
CI-impossible) — validated end-to-end against the live CLIO backend
running EarthScope.

### Changed
- **TUI renders the server's clean stream verbatim.** The orchestration
  "placeholder" chrome the client used to synthesize is stripped at web
  parity, so a delegation turn renders the same nested
  `main → expert → tool → returns` grammar the web client shows, with no
  client-side scaffolding (#233, #300).

### Removed
- **Client-side `workflow_state` part fabricator deleted.** clio never
  emits `workflow_state` at message level (it rides real `expert_handoff`
  parts), so the synthetic evidence part the TUI fabricated was pure
  client invention — now gone. `reasoning_log` promotion is retained (the
  server *does* emit it message-level with no backing part for
  reasoning-capable models) (#233, #301).

### Contract
- **`GET /messages` pagination is now a normative contract.** `limit`
  absent → full ledger; `limit<=0` or non-numeric → 422; unknown `before`
  → 404; `before` resolves against the unfiltered ledger before system
  rows are dropped and the limit applied; `next_cursor` is the
  oldest-of-page id on truncation. `parent_session_id` session filtering
  is honored. Codified in SPEC §6.3, implemented in the emulator, and
  asserted against clio by conformance (`Drift_MessagePagination`,
  `Drift_ParentSessionFilter`) (#232, #298, #302).

### Notes
- The two residual #232 boxes are **owner decisions**, each tracked in its
  own issue: Go wire-type ownership / codegen (#254 — a decision-ready
  design + spike is posted there) and the single server-side dedup owner
  (clio #832). Neither is client work.

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
