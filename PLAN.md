# PLAN — ordered task queue

Pick the **first unchecked item**. When done: check it, commit, push, move to the next. If blocked on a task, mark it `[BLOCKED: reason]`, append a follow-up task at the bottom, and pick the next unblocked item.

When picking, consider deps: emulator must exist before TUI can really test. Tasks marked `(parallel)` can be done before the prior one completes.

## Phase A — Emulator skeleton

- [x] **A1.** `emulator/go.mod`, package layout. **Decided:** stdlib `net/http` only (Go 1.22+ method-prefixed mux), `github.com/google/uuid` for IDs. Module `github.com/JaimeCernuda/gact-tui/emulator`. Layout: `cmd/emulator-server/`, `internal/server/`, `pkg/gact/`.
- [x] **A2.** Server bootstrap: `cmd/emulator-server/main.go` with `--port`, `--scenario` flags. `go run ./cmd/emulator-server` boots, listens, gracefully shuts down on SIGTERM.
- [x] **A3.** `GET /v1/health` returns `{healthy: true, uptime_s: <int>}` (per SPEC §3.4).
- [x] **A4.** `GET /v1/capabilities` returns the capability bundle (per SPEC §3.3). Hard-coded; reflects what the emulator implements (workspaces/sessions/subagents/MCP/files/diffs/permissions/providers/commands/metrics/branching/export/cost/thinking/search = true; LSP/voice/scheduled/sharing/edit_modes/plan_mode/agent_write/skills_extraction = false in v0.1).
- [x] **A5.** Internal storage layer: in-memory state for workspaces, sessions, messages, parts. **Decided:** sync.RWMutex per-Store (single mutex, simpler than per-resource), maps keyed by ID, secondary index `messagesBySession`. Cascade delete (workspace→sessions→messages). System messages filtered by default in ListMessages. Cursor pagination via `Before` (last seen msg ID).
- [x] **A6.** Workspaces endpoints (SPEC §6.1): GET list, POST create, GET one, PATCH, DELETE. Seeded `ws_default` at `/tmp/gact-emulator-workspace`. Auto-name from basename if not supplied. DisallowUnknownFields for strict request validation.
- [x] **A7.** Sessions endpoints (SPEC §6.2): list (filter workspace_id, parent_session_id, archived), create (with optional fork-at-message), get, patch (title, archived, agent, model, status, metadata), delete, fork (copies messages from parent), cancel (resets status to idle — event emission deferred to A10/A11), summarize (placeholder summary — real summary via A11 scenario), export (chronological), import (resets IDs). **Fix:** store.CreateSession now resets MessageCount/Tokens/CostUSD — derived fields managed by store, not callers.
- [x] **A8.** Messages endpoints (SPEC §6.3): list cursor-paginated, get, POST 202, DELETE, PATCH part, search (substring + snippet).
- [x] **A9.** SSE event stream: per-client filter, ring-buffer replay via Last-Event-ID, heartbeat 15s.
- [x] **A10.** Event bus: in-process pub/sub with monotonic SeqID, ring buffer, slow-subscriber drops counted, race-clean fan-out.
- [x] **A11.** Scenario engine: per-session goroutine + cancel; DefaultScript synthesizes thinking + intro + tool_call + tool_result + finish, optionally with permission flow on dangerous keywords.
- [x] **A12.** Permissions: list (pending filter), get, respond (allow/deny/allow_session/allow_workspace). Per-request resolveCh wakes the scenario.
- [x] **A13.** Providers + models: anthropic / openai / local with realistic models + pricing.
- [x] **A14.** Tools: bash/read_file/edit_file/web_search + 2 mcp-sourced tools, all with input_schema and ToolAnnotations.
- [x] **A15.** MCP: one fake server (`mcp_fake`) — list/get/reconnect/tools/resources/templates/read/subscribe/prompts/prompts.get.
- [x] **A16.** Agents: default + code_reviewer (read). Write API + extract → 501 per `agent_write=false`.
- [x] **A17.** Files / context / repo_map: per-session context-files set + workspace files demo + repo_map demo tree.
- [x] **A18.** Diffs: aggregate file_diff parts across messages, apply/reject mark Applied flag, undo deletes last N messages.
- [x] **A19.** Commands: /clear /cancel /model /agent /add /drop /diff /undo /help /summarize (mcp_prompt).
- [x] **A20.** Metrics: tokens, sessions+by_status, messages+by_role, cost+by_provider.
- [x] **A21.** Cancellation: handleCancelSession invokes engine.Cancel + emits status_changed (verified by E2E test).

## Phase B — Emulator tests (DONE)

- [x] **B1.** Table-driven endpoint tests across handlers_*_test.go files.
- [x] **B2.** SSE integration via `cmd/emulator-server/e2e_test.go::TestE2E_FullScenarioFlow`.
- [x] **B3.** Permission flow E2E in `TestE2E_PermissionFlow`.
- [x] **B4.** Cancel mid-stream covered by `TestE2E_CancelInflight`.
- [x] **B5.** Coverage ≥ target: events 87.3%, scenario 82.2%, server 79.9%, store 90.3%.

## Phase C — TUI scaffold

- [x] **C1.** `tui/go.mod`. Module `github.com/JaimeCernuda/gact-tui/tui`. Bubbletea v2, lipgloss v2, bubbles v2. `gact` binary builds (~11.5MB).
- [x] **C2.** `tui/internal/client/` — typed Go HTTP+SSE client. Covers capabilities, sessions, messages, events, agents, tools, providers, commands, permissions, metrics. Integration test boots emulator binary and exercises the wire.
- [x] **C3.** SSE consumer: tea.Cmd loop pattern. waitForSSE re-enqueues itself on every event. Reconnect on `sseClosedMsg`.
- [x] **C4.** Root model + layout: header / sidebar+body / footer via lipgloss.JoinVertical/Horizontal. AltScreen + Bg/Fg colours.
- [x] **C5.** Sidebar with sessions list, ▌ marker on selected, status colour-italic underneath.
- [x] **C6.** Body conversation pane: role-coloured headers (USER/ASSISTANT/TOOL/SYSTEM), thinking/text/tool_call/tool_result/file_diff/error rendering, scroll-clip with sticky-bottom.
- [x] **C7.** Input pane: simple text buffer + Enter-to-send (textarea bubble can replace later). Cursor blink.
- [x] **C8.** Footer: focus zone, key hints (Tab pane, Enter send, ?help, ctrl+c quit), UTC clock.
- [x] **C9.** Streaming: message.created → part.added → part.delta (text_append, thinking_append, input_json_append) → part.completed (parses tool_call input). Verified end-to-end via 02-streaming + 03-completed screenshots.
- [x] **C10.** Permission dialog: yellow warning banner above conversation when permission.requested arrives. Verified via 04-permission screenshot. (Action submit keys still TODO — see C10b.)
- [x] **C10b.** Permission action keys (a/d/s/w → POST /v1/permissions/{id}).
- [x] **C11.** Slash palette ('/' on empty input opens it; fuzzy filter; Enter dispatches POST /v1/sessions/{id}/commands/{cmd_id}).
- [x] **C12.** Help overlay ('?' toggles).
- [x] **C13.** WindowSizeMsg propagated through layout.
- [x] **C14.** Connect screen: capabilities probe on startup; error stage on failure; capabilities-aware UI (e.g. would hide panels if capability=false).
- [x] **C15.** Settings panel — Ctrl+s opens modal with Model/Agent tabs; lists from /v1/providers + /v1/agents; Enter applies via PATCH /v1/sessions/{id}. Theme switching deferred to E3.
- [x] **C16.** File context panel — sidebar CONTEXT section lists files for current session with mode badges (E/R/P colored). Loaded on session select via GET /v1/sessions/{id}/context/files. Add/remove via REST is wired in client (AddContextFile/RemoveContextFile) but not yet exposed via UI keys.
- [x] **C17.** Diff viewer: a/r keys on body focus apply/reject all pending diffs via /v1/sessions/{id}/diffs/{apply,reject}. Diff part shows status badge: '(applied)' / '(rejected)' / inline hint when pending. Emulator scenario triggered by 'diff' / 'edit' / 'patch' / 'propose' keywords.
- [x] **C18.** Cost meter — emulator now emits `cost.updated` after every assistant turn (synthetic 1500-in/600-out at Sonnet rates ≈ $0.0135/turn) and rolls into the session aggregate; TUI consumes the event, updates the in-memory session, renders `$X.XXXX (N in / N out)` right-aligned in the footer.
- [x] **C19.** Subagent indication: scenario spawns a subagent on "split"/"with help"/"subagent" triggers; emits subagent.started/completed events; parent carries subagent_call/result parts; TUI renders both with ▼/▲ markers; sidebar shows subsessions indented with `└`. Verified via 15-subagent-parent + 16-subagent-sidebar screenshots.

## Phase D — TUI tests + visual verification

- [x] **D1-D5.** Golden snapshots for ConnectingStage, ErrorStage, ReadyEmpty, ReadyWithSessions, StreamingConversation, PermissionBanner, HelpOverlay, PaletteOpen, PaletteFiltered (9 states under `tui/internal/ui/testdata/`).
- [x] **D6-D10.** Visual screenshots — exceeded scope: 14 PNGs in `screenshots/` covering every visible state including markdown rendering and textarea input.

## Phase E — Polish & integration

- [x] **E1.** TUI teatest e2e — unblocked by adding `App.DisableAltScreen` (test-only knob). 3 tests in tui/internal/ui/e2e_test.go cover happy path (Ctrl+N → type → wait for ASSISTANT/read_file/TOOL render), permission flow (delete → permission banner → 'a' allow → completion), and overlays (? help, / palette). Took 2.84s race-clean.
- [x] **E2.** README.md at repo root.
- [x] **E3.** Theming — LightTheme() + ThemeForMode() + ParseThemeMode(); main.go honors `--theme=light|dark` flag (and `GACT_THEME` env). Glamour markdown style still hardcoded dark — visible mismatch on light bg (follow-up).
- [x] **E3b.** Glamour style follows TUI theme — Theme.glamourStyle() picks 'light' when bg luminance is bright, 'dark' otherwise; renderMarkdown takes style as param; cache key now includes (style, width).
- [x] **E4.** Keyboard hint discoverability — footer + help overlay.
- [x] **E5.** Connection resilience — sseClosedMsg → reconnect tick.
- [x] **E6.** Empty-state polish — sidebar n-to-create + body crib.
- [x] **E7.** Multi-pane focus — Tab cycles, focus indicated by `BorderForeground(Primary)` on the active pane.

## Phase F — Stretch (only if Phase A–E complete)

- [x] **F1.** OpenCode adapter v0.1 — new `adapters/opencode/` module exposes GACT v0.1 endpoints, proxies to an OpenCode upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/sessions`, `/v1/sessions/{id}` with shape translation (OpenCode ms timestamps → time.Time, slug/projectID/directory preserved as `x_opencode_*` metadata). Unimplemented endpoints return 501. Tests use httptest to mock OpenCode upstream — no real OpenCode needed. README documents remaining endpoints + their OpenCode mappings as a follow-up roadmap.
- [x] **F2.** Configuration file — JSON at `$XDG_CONFIG_HOME/gact/config.json` (or `~/.config/gact/`); resolution precedence file < env < flag < fallback. Decided JSON over TOML to keep TUI dep-free.
- [x] **F3.** Export/import subcommands — `gact export <sid> [-o file]`, `gact import <file|->`. Flag reordering so users can write `gact export SID -o file`. Honors GACT_BACKEND env. Round-trip verified manually against the emulator.
- [x] **F4.** Voice transcribe wire-up — emulator implements POST /v1/sessions/{id}/voice/transcribe (canned transcript by body length, with `?text=` query override for tests). TUI client.VoiceTranscribe + Ctrl+Y key inserts the recognised text at the textarea cursor. Real mic capture is platform-specific shell-out — out of scope for the TUI core; documented as user-supplied wrapper script.
- [x] **F5.** Markdown rendering in messages via glamour — implemented for assistant text (iteration 11).

## Phase G — Open follow-ups

- [x] **G1.** OpenCode adapter messages list — `GET /v1/sessions/{id}/messages` translates OpenCode's `GET /session/{id}/message`. Forwards limit + before query params. Translates parts: text, reasoning→thinking, tool→tool_call, file→image. Unknown types pass through as `x_opencode_<type>` per SPEC §8.3 forward-compat. Cost/tokens/finish propagated.
- [x] **G2.** OpenCode adapter SSE — proxy `/event` with shape translation. session.idle → session.status_changed, session.error → message.error, message.updated → message.created, message.part.updated/.delta passed through with shape conversion, permission.asked/.replied → permission.requested/.resolved. Unknown OpenCode event types pass through as `x.opencode.<type>` per SPEC §8.4. Per-session filter via /v1/sessions/{id}/events drops crosstalk. Heartbeat every 15s. Full handler at handlers_events.go; 7 translation tests.
- [x] **G3.** OpenCode adapter POST message — `POST /v1/sessions/{id}/messages` translates GACT parts → OpenCode parts (text + tool_call) and forwards to OpenCode's `POST /session/{id}/prompt_async`. Returns synthetic 202 with placeholder message_id (real ID will arrive via SSE — wired in G2).
- [x] **G4.** Crush adapter scaffold — new `adapters/crush/` module exposes GACT v0.1 endpoints, proxies a Crush HTTP upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/workspaces/{id}`, `/v1/sessions?workspace_id=`, `/v1/sessions/{id}` — flattens Crush's nested `/v1/workspaces/{wsID}/sessions` URL into GACT's flat shape via query param + `--default-workspace` flag. Crush's Unix-second timestamps parsed; yolo/debug surfaced as `metadata.x_crush_*`; prompt/completion tokens map to GACT input/output. Mocked-upstream tests; no real Crush needed. Messages/SSE/POST/permissions/LSP/MCP + Unix socket transport documented as follow-ups.
- [x] **G5.** Voice mic capture — `--voice-cmd` (env: `GACT_VOICE_CMD`, config: `voice_command`) shells out to a user-supplied recorder on Ctrl+Y. Reference wrapper at `scripts/voice-record.sh` covers arecord/sox/ffmpeg with a 6 s default duration. Contract: cmd writes audio/wav to stdout and exits 0; non-zero with stderr surfaces to the user as an error stage. 30 s runtime cap + 16 MiB audio cap protect the TUI from a runaway recorder. Unit tests cover empty cmd (placeholder) / success / non-zero exit / empty audio.
- [x] **G6.** Cost meter test — `TestCostAccumulatesAcrossTurns` runs 3 user turns through the default scenario and asserts session.CostUSD = 0.081 (3 × 2 × $0.0135) and tokens.input/output match (9000 / 3600). Catches regressions in completeMessage cost charging.
- [x] **G7.** Sidebar viewport — j/k already auto-scroll past the visible window; added g/G for first/last and PgUp/PgDn (also Ctrl+u/Ctrl+d) for paged jumps. `sidebarPageSize()` mirrors the renderSidebar arithmetic so the page step always equals what the user actually sees. Help overlay updated; new tests cover g/G, PgUp/PgDn, clamps at the ends, and that g at index 0 emits no Cmd (no spurious SSE reload).
- [x] **G8.** Search UI — slash palette switches to message-search mode when the filter starts with `?`. First Enter submits the query, results replace the matches list with msg id + snippet, second Enter jumps the conversation viewport to the hit. Backspace invalidates loaded results so the user re-fires after editing. Search errors are swallowed (no full-screen error stage). Help overlay documents `/?…`. New `client.SearchMessages` + 6 unit tests cover the mode switch, submit, jump, invalidation, empty-query no-op, and error swallowing.
- [x] **G9.** Reload-on-config-change — Ctrl+L re-reads `$XDG_CONFIG_HOME/gact/config.json` and hot-applies theme + voice command without restart. Backend changes are flagged in the toast ("backend changed — restart to apply") rather than applied live, since rebinding the URL would force-reconnect SSE/refetch caps/drop the loaded session — too disruptive for an in-flight conversation. Result is shown as a transient hint above the input pane (auto-clears on next non-Ctrl+L key). 5 unit tests cover fire path, error surfacing, nil-hook no-op, hint clearing, and Ctrl+L→Ctrl+L overwrite. fsnotify-style auto-watch deferred — manual reload covers the 80% case (operator tweaking colors).
- [x] **G10.** Telemetry sampling — `latencyTracker` keeps a 1024-sample ring buffer per route pattern; timing middleware wraps the mux and records `time.Since(start)` keyed by `r.Pattern` (Go 1.22+ sets this during routing). SSE/`/events` patterns are skipped (their durations measure connection lifetime, not RPC latency). `/v1/metrics` now includes `latencies: { "GET /v1/foo": { count, p50_ms, p95_ms, max_ms } }`. TUI metrics modal renders the top-6 routes by p95 so operators see the slowest endpoints first. 5 unit tests cover percentile correctness, SSE skip, empty-pattern skip, ring-buffer overwrite, and the e2e shape via /v1/metrics.
