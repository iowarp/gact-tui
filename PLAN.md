# PLAN — ordered task queue

Pick the **first unchecked item**. When done: check it, commit, push, move to the next. If blocked on a task, mark it `[BLOCKED: reason]`, append a follow-up task at the bottom, and pick the next unblocked item.

When picking, consider deps: emulator must exist before TUI can really test. Tasks marked `(parallel)` can be done before the prior one completes.

## Phase A — Emulator skeleton

- [ ] **A1.** `emulator/go.mod`, package layout. Dependencies: `net/http` stdlib (or `chi`/`gorilla` if needed — choose now), `encoding/json`, `github.com/google/uuid`. Module name `github.com/JaimeCernuda/gact-tui/emulator`.
- [ ] **A2.** Server bootstrap: `cmd/emulator-server/main.go` with `--port`, `--scenario` flags. `go run ./cmd/emulator-server` boots and returns 200 on `/v1/health`.
- [ ] **A3.** `GET /v1/health` returns `{healthy: true, uptime_s: <int>}` (per SPEC §3.4).
- [ ] **A4.** `GET /v1/capabilities` returns the capability bundle (per SPEC §3.3). Hard-coded for now; reflects what the emulator actually implements.
- [ ] **A5.** Internal storage layer: in-memory state for workspaces, sessions, messages, parts. Thread-safe (sync.RWMutex or channels — your call). No persistence yet.
- [ ] **A6.** Workspaces endpoints (SPEC §6.1): GET list, POST create, GET one, PATCH, DELETE. Return seed workspace `ws_default` rooted at `/tmp/gact-emulator-workspace`.
- [ ] **A7.** Sessions endpoints (SPEC §6.2): all CRUD + fork + cancel + summarize + export. summarize/cancel just update status/emit events.
- [ ] **A8.** Messages endpoints (SPEC §6.3): list (cursor-paginated, newest-first), get one, POST (returns 202 with msg_id), DELETE, PATCH part, search.
- [ ] **A9.** SSE event stream: `GET /v1/events?workspace_id=...` and `GET /v1/sessions/{id}/events`. Per-client event queue; `server.connected` on open, heartbeat every 15s. Use `Last-Event-ID` for resume.
- [ ] **A10.** Event bus: internal pub/sub so handlers can emit events to subscribed SSE clients.
- [ ] **A11.** Scenario engine: `scenarios/default.go` defines a script — when user posts a message, generate this assistant response with these parts (text, tool_call, tool_result, finish) emitted with realistic timing (configurable via `--timing fast|realistic`).
- [ ] **A12.** Permissions endpoints (SPEC §6.11): GET pending, POST allow/deny. Scenario can set "next tool requires permission" → emit `permission.requested` event → wait for response → continue.
- [ ] **A13.** Providers + models endpoints (SPEC §6.12): return a hard-coded list (Anthropic, OpenAI, Local) with sample models. No real API calls.
- [ ] **A14.** Tools endpoint (SPEC §6.6): list a fixed set of fake tools (`bash`, `edit_file`, `read_file`, `web_search`).
- [ ] **A15.** MCP server stubs (SPEC §6.7): one fake MCP server `fake-mcp` with 2 tools, 1 resource, 1 prompt. Endpoints return realistic shapes; nothing actually connects to a real MCP.
- [ ] **A16.** Agents endpoint (SPEC §6.5): GET returns 2 builtin agents (`default`, `code_reviewer`). Write API stubbed to 501 (`agent_write` capability false in v1 of emulator).
- [ ] **A17.** Files / context / repo_map (SPEC §6.9): minimal implementation — list files in workspace root, read file content, fake repo map (just file tree).
- [ ] **A18.** Diffs (SPEC §6.10): scenario emits a `file_diff` part; GET diffs endpoint returns it; apply/reject endpoints work.
- [ ] **A19.** Commands (SPEC §6.13): GET returns hard-coded slash-command list (`/clear`, `/model`, `/add`, `/diff`, `/cancel`, `/help`).
- [ ] **A20.** Metrics endpoint (SPEC §6.16).
- [ ] **A21.** Cancellation: in-flight scenario respects `POST /sessions/{id}/cancel` mid-stream — emits `message.error` part-stop and resets session status.

## Phase B — Emulator tests

- [ ] **B1.** `emulator/internal/server/server_test.go` — table-driven tests for each REST endpoint: status code, response shape (json schema), basic happy/sad paths.
- [ ] **B2.** SSE integration test: client connects, posts a message, asserts the canonical event sequence (per SPEC §7.4) arrives in order.
- [ ] **B3.** Permission flow integration test: scenario triggers permission, client receives event, client allows, scenario continues, client receives `tool.call.completed`.
- [ ] **B4.** Cancellation integration test: client cancels mid-stream, sees `message.error` and `session.status_changed → idle`.
- [ ] **B5.** Coverage check: `go test -cover ./...` should be ≥75% for `internal/server` and `internal/scenario`.

## Phase C — TUI scaffold

- [ ] **C1.** `tui/go.mod`. Module `github.com/JaimeCernuda/gact-tui/tui`. Deps from `notes/`. `cd tui && go build` produces `gact` binary.
- [ ] **C2.** `tui/internal/client/` — Go HTTP client for GACT v0.1 with typed request/response. Use `notes/` shapes from SPEC §4. Cover capabilities, sessions, messages, events (SSE).
- [ ] **C3.** SSE consumer: a goroutine that reads the events stream and turns each event into a `tea.Msg` posted via `program.Send`. Reconnect on disconnect.
- [ ] **C4.** Root model + layout: header (1 row), main split horizontal (sidebar 30 wide, body fill), footer (1 row). Use ultraviolet `layout.Vertical/Horizontal`.
- [ ] **C5.** Sidebar: list of sessions (use `bubbles/list`). Fetch via `GET /v1/sessions`. Show title + status + cost.
- [ ] **C6.** Body main pane: `viewport` with rendered messages. Each message rendered with role-colored header + parts. Auto-scroll on new content.
- [ ] **C7.** Body input pane: `textarea` at the bottom of body, multi-line, Ctrl+Enter (or specific key) to send.
- [ ] **C8.** Footer / status line: shows backend URL, model, session-cost, key hints (`?: help, q: quit`).
- [ ] **C9.** Streaming render: handle `message.created`, `message.part.added`, `message.part.delta`, `message.part.completed`, `message.completed` events. Smoothly append/update the viewport.
- [ ] **C10.** Permission dialog: when `permission.requested` event arrives, pop a modal with summary + Allow/Deny/Allow-Session buttons. Submit via `POST /permissions/{id}`.
- [ ] **C11.** Slash command palette: `/` opens a fuzzy-search list populated from `GET /v1/commands`. Selection executes via `POST /v1/sessions/{id}/commands/{cmd_id}`.
- [ ] **C12.** Help overlay: `?` toggles a help screen with key bindings, generated from a key-map struct.
- [ ] **C13.** Window resize: subscribe to `WindowSizeMsg`, recompute layout, propagate to subcomponents.
- [ ] **C14.** Backend connect screen: on startup, prompt for backend URL (default `http://localhost:7777`); fetch `GET /v1/capabilities`; show error and retry on failure. Hide UI for capabilities not present.
- [ ] **C15.** Settings panel (`/settings` cmd or shortcut): edit current model, current agent, theme.
- [ ] **C16.** File context panel: side-pane showing files in context (editable / read-only). Add/drop via slash commands.
- [ ] **C17.** Diff viewer: when a `file_diff` part arrives, render the unified diff with syntax highlighting (use `notes/` glamour or a manual lipgloss render). Buttons to apply/reject.
- [ ] **C18.** Cost meter: live-updating cost in footer, fed by `cost.updated` events.
- [ ] **C19.** Subagent indication: when `subagent.started` arrives, show a thread/indent in the message stream; subagent's messages render with a visible parent linkage.

## Phase D — TUI tests + visual verification

- [ ] **D1.** Golden test for empty state (no session selected). Use the `tui-test` skill's template.
- [ ] **D2.** Golden test for sessions list populated with 3 sessions.
- [ ] **D3.** Golden test for streaming message in progress (partial text).
- [ ] **D4.** Golden test for permission dialog open.
- [ ] **D5.** Golden test for help overlay.
- [ ] **D6.** **Visual:** screenshot of empty state → `screenshots/01-empty.png`
- [ ] **D7.** **Visual:** screenshot of conversation in progress → `screenshots/02-streaming.png`
- [ ] **D8.** **Visual:** screenshot of permission dialog → `screenshots/03-permission.png`
- [ ] **D9.** **Visual:** screenshot of slash palette open → `screenshots/04-palette.png`
- [ ] **D10.** **Visual:** screenshot of diff viewer → `screenshots/05-diff.png`

## Phase E — Polish & integration

- [ ] **E1.** End-to-end test: emulator + TUI in a single process (TUI talks to localhost emulator). Drive via teatest scripts; assert renders.
- [ ] **E2.** README.md at repo root: how to build, how to run emulator + TUI, screenshot of the working app.
- [ ] **E3.** Theming: pick one cohesive color palette (use lipgloss `LightDark` for adaptive). Apply to all panels.
- [ ] **E4.** Keyboard hint discoverability: every screen shows one hint in the footer of the most relevant action.
- [ ] **E5.** Connection resilience: TUI handles emulator restart gracefully (reconnect SSE, re-fetch capabilities, preserve UI state).
- [ ] **E6.** Empty-state polish: when no sessions, sidebar shows a "No sessions yet — press 'n' to create" message.
- [ ] **E7.** Multi-pane focus: Tab cycles focus through sidebar → message viewport → input. Visual indicator on focused pane.

## Phase F — Stretch (only if Phase A–E complete)

- [ ] **F1.** Real backend adapter for Crush (or OpenCode, whichever is easier).
- [ ] **F2.** Configuration file (`~/.config/gact/config.toml`) for backend URL, theme, default model.
- [ ] **F3.** Session export/import via `gact export <session_id>` / `gact import <file>` CLI subcommands.
- [ ] **F4.** Voice input wiring (call backend `/voice/transcribe`).
- [ ] **F5.** Markdown rendering in messages via glamour.

## Follow-ups (added during build, not yet ordered)

(None yet.)
