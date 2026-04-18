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
- [ ] **C16.** File context panel (use /v1/sessions/{id}/context/files).
- [ ] **C17.** Diff viewer: file_diff part is currently rendered with `+/-` lines; could add accept/reject buttons.
- [ ] **C18.** Cost meter in footer (consume cost.updated events; emulator does not yet emit them).
- [x] **C19.** Subagent indication: scenario spawns a subagent on "split"/"with help"/"subagent" triggers; emits subagent.started/completed events; parent carries subagent_call/result parts; TUI renders both with ▼/▲ markers; sidebar shows subsessions indented with `└`. Verified via 15-subagent-parent + 16-subagent-sidebar screenshots.

## Phase D — TUI tests + visual verification

- [x] **D1-D5.** Golden snapshots for ConnectingStage, ErrorStage, ReadyEmpty, ReadyWithSessions, StreamingConversation, PermissionBanner, HelpOverlay, PaletteOpen, PaletteFiltered (9 states under `tui/internal/ui/testdata/`).
- [x] **D6-D10.** Visual screenshots — exceeded scope: 14 PNGs in `screenshots/` covering every visible state including markdown rendering and textarea input.

## Phase E — Polish & integration

- [ ] **E1.** End-to-end test: TUI driven via teatest in same process talking to embedded emulator. (`internal/client/client_integration_test.go` already covers wire-format end-to-end via real binary; this would add UI-level assertions.)
- [x] **E2.** README.md at repo root.
- [ ] **E3.** Theming: light/dark adaptive via lipgloss `LightDark`. Currently dark-only.
- [x] **E4.** Keyboard hint discoverability — footer + help overlay.
- [x] **E5.** Connection resilience — sseClosedMsg → reconnect tick.
- [x] **E6.** Empty-state polish — sidebar n-to-create + body crib.
- [x] **E7.** Multi-pane focus — Tab cycles, focus indicated by `BorderForeground(Primary)` on the active pane.

## Phase F — Stretch (only if Phase A–E complete)

- [ ] **F1.** Real backend adapter for Crush (or OpenCode, whichever is easier).
- [ ] **F2.** Configuration file (`~/.config/gact/config.toml`) for backend URL, theme, default model.
- [ ] **F3.** Session export/import via `gact export <session_id>` / `gact import <file>` CLI subcommands.
- [ ] **F4.** Voice input wiring (call backend `/voice/transcribe`).
- [x] **F5.** Markdown rendering in messages via glamour — implemented for assistant text (iteration 11).

## Follow-ups (added during build, not yet ordered)

(None yet.)
