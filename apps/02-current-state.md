# 02 — Current State

What already exists in `clio-agent` and `gact-tui` that the web/desktop apps will build on. This is a distillation of `research/clio-agent-surface.md` and `research/gact-tui-architecture.md`; read those for source-cited depth.

## TL;DR

| Layer | State | Notes |
|---|---|---|
| **Wire contract** | Mature | `contract/SPEC.md` v0.2, 1070 lines, full Part/event taxonomy, capability discovery, SSE-first with `Last-Event-ID` resume. |
| **Clio's GACT server** | Implemented, **not in Docker** | `src/clio_agent/gact/app.py` (10,555 lines) exposes ~60 GACT routes on port **8100**. Default bind `127.0.0.1`. |
| **Clio's Dockerfile** | Runs the **wrong** server | Entry is `uvicorn clio_agent.ui.api:app --port 8000` (the legacy 4-route REST API), not `clio-agent-gact`. |
| **Clio's persistence** | Partially mounted | `clio-data:/app/.clio_agent` (ARC memory) is mounted; `~/.config/clio-agent/` (sessions, messages, workspaces, agents, prompts) is **not** — wiped on container recreation. |
| **Auth** | `trust_socket` only | The contract reserves `bearer`; the Python server doesn't implement it. Trust model assumes localhost bind. |
| **Conformance suite** | Yes | `contract/conformance/conformance.go` — runnable Go test harness any backend can self-run. |
| **TUI reference impl** | Mature | `tui/internal/ui/app.go` (~9400 lines), Bubbletea/v2, all UX patterns documented in `research/gact-tui-architecture.md`. |
| **Adapters as proof-of-portability** | Yes (5) | `claudecode`, `claude-agent-sdk-server`, `crush`, `goose`, `opencode`. Each ~400–1500 LOC, each passes conformance, each follows the three-file `server.go`/`transport.go`/`translate.go` shape. |
| **Emulator** | Yes | `emulator/` — Go HTTP server, full GACT v0.2 native impl, scriptable scenarios, ~50ms boot, no API keys. The TUI develops against it first, CLIO catches up. |

## What this means for the apps

### Two surfaces, one wire

Clio currently exposes two distinct HTTP servers. Future clients should target **only the GACT v0.2 surface**:

| Server | Path | Port | Routes | Streaming | Where the Dockerfile points |
|---|---|---|---|---|---|
| Legacy `clio-agent-api` | `src/clio_agent/ui/api.py` | 8000 | 4 (`/health`, `/query`, `/experts`, `/metrics`) | Batch-after-completion SSE with `synthetic_posthoc: True` | ✔ (this is the current entrypoint) |
| GACT v0.2 `clio-agent-gact` | `src/clio_agent/gact/app.py` | 8100 | ~60 | Live per-token SSE | ✘ (not exposed in `docker-compose.yml`) |

The legacy API is not richer or more compatible — it's a strict subset that the contract obsoletes. The two surfaces don't share session state (legacy `session_id` is just an ARC namespace key; GACT `Session` is an explicit `SessionStore` record). Web/desktop clients ignore the legacy surface entirely.

### What the GACT contract gives the client for free

From `contract/SPEC.md` and the conformance suite, a GACT-conformant client gets:

- **Capability discovery.** One `GET /v1/capabilities` call returns:
  - Backend identity (`name`, `version`, `vendor`, `homepage`).
  - 25+ capability flags (`workspaces`, `sessions`, `subagents`, `mcp`, `diffs`, `permissions`, `providers`, `voice`, `metrics`, `cost_tracking`, `agent_routing` (v0.2), `memory` (v0.2), etc.).
  - Transport flags (`events_sse: true`, `events_websocket: false`).
  - Auth schemes (`["bearer", "trust_socket"]`, with `current`).
  - Vendor extensions (`extensions: [{id, version, docs}]`).
- **A typed wire model.** `Workspace → Session → Message → Part`, with `Part` as a typed union over ~17 types deliberately aligned with Anthropic content blocks and MCP semantics.
- **A canonical streaming turn.** The full lifecycle is spec'd: `session.status_changed → message.created → message.part.added → message.part.delta (×N) → message.part.completed → message.completed → session.status_changed`. Three delta keys to know about: `text_append`, `thinking_append`, `input_json_append`.
- **SSE reconnect semantics.** Standard `Last-Event-ID` header, monotonic event IDs, server-side replay from a bounded log (256 in Python, 1024 in Go emulator). Heartbeats every 15s. `EventSource` callers can't set headers, so the contract calls out `?auth_token=` query for bearer-auth SSE.
- **Permission protocol.** SSE `permission.requested` → `POST /v1/permissions/{id}` with `{action: "allow"|"deny"|"allow_session"|"allow_workspace"}` → SSE `permission.resolved`. Server blocks the worker thread up to 120s pending resolution.
- **Cancellation.** `POST /v1/sessions/{sid}/cancel`. Cooperative + asyncio-level. `executor_work_may_continue: True` flag honestly tells the client an LM call already in flight will still bill tokens.
- **File handling.** Workspace file tree (`/v1/workspaces/{wid}/files`), file read with path-traversal refusal (`/files/read?path=`), repo map with token estimate (`/repo_map`), per-session pinned context (`/sessions/{sid}/context/files`).
- **Diff workflow.** `file_diff` Parts on assistant messages carry unified diff text. `/v1/sessions/{sid}/diffs` lists pending, `/diffs/apply` and `/diffs/reject` resolve. The TUI binds `a`/`r` to these inline.
- **Provider/model switching.** `GET/PUT /v1/providers/lm` reconfigures the global LM. While reconfiguring, `POST /messages` returns 503 with `error: "provider_configuring"` and `recovery_actions: [...]`.
- **MCP server registration.** `POST /v1/mcp/servers` accepts stdio or streamable HTTP transports. **Caveat:** registration is in-memory in clio-agent (`app.state.external_mcp_servers`) and disappears on container restart.
- **Slash commands.** `GET /v1/commands` returns a catalog of built-in + MCP-prompt + user + recipe commands with consistent metadata; `POST /v1/sessions/{sid}/commands/{cmd}` dispatches.

The conformance suite (`contract/conformance/`) covers 30+ section subtests across v0.1 and v0.2. The web/desktop apps don't need their own conformance suite — they need to render whatever a conformant backend emits.

## What's broken or missing in clio-agent that the apps care about

These are blockers, not nice-to-haves. The roadmap (`04-roadmap.md`) puts them in Phase 0. Status updated 2026-05-27 against `develop` at `e00cfd0` — see `research/clio-agent-delta-2026-05.md` for the full delta.

1. **Docker exposes the wrong server. [STILL OPEN]** The Dockerfile's `ENTRYPOINT` is `uvicorn clio_agent.ui.api:app --port 8000`. Should be `clio-agent-gact` (or `uvicorn clio_agent.gact.app:app --host 0.0.0.0 --port 8100`). The healthcheck targets the legacy `/health`, which has a different shape than GACT's `/v1/health`. Either swap the entrypoint or run both servers in the container.
2. **Session state isn't in the volume. [STILL OPEN at deploy layer]** Compose mounts `clio-data:/app/.clio_agent` (ARC memory). It does **not** mount `/root/.config/clio-agent/` (or whatever `$XDG_CONFIG_HOME` resolves to in the container) where `sessions.json`, `messages/<sid>.json`, `workspaces.json`, `agents.json`, `schedules.json`, and `prompts/` live. The May 2026 delta added JSON sidecars (`context_files.json`, `permission_policies.json`) under the same path — they inherit the same volume-mount bug. A container restart with the current compose wipes every session.
3. **No browser-usable auth. [STILL OPEN]** `AuthInfo.schemes = ["trust_socket"]` is the only scheme implemented. Zero progress on the bearer scheme in the May 2026 delta. A web client served at, say, `https://clio.example.com` and pointed at a remote clio-agent has no way to authenticate. The contract reserves `bearer`; clio-agent needs to implement it. Suggested mechanism: a CLI subcommand `clio-agent token issue` writes a token to `~/.config/clio-agent/tokens.json`, and `clio-agent-gact --require-bearer` enforces `Authorization: Bearer ...` (and `?auth_token=` for SSE).
4. **No file upload endpoint. [STILL OPEN]** Clients today must either expose a shared volume or pre-place files where the server can read them. Add `POST /v1/sessions/{sid}/context/files/upload` (multipart) that writes to a per-session sandbox under the workspace and then auto-attaches.
5. **Best-effort cancellation. [unchanged constraint]** Capability flag `x_clio_executor_cancellation: False` is honest. Web/desktop UX should distinguish "cancel" (cooperative; LM call may finish + bill) from "abandon" (drop the session entirely). The TUI doesn't distinguish; the new apps should consider it.
6. **MCP server persistence. [STILL OPEN]** External MCP servers registered through `POST /v1/mcp/servers` live only in `app.state.external_mcp_servers`. The May 2026 delta persisted context_files and permission_policies — not MCP servers. Persist these to disk so the docker container doesn't lose them on restart.
7. **Per-message `ModelRef` rejected. [unchanged constraint]** Today the server refuses `ModelRef` payloads that don't match the active LM (`unsupported_model_ref`, HTTP 501). The "model dropdown in composer" UX must call `PUT /v1/providers/lm` to switch — not pass per-message refs. This is a documented constraint, not a bug; the web UI should match it.

### Resolved or now-implemented (May 2026 delta)

- **Permission policy persistence.** Previously in-memory only. Now flushed to `~/.config/clio-agent/permission_policies.json` atomically. Implementation matches `docs/PERMISSION_POLICY_PERSISTENCE.md`. Still inherits the volume-mount bug (#2 above) at the deploy layer.
- **Context-file persistence.** Per-session pinned context attachments now persist to `context_files.json` and survive backend restart (same volume-mount caveat). The TUI's `o`-key attach workflow now produces durable state.
- **Real undo / rewind endpoints.** `POST /v1/sessions/{sid}/undo` and `/rewind` are now wired; previously the routes existed but were no-ops.
- **Workspace file preview.** `GET /v1/workspaces/{wid}/files/read?path=` now returns `text/plain` directly (previously inconsistent).

### New product concepts the apps must model

The May 2026 delta added three concepts the clients have to render. See `research/clio-agent-delta-2026-05.md` for endpoint-level detail.

- **Ask-user / retry protocol.** `Session.status` gained a new value `waiting_user`. The agent can pause and emit a question (not a permission request — a question). Clients see `session.status_changed { status: "waiting_user" }` + a `question.requested` event with the prompt. They reply via `POST /v1/sessions/{sid}/questions/{qid}` with a free-text answer. Separately, `TurnAttempt` rows now track failed attempts at a turn (LM timeouts, tool errors, etc.) with a retry endpoint. Four new SSE events: `question.requested`, `question.answered`, `turn.attempt.started`, `turn.attempt.completed`. The web client needs a distinct **ask-user modal** (separate visual treatment from the permission modal — see `06-design-language.md`) and a **retry affordance** in the message footer.
- **Context frames.** Per-turn truth ledger of what was actually assembled into the LM call — which files, which prior messages, which prompt template, which agent, which memory entries. New `ContextFrame` Pydantic type; two GET routes (`/v1/sessions/{sid}/context/frames` list + one-by-id); two SSE events (`context.frame.created`, `context.frame.completed`). Useful for debugging "why did the agent do that?" The web client surfaces this as a **context frame inspector** — power-user toggle, not on by default. See `06-design-language.md` for the visual treatment.
- **Expert packs + per-turn agent override.** Markdown-with-frontmatter files (`~/.config/clio-agent/expert_packs/<id>.md` or workspace-relative `.clio/expert_packs/`) surface as `AgentDef(source="expert_pack")` with a `tier`, `parent`, and validation envelope. The new module `src/clio_agent/gact/expert_packs.py` (229 lines) loads them. `POST /v1/sessions/{sid}/messages` now accepts an optional `agent: {id}` field to override the session's default agent for a single turn. Assistant `message.metadata.agent_runtime` carries provenance of which expert pack actually handled the turn. The web client adds an **expert pack catalog browser** (similar shape to MCP servers) and a **per-turn agent picker** in the composer.

### Other May 2026 additions worth knowing about

- **Cross-session memory search.** `GET /v1/memory/search?q=<query>` returns hits across all the user's sessions, not just the current one. Gated on `x_clio_cross_session_memory_search` capability flag. The TUI hasn't rendered this yet; web client has a search bar above the sidebar.
- **Capability gaps matrix.** A new `x_clio_capability_gaps` capability surface — a structured list of `(feature, status, blocker)` rows explaining which capabilities the backend declares but doesn't fully implement. Use this in the doctor view instead of inferring from `501` responses.
- **Context file turn provenance.** Each context file attach now records which turn it was added during. The sidebar's context-files section shows the turn marker.
- **Session context policy.** Per-session policy for what gets auto-injected (recent messages window, file-attach default mode, memory injection cap). Editable via a settings modal — new web surface.
- **Dynamic agent runtime provenance.** When an agent is constructed at runtime (e.g., from an expert pack), the registry preserves a provenance trail. Surfaced in the agent detail view.

## What's already in good shape

- Session/conversation/workspace stores are `threading.Lock`-guarded and JSON-flushed. Concurrent clients are safe.
- The EventBus replays per-session events from a 256-event bounded log. Reconnect just works.
- Multiple SSE subscribers per session are supported (two browser tabs viewing the same running session is fine).
- The bootstrap order is documented and graceful: `GET /v1/capabilities` is cheap and stable from the moment uvicorn binds; `GET /v1/health` returns 503 with `overall_status: "unavailable"` until the agent is constructed; `POST /messages` returns 503 with `error: "agent_not_available"` during construction. Web client handles this with a polling banner.
- Structured errors are everywhere. HTTP 4xx/5xx bodies are `{"detail": {"error": ErrorInfo}}` with a taxonomy tag, message, details, recoverable flag, and optional retry_after_s. The web client renders these as toasts; no string-matching needed.
- The TUI is a complete UX reference. The web/desktop apps don't need to design from scratch — they need to **port** the TUI's affordances to the new substrate, dropping nothing important.

## How the TUI talks to the contract (the pattern the apps will follow)

`tui/internal/ui/app.go:60-365` declares a single `App` struct with ~250 fields (sessions, messages, capabilities, SSE channel + cancel func + backoff state, dozens of `*Open bool` modal flags, per-part cursor indices, paste buffers). The dispatch loop is canonical Bubbletea: pure `Update(msg) (Model, Cmd)`, side-effects only via `tea.Cmd`. Every backend call is wrapped in a `tea.Cmd` (5s timeout for catalog reads, 120s for `POST /messages`).

The web/desktop port doesn't need a 250-field god struct — it has the affordances of a real component tree — but the *information* the god struct holds is the right inventory. Each piece of state in `App` maps to a piece of state in the web app's store:

- Capabilities → `caps` store, used by every feature-gating boundary.
- Sessions list + selected session id → sidebar state.
- Messages for the current session → transcript view model.
- SSE channel + cancel + reconnect backoff → SSE manager singleton.
- Pending permissions → permission queue + modal trigger.
- Detached sessions → persisted to OS keychain (Tauri) or `IndexedDB` (web).
- Modal `*Open bool` flags → per-modal `useStore`/signal.
- Per-part cursor → transcript-level focus state.

The mapping is more or less mechanical. The substantive work is rendering, not state design.
