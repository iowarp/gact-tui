# Changelog

All notable user-visible changes to gact-tui are documented here.
Internal refactors that don't change the contract or the rendered
UI aren't tracked.

## [0.11.2.11] — 2026-09-20

### Fixed

- Constrain the desktop workspace to the height remaining below the native
  title bar, keeping Settings and version controls visible while each route
  scrolls inside that space.

## [0.11.2.10] — 2026-09-20

This is the signed update target used to verify Desktop-only, CLIO-only, and
combined installed updates from the repaired v0.11.2.9 updater.

## [0.11.2.9] — 2026-09-20

### Fixed

- Force-reinstall managed CLIO updates, discard stale package metadata and
  bytecode left by older bundled runtimes, and verify the version Python
  actually imports before reporting a successful update.

## [0.11.2.8] — 2026-09-20

### Fixed

- Keep the sidebar header and footer at their intended height on short desktop
  windows so the Settings and version controls remain visible while the
  workspace list scrolls independently.

## [0.11.2.7] — 2026-09-20

This is the signed update target used to verify Desktop-only, CLIO-only, and
combined installed updates from the repaired v0.11.2.6 updater.

## [0.11.2.6] — 2026-09-20

### Fixed

- Update the managed CLIO runtime through the `bin/uv` executable that is
  actually shipped by every bundled desktop runtime, while retaining support
  for the legacy root-level layout.

## [0.11.2.5] — 2026-09-20

### Fixed

- Keep the compact version and update control visible by placing it beside
  Settings in the sidebar footer, including on shorter desktop windows.

## [0.11.2.4] — 2026-09-20

The desktop acceptance target paired with clio-agent v0.9.4.4. It is an
intentionally minimal follow-up release used to verify Desktop-only, CLIO-only,
and combined signed updates from v0.9.4.3 through the installed application.

## [0.11.2.3] — 2026-09-20

The desktop release paired with clio-agent v0.9.4.3.

### Added

- A compact version indicator beside Infrastructure and Settings opens two
  branded software rows for the desktop and connected CLIO agent, with their
  individual versions, release links, and independent or combined updates.

### Changed

- Desktop updates use the lightweight signed installer and preserve the
  managed CLIO runtime, allowing desktop-only, agent-only, and combined update
  acceptance paths to be tested independently.

### Fixed

- Bundled CLIO updates now modify and verify the exact writable runtime the
  desktop launches, then restart with a fresh endpoint and credentials.
- The update indicator shares the background updater result instead of
  blocking the version popover on another release-network request.

## [0.11.2.2] — 2026-09-20

The desktop release paired with clio-agent v0.9.4.2. It completes the live
remote-infrastructure path and the installer/runtime follow-up found during
release acceptance.

### Added

- Remote CLIO deployment from the connection menu, using a saved SSH profile
  or a manually entered host with password, key-file, pasted key, or SSH-agent
  authentication.
- A per-host install and runtime location for shared systems whose persistent
  storage is not the login home directory.
- A connected-services summary that shows what the active CLIO agent is using,
  where each service runs, and whether its connection is actually ready.
- CLIO Web Search deployment, status, logs, stop, reconnect, and alternate task
  backend port controls for local and SSH targets.

### Changed

- Infrastructure opens on Services and uses compact, collapsible service
  groups with target facts, progress, blockers, and responsive action menus.
- A same-host remote CLIO agent connects to remote Web Search through loopback;
  the desktop-facing address remains the reachable SSH-host address.
- Provider selection uses a smaller two-pane picker with independent scrolling,
  persistent visibility controls, and provider-owned logos and health details.
- Bundled Windows runtimes are installed from one compressed payload instead of
  thousands of installer file operations.

### Fixed

- Remote capability inspection no longer reports transient empty facts while
  the SSH probe is still running, and vLLM/Docker eligibility follows observed
  target facts rather than host names.
- Web Search no longer reports "Connected" from unrelated global
  configuration; readiness is tied to the selected deployment and active
  agent.
- The embedded terminal is available from the canvas menu whenever the desktop
  host can actually open it.
- Desktop shutdown preserves independent backends while reaping the owned
  process tree, terminal children, tunnels, and managed service processes.

## [0.11.2.1] — 2026-09-19

The desktop release paired with clio-agent v0.9.4.1. It closes the bug list
from the first round of desktop testing: quitting, window chrome, branding,
the interactive surface, tooling detail, versions and updates, a terminal,
and the Windows installer.

### Added

- A terminal as a workbench tab, running a real shell in the workspace
  directory. It survives switching tabs, reports when the shell exits, and is
  shut down with everything else the app owns when you quit. "Open in system
  terminal" is still there as the secondary action.
- A Versions panel in Settings showing the desktop app, the web UI, the agent
  and the installed blueprint pin, with a button to check for app updates and
  another to check for blueprint updates.
- Background update checks at startup and every six hours, with a notification
  offering to restart into the new version once it has downloaded.
- An Infrastructure page in the Windows installer for choosing what to set up
  alongside the app: CLIO Search on by default, a local model runtime off by
  default, and the bundled tool kit. The page is skipped for silent and update
  installs.
- Official logos for the providers the model picker offers, with a neutral
  fallback for anything unrecognized.
- A "Set up protected execution" action on the Agent page, so the Windows
  sandbox can be provisioned from the app instead of being described as
  optional. The row reports what is actually verified rather than assuming.
- Tool detail showing a tool's description and its typed inputs and outputs,
  with built-in tools grouped by the server that provides them and each
  extension group carrying one badge for where it came from.

### Changed

- One window bar across the whole app: app menu, brand, workspace and session
  context, connection health with the endpoint and backend version, and the
  window controls. The operating system menu bar is now macOS-only, where the
  platform expects it.
- An interactive question is drawn as a single panel instead of nested boxes.
  Dragging it taller and opening it full window still work, and the transcript
  links down to it so a waiting question cannot be missed.
- Product and protocol names are consistent across the app, and the technical
  rows that used to sit open are collapsed under their own headings.

### Fixed

- Closing the window asks what you want instead of quitting silently. Escape,
  the X and the backdrop dismiss the prompt, "Keep running" leaves the app in
  the tray with the backend and your work intact, and "Quit" tears down
  everything the app owns exactly once, from the tray, the menu and macOS Quit
  alike.
- Quitting no longer raises a spurious error notification on the way out.
- The brand title and icon survive a page reload instead of reverting.
- The Windows installer removed application data using a fixed identifier, so a
  differently branded build cleaned up the wrong folder.
- Update failures are reported with the reason the updater actually gave rather
  than a generic message, and a download in progress is shown as progress.

## [0.11.1.2] — 2026-09-17

### Fixed

- Hide the managed backend process tree on Windows while preserving its persisted boot log.
- Run managed desktop backends from a stable app-data workspace instead of inheriting the launcher's current directory.
- Keep desktop workspaces, sessions, and installed blueprints in the app's own durable user-state directory instead of mixing them with CLI and test profiles.

## [0.11.1.1] — 2026-09-16

### Fixed

- Bundled desktop startup keeps the 30-second readiness contract. CLIO's
  release packaging now prepares Python bytecode before installation so users
  do not pay that one-time runtime cost when opening the app.

## [0.11.1] — 2026-09-16

### Fixed

- Bundled desktop builds now show an explicit automatic-start screen while the
  private CLIO service selects its ephemeral port and becomes ready. The app no
  longer asks users for a connection address during this managed startup.

### Changed

- The native WebView gate can exercise the packaged managed-service path with
  no fixed backend URL, verifies the private endpoint and bearer-token handoff,
  and captures supervisor state and boot logs on failure.

## [0.11.0] — 2026-09-13

The React workspace release paired with clio-agent v0.9.2. It replaces the old
single-purpose web shell with the same session, tool, resource, artifact,
interaction, and observability model across the browser and desktop host.

### Added

- A complete workspace shell for projects and sessions, with streamed turns,
  reviewable file changes, plan approval and execution, attachments, durable
  artifacts, resource readers, workspace memory, and child-agent navigation.
- Native MCP 2026-07-28 interactions, including elicitation, multi-round tool
  input, durable task progress, cancellation, prompts, and embedded MCP Apps.
- A2UI 0.9.1 surfaces with trusted components, form actions, agent-submit
  actions, narrow-layout support, and persisted reload behavior.
- Session evidence views for files, changes, artifacts, plans, sources,
  workflows, child agents, timelines, hierarchical Gantt execution, and
  provenance graphs.
- Desktop-managed provider and service deployment for local and remote hosts,
  secure credentials, live provider discovery, and vLLM reasoning parsers.

### Changed

- Tool rows render the server-declared presentation contract. Arguments and
  results are visually distinct, long output is bounded with explicit expansion,
  resource and memory results use semantic layouts, and technical payloads stay
  behind the information control.
- Child work uses causal Spawn, Observe, Message, Wait, and Collect rows with
  stable task identity, readable status, and direct navigation to child sessions.
- Files and artifacts open in durable side-panel tabs rather than replacing the
  current session. Artifact lists are compact, independently scrollable, and do
  not pre-render every document.
- Provider refresh results are grouped by provider and keep tool availability
  distinct from live service health.

### Fixed

- Reloaded sessions retain compaction checkpoints, child activity, rich tool
  results, and the final answer without reconstructing contradictory client state.
- Resource conversion, search, structure, and read operations identify their
  input and outcome instead of dumping unlabeled transport text.
- Workspace-memory results use internal navigation and bounded, individually
  expandable matches instead of forcing a full-page reload.
- The compaction activity row identifies the checkpoint and exposes its summary
  preview without presenting it as transcript deletion.

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
  server _does_ emit it message-level with no backing part for
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
