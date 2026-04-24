# GACT v0.1 — Generic Agentic-Coder TUI Contract

## §1 Goals & Non-Goals

### Goals

- One TUI can drive any conforming agentic-coder backend.
- Every backend feature catalogued in our landscape survey (Crush, OpenCode, Aider, Goose, Gemini CLI) has a place to live in the contract — even if not every backend supports every feature.
- A new backend can be added by writing a thin adapter, not by changing the TUI.
- A new capability can be added by the community without breaking older clients/backends.
- Multi-agent workflows (subagents, recipes) are first-class, not bolted-on.

### Non-Goals

- The contract does **not** specify how the backend implements the agent loop, model calls, prompt construction, or tool execution. Only the wire surface.
- The contract does **not** enforce a particular auth scheme; it allows several.
- The contract is **not** a transport spec. It assumes HTTP/1.1+ with SSE; how that HTTP gets carried (Unix socket, TCP, TLS, etc.) is a deployment concern.

---

## §2 Conventions

- **MUST / SHOULD / MAY** are RFC 2119.
- All paths are prefixed with `/v1/` unless explicitly noted.
- Unless stated otherwise, request and response bodies are `application/json; charset=utf-8`.
- Timestamps are RFC 3339 strings (e.g. `2026-04-17T18:30:00Z`) unless documented as Unix-epoch milliseconds (then noted explicitly).
- IDs are opaque strings. Recommended (not required): UUIDv7 or ULID.
- All resource collections are paginated unless small and fixed (e.g. `/v1/capabilities`).
- All endpoints accepting JSON bodies MUST also accept and ignore unknown fields (forward compatibility).
- All discriminated unions (parts, events, etc.) MUST be extensible: a `type` value not recognized by the client SHOULD be preserved and rendered as a generic placeholder, NEVER cause a parse failure.

---

## §3 Capability Discovery & Versioning

### 3.1 Why this comes first

The contract is large. No backend will implement every part of it. The TUI must learn what's available before it tries to render anything that depends on it.

### 3.2 Versioning

- **Major version in URL path**: `/v1/`. Breaking changes bump to `/v2/`. Backends MAY implement multiple major versions side-by-side.
- **Minor versions are additive**: new optional endpoints, new optional fields, new optional event types, new optional part types — these do NOT bump the major version. Clients MUST tolerate them.
- The contract version is reported by `GET /v1/capabilities` (see below).

#### 3.2.1 v0.2 additions (CLIO-aligned)

v0.2 extends v0.1 additively — no existing field, event, part type, or endpoint changes shape. The additions stay at the platform level: they describe generic agentic-coder primitives (multi-tier agent routing, memory introspection, integration health, typed errors, per-tool telemetry) rather than any backend's specific vocabulary. A backend MAY materialise these primitives as concrete domain agents (e.g. a "DataExpert" for HDF5 work, a "CodeReviewer" for PR review) — the spec stays neutral on what those domains are.

New additions:

- §3.3 new capability flags: `agent_routing`, `memory`, `structured_errors`, `integration_health`, `tool_telemetry`.
- §3.4 new optional `integrations[]` field in the health response.
- §4.3.1 new fields on the existing `AgentDef` (§6.5): `tier`, `specialization`, `keywords`. Plus a new concept: **multi-tier agents** (Tier-1 orchestrator → Tier-2 specialists → Tier-3 ephemeral subsessions).
- §4.5 new part type: `routing_decision`. Extended fields on `tool_result` (`cached`, `duration_ms`) and on `message` (`error_info`).
- §6.19 new endpoint: `GET /v1/memory/stats`.
- §7.3 new events: `session.agent_routed`, `memory.cache.updated`, `integration.status_changed`.
- §14 new section: **Error Taxonomy**.

v0.2 does NOT deprecate anything in v0.1. A v0.1 client talking to a v0.2 backend works unchanged (it ignores new capability flags, new fields, new events). A v0.2 client talking to a v0.1 backend reads `capabilities.agent_routing == false` etc. and disables the related UI affordances.

**Gold-standard clause**: v0.2 is drafted so that **every** primitive a modern agentic-coder exposes natively has a place on the wire. The first reference backend is `clio-agent-gact` (iowarp/clio-agent, `tui-integration` branch) — any v0.2 primitive CLIO implements is by definition *supported*. Any v0.1 primitive CLIO doesn't yet implement is declared `unsupported` in its capabilities response and tracked as a native CLIO capability request (framed around CLIO's own mission, not "TUI-integration ask") until it lands.

### 3.3 `GET /v1/capabilities`

Returns what THIS backend supports. The TUI calls this on startup and uses it to enable/disable UI features.

```json
{
  "contract_version": "0.2",
  "backend": {
    "name": "string",                 // e.g. "clio" / "crush" / "claudecode"
    "version": "string",              // e.g. "0.2.0"
    "vendor": "string",               // e.g. "iowarp" / "charmbracelet"
    "homepage": "https://..."         // optional
  },
  "capabilities": {
    "workspaces": true,               // §4.1
    "sessions": true,                 // §4.2
    "subagents": true,                // §4.3
    "mcp": true,                      // §6.7
    "lsp": false,                     // §6.8 (optional)
    "files": true,                    // §6.9
    "diffs": true,                    // §6.10
    "permissions": true,              // §6.11
    "providers": true,                // §6.12
    "commands": true,                 // §6.13
    "voice": false,                   // §6.14 (optional)
    "scheduled_sessions": false,      // §6.15 (optional)
    "metrics": true,                  // §6.16 — GET /v1/metrics
    "session_branching": true,        // fork support
    "session_sharing": false,
    "session_export": true,
    "cost_tracking": true,
    "thinking_blocks": true,          // extended thinking content blocks
    "edit_modes": false,              // Aider-style multi-mode (architect/diff/whole)
    "plan_mode": false,               // Gemini-style read-only plan mode
    "search_messages": true,          // §6.3 — full-text search across messages
    "agent_write": false,             // §6.5 — POST/PUT/DELETE on /v1/agents
    "skills_extraction": false,       // §6.5 — POST /v1/agents/extract

    // v0.2 — generic additions for modern agentic-coder backends
    "agent_routing": true,            // §4.3.1 — multi-tier agents + routing decisions
    "memory": true,                   // §6.19 — /v1/memory/stats introspection
    "structured_errors": true,        // §14 — typed error_info taxonomy
    "integration_health": true,       // §3.4 — /v1/health `integrations[]` array
    "tool_telemetry": true            // §4.5 + §7.3 — tool_result.cached + duration_ms
  },
  "transports": {
    "events_sse": true,               // §7
    "events_websocket": false         // optional, future
  },
  "auth": {
    "schemes": ["bearer", "trust_socket"],   // §5
    "current": "trust_socket"                // active scheme
  },
  "extensions": [
    { "id": "x-charm-pubsub", "version": "1", "docs": "https://..." }
  ]
}
```

A capability set to `false` (or absent) means the corresponding endpoints MUST return `404 Not Found` or `501 Not Implemented`. The TUI MUST hide UI affordances tied to that capability.

### 3.4 `GET /v1/health`

Returns 200 with `{"healthy": true, "uptime_s": <int>}` if the backend can serve requests. Used for connection probing.

**v0.2 extension** (`capabilities.integration_health == true`): the response MAY include an `integrations` array and a coarse `overall_status` field:

```json
{
  "healthy": true,
  "uptime_s": 1234,
  "overall_status": "ready",              // "ready" | "degraded" | "unavailable"
  "integrations": [
    {"name": "lm",         "status": "ready",       "detail": "openai/gpt-4o-mini ready"},
    {"name": "gateway",    "status": "ready",       "detail": "5 tools mounted"},
    {"name": "arc",        "status": "ready",       "detail": "cache 87% hit rate"},
    {"name": "file_policy","status": "ready",       "detail": "CLIO_ALLOWED_ROOTS: /tmp, /home/..."},
    {"name": "clio_core",  "status": "unavailable", "detail": "iowarp binary not found"}
  ]
}
```

Integrations are backend-specific — a backend MAY expose any combination of names the TUI can display tabularly. Common names: `lm` (model provider), `gateway` (tool gateway), `arc` (memory backend), `file_policy` (path whitelist), `api` (HTTP surface), `clio_core` (IOWarp integration). Unknown names MUST render as a generic row without special handling.

`overall_status` is the worst status across integrations (ready if all ready; degraded if any degraded and none unavailable; unavailable if any unavailable). Used by the TUI to colour a single top-level health chip.

---

## §4 Data Model

### 4.1 Workspace

A **Workspace** is a project root + its associated configuration. It is the parent of sessions.

```json
{
  "id": "ws_...",
  "name": "string",                  // human-readable, defaults to basename of root_path
  "root_path": "/abs/path/to/project",
  "created_at": "...",
  "updated_at": "...",
  "config": {                        // backend-defined; see §6.12 for provider/model config
    "default_provider": "anthropic",
    "default_model": "claude-opus-4-7",
    "...": "..."
  },
  "metadata": {                      // open-ended
    "vcs": { "branch": "main", "dirty": false }
  }
}
```

Backends without true multi-workspace support (Aider-style: one process = one project) MAY expose a single implicit workspace `ws_default` and reject creation/deletion attempts with `409 Conflict`.

### 4.2 Session

A **Session** is a conversation thread within a workspace.

```json
{
  "id": "sess_...",
  "workspace_id": "ws_...",
  "parent_session_id": null,         // for forks/branches
  "title": "string",
  "summary": "string|null",          // auto-generated short blurb
  "created_at": "...",
  "updated_at": "...",
  "archived_at": "...|null",
  "message_count": 12,
  "tokens": {
    "input": 12500,
    "output": 8400,
    "cache_read": 0,
    "cache_write": 0
  },
  "cost_usd": 0.42,
  "model": {
    "provider_id": "anthropic",
    "model_id": "claude-opus-4-7",
    "variant": null
  },
  "agent": {
    "id": "default",                 // which agent persona/recipe is active
    "mode": "code"                   // active edit-mode if backend exposes it (Aider-style)
  },
  "status": "idle",                  // "idle" | "running" | "waiting_permission" | "error"
  "metadata": {}                     // backend-specific, open-ended
}
```

Forks: `POST /v1/sessions/{id}/fork` with `{at_message_id?: string, title?: string}` returns a new session with `parent_session_id` set.

### 4.3 SubSession (Subagent invocation)

A **SubSession** is a child agent invocation spawned by a parent session, e.g. via Goose's recipes, Gemini's subagents, or Claude SDK's Task tool. It is its OWN session (own messages, own status, own cost) but is logically nested inside its parent.

```json
{
  "id": "sess_...",
  "workspace_id": "ws_...",
  "parent_session_id": "sess_parent",   // REQUIRED for subsessions
  "spawned_by_message_id": "msg_xyz",   // the parent message containing the subagent invocation
  "spawned_by_part_id": "part_...",     // the specific part (typically a `subagent_call` part)
  "agent": {
    "id": "code_reviewer",              // the subagent definition/recipe
    "mode": null
  },
  "...": "...other Session fields..."
}
```

Subsessions appear in `GET /v1/sessions?parent_session_id=sess_parent` AND are referenced by `subagent_call` parts in the parent's message stream (§4.5). The TUI is expected to render them inline (collapsible thread under the parent message) OR as a separate pane — implementation choice.

### 4.3.1 Multi-tier agents (v0.2)

v0.1 described agents as a flat catalog (§6.5 `AgentDef`). v0.2 adds a **tier** dimension to the same `AgentDef`, letting backends that route user queries through multiple specialised agents advertise the hierarchy on the wire.

Tier definitions:

| Tier | Role | Lifetime | Count per backend |
|---|---|---|---|
| 1 | Orchestrator — parses the query and selects which tier-2 agent to dispatch | Long-lived | Typically 1 |
| 2 | Specialist — handles a class of queries (one domain, one capability family) with a curated tool set | Long-lived | N (0..many) |
| 3 | Ephemeral worker — spawned per turn via `subagent_call` (§4.5), maps to a SubSession (§4.3) | Per-turn | Unlimited |

A backend without tiered routing (single agent per backend — most v0.1 adapters) sets `capabilities.agent_routing = false`. The catalog then contains only tier-1 (or untagged) `AgentDef` rows and the TUI skips per-turn routing-badge rendering.

Extended `AgentDef` shape (all new fields optional; see §6.5 for the base shape):

```json
{
  "id": "code_expert",
  "source": "builtin",
  "title": "Code Expert",
  "description": "Source-level editing, review, refactoring",
  "tools": ["edit_file", "read_file", "grep", "..."],

  // v0.2 additions (all optional; absent = tier-1 or untagged):
  "tier": 2,
  "specialization": "code_editing",       // free-form domain tag — UI palette hints
  "keywords": ["edit", "refactor", "fix", "review"],
  "metadata": {}
}
```

`specialization` is a short free-form identifier (e.g. `code_editing`, `data_analysis`, `research`, `visualization`) that the TUI MAY use to colour the per-turn agent badge from a palette. Unknown specialisations render with a default accent — it's a hint, not a taxonomy the TUI needs to know exhaustively.

`keywords` are the intent tokens the tier-1 orchestrator matches against. Exposed so the TUI can show *why* a given agent was picked (heuristic routing) or render a searchable agent picker.

Backends with `agent_routing = true` MUST emit a `routing_decision` part (§4.5) as the first part of every assistant message AND a `session.agent_routed` event (§7.3) at the same moment. The decision references `AgentDef.id`.

Discovery: `GET /v1/agents?tier=2` lists tier-2 specialists; the base `/v1/agents` query returns all tiers.

### 4.4 Message

A **Message** is a turn in a session, owned by a role.

```json
{
  "id": "msg_...",
  "session_id": "sess_...",
  "role": "user" | "assistant" | "system" | "tool",
  // System messages live in the message stream like any other. Backends
  // that store the system prompt only in session config simply never emit
  // role:"system" messages. Clients can hide them via ?include_system=false
  // on GET /sessions/{id}/messages.
  "created_at": "...",
  "updated_at": "...",
  "model": { "provider_id": "...", "model_id": "..." },     // null for user/system
  "tokens": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0 },
  "cost_usd": 0.0,
  "stop_reason": "end_turn|tool_use|max_tokens|cancelled|error|permission_denied|null",
  "parts": [ /* Part[]; see §4.5 */ ],
  "error_info": null,                                      // v0.2 — see §14
  "metadata": {}
}
```

While streaming, a message's `parts` array grows; clients MUST accept partial messages and update them via SSE deltas (§7.4).

**v0.2 `error_info`**: when `stop_reason` is `"error"` or a degraded success with trailing failure context, backends with `capabilities.structured_errors = true` MUST set `error_info` to a typed error envelope per §14. v0.1 backends leave the field null and emit `error` parts in the content stream instead — both paths remain valid.

### 4.5 Part (Content Block)

The content of a message is an ordered list of typed parts. The discriminator is `type`. Every part has an `id` (stable for the lifetime of the message), `type`, and optional `metadata`.

**Core part types** (every conforming backend MUST handle these in messages it produces, but MAY return only a subset depending on what the backend supports):

| `type` | Purpose | Key fields |
|---|---|---|
| `text` | Plain text | `text: string` |
| `thinking` | Extended reasoning | `thinking: string`, `signature?: string` (opaque, round-tripped) |
| `redacted_thinking` | Encrypted reasoning | `data: string`, `signature?: string` |
| `image` | Image content | `source: {kind: "base64"\|"url"\|"file_id", media_type, data?, url?, file_id?}` |
| `document` | Document content | `source: {...same}`, `title?`, `context?`, `citations?: {enabled: bool}` |
| `tool_call` | Model invokes a tool | `call_id: string`, `tool_name: string`, `input: object`, `server_id?: string` (for MCP), `annotations?: {readOnlyHint, destructiveHint, idempotentHint, openWorldHint, title}` |
| `tool_result` | Result of a tool | `call_id: string`, `content: Part[]` (recursive — text, image, resource, etc.), `is_error: bool`, **v0.2 optional**: `cached: bool` (result came from a memory cache hit, not fresh execution), `duration_ms: number` (wall-clock) |
| `routing_decision` (v0.2) | Tier-1 orchestrator picked a tier-2 agent for this turn | `selected_agent: string` (matches `AgentDef.id` at §6.5 / `/v1/agents`), `rationale?: string`, `confidence?: number` (0..1), `heuristic: bool` (true = picked by deterministic keyword match; false = picked by LM router). Emitted as the first part of the assistant message when `capabilities.agent_routing` is true. |
| `subagent_call` | Spawn a subagent | `subsession_id: string`, `agent_id: string`, `prompt: string`, `params?: object` |
| `subagent_result` | Subagent terminal result | `subsession_id: string`, `summary: string`, `final_message_id: string` |
| `resource_link` | MCP resource reference | `server_id: string`, `uri: string`, `name?, description?, mime_type?, annotations?` |
| `resource` | Embedded MCP resource | `server_id: string`, `uri: string`, `mime_type: string`, `text?: string`, `data?: string` (base64) |
| `file_diff` | Proposed file change | `path: string`, `before: string|null`, `after: string|null`, `language?: string`, `applied: bool` |
| `citation` | Source attribution | `text_range: {start, end}`, `source: {type: "document"\|"web"\|"resource", reference: string, location: object}` |
| `error` | In-stream error | `code: string`, `message: string`, `recoverable: bool` |
| `compaction` | Marks where prior history was summarized away | `summary: string`, `compacted_message_ids: string[]`, `auto: bool` (true if backend-triggered, false if user-triggered) |

**Streaming deltas** for parts are sent via SSE events (§7.4).

**Forward-compat rule**: a client encountering an unknown `type` MUST preserve the part (so it survives round-trips through the backend) and SHOULD render a placeholder showing the type name. This enables vendors and the community to add part types without coordinating client upgrades.

### 4.6 Tool

A **Tool** is something the agent can call. Tools come from three sources: built-in (backend-defined), MCP (per server), and skills/recipes (named subagents).

```json
{
  "id": "...",                       // unique within source
  "source": "builtin|mcp|recipe|extension",
  "server_id": "string|null",        // MCP server, if source=mcp
  "name": "edit_file",
  "title": "Edit File",
  "description": "Modify a file in place",
  "input_schema": { /* JSON Schema */ },
  "output_schema": { /* JSON Schema, optional */ },
  "annotations": {                   // MCP-aligned hints
    "title": "...",
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": false,
    "openWorldHint": false
  },
  "permission_default": "ask"        // "allow" | "ask" | "deny" — backend's current policy for this tool
}
```

### 4.7 PermissionRequest

```json
{
  "id": "perm_...",
  "session_id": "sess_...",
  "subsession_id": "sess_...|null",
  "tool_call": {
    "call_id": "string",
    "tool_name": "string",
    "server_id": "string|null",
    "input": {},
    "annotations": {}
  },
  "summary": "string",               // human-readable preview ("Run: rm -rf /tmp/x")
  "created_at": "..."
}
```

Replied to via `POST /v1/permissions/{id}` with body `{"action": "allow"|"deny"|"allow_session"|"allow_workspace"}`.

---

## §5 Authentication

Backends MUST support at least one of:

- **`trust_socket`**: connections accepted only over Unix socket / named pipe; identity is implicit (current user). No header required.
- **`bearer`**: `Authorization: Bearer <token>` header. Token configured out-of-band.

Backends MAY support additional schemes (basic, OAuth, mTLS) and report them in `capabilities.auth.schemes`.

The active scheme is reported as `capabilities.auth.current`. The TUI uses this to decide whether to prompt for credentials at startup.

For SSE streams, the bearer token MAY also be passed as a query parameter `?auth_token=...` since some browsers do not allow custom headers on `EventSource`. Backends supporting bearer auth MUST also accept `?auth_token=...`.

---

## §6 Endpoints

Notation: `METHOD /path` followed by request body schema (if any) and response schema. Error responses follow §6.0.

### §6.0 Error format

All errors return:

```json
{
  "error": {
    "code": "string",                // machine-readable, e.g. "session_not_found"
    "message": "string",             // human-readable
    "details": {}                    // optional, error-specific
  }
}
```

Status codes follow standard HTTP conventions: 400 validation, 401 auth, 403 permission, 404 not-found, 409 conflict, 422 invalid state, 429 rate limit, 500 internal, 501 not implemented.

### §6.1 Workspaces

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/workspaces` | — | `{workspaces: Workspace[], next_cursor?: string}` |
| POST | `/v1/workspaces` | `{root_path, name?, config?}` | `Workspace` |
| GET | `/v1/workspaces/{id}` | — | `Workspace` |
| PATCH | `/v1/workspaces/{id}` | partial `Workspace` | `Workspace` |
| DELETE | `/v1/workspaces/{id}` | — | `204` |

### §6.2 Sessions

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions` | query: `workspace_id?, parent_session_id?, archived?, limit?, before?` | `{sessions: Session[], next_cursor?}` |
| POST | `/v1/sessions` | `{workspace_id, title?, agent?, model?, parent_session_id?, fork_at_message_id?}` | `Session` |
| GET | `/v1/sessions/{id}` | — | `Session` |
| PATCH | `/v1/sessions/{id}` | `{title?, archived?, agent?, model?}` | `Session` |
| DELETE | `/v1/sessions/{id}` | — | `204` |
| POST | `/v1/sessions/{id}/fork` | `{at_message_id?, title?}` | `Session` (new) |
| POST | `/v1/sessions/{id}/cancel` | — | `204` (cancels in-flight run) |
| POST | `/v1/sessions/{id}/summarize` | `{auto?: bool, instructions?: string}` | `204` (triggers async summarization; result via events). MMM6: `instructions` is a free-form prompt the backend SHOULD pass to its summarizer (e.g. "tldr in 5 sentences", "extract action items only"). |
| GET | `/v1/sessions/{id}/export` | — | `application/json` blob (full session w/ messages) |
| POST | `/v1/sessions/import` | session blob | `Session` |

### §6.3 Messages

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/messages` | query: `before?, limit?, include_system?: bool` (cursor pagination, newest-first) | `{messages: Message[], next_cursor?}` |
| GET | `/v1/sessions/{id}/messages/{msg_id}` | — | `Message` |
| POST | `/v1/sessions/{id}/messages` | `{parts: Part[], model?: ModelRef}` | `{message_id: string, accepted_at: "..."}`, `202` |
| DELETE | `/v1/sessions/{id}/messages/{msg_id}` | — | `204` |
| PATCH | `/v1/sessions/{id}/messages/{msg_id}/parts/{part_id}` | partial part | updated `Part` |
| GET | `/v1/sessions/{id}/messages/search` | query: `q, limit?, before?` | `{matches: SearchMatch[], next_cursor?}` (gated by `capabilities.search_messages`) |

```json
// SearchMatch
{
  "message_id": "msg_...",
  "part_id": "part_...",
  "snippet": "...{q}... with surrounding context",
  "score": 0.87,
  "created_at": "..."
}
```

`POST /messages` returns 202 immediately. The actual streaming response (assistant message being produced) is delivered via SSE on the events channel (§7). This is the Crush pattern.

### §6.4 Subsessions

Subsessions are sessions, so all of §6.2/§6.3 applies. The relationship is captured by `parent_session_id` on the subsession AND by the `subagent_call` / `subagent_result` parts in the parent.

A backend that does NOT support subagents reports `capabilities.subagents = false` and rejects subsession creation with `501`. The TUI hides any UI for spawning subagents.

### §6.5 Agents (definitions)

Lists the agent personas / recipes the backend can spawn. Reads always work; writes are gated by `capabilities.agent_write`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/agents` | query: `workspace_id?, source?` | `{agents: AgentDef[]}` |
| GET | `/v1/agents/{id}` | — | `AgentDef` |
| POST | `/v1/agents` | `AgentDef` (without `id`) | `AgentDef` (with assigned id) |
| PUT | `/v1/agents/{id}` | `AgentDef` (id MUST match path) | `AgentDef` |
| DELETE | `/v1/agents/{id}` | — | `204` |
| POST | `/v1/agents/extract` | `{session_id, name?, description?}` | `AgentDef` (gated by `capabilities.skills_extraction`) |

```json
// AgentDef
{
  "id": "code_reviewer",
  "source": "builtin" | "user" | "recipe" | "skill",
  "title": "Code Reviewer",
  "description": "Reviews diffs for issues",
  "system_prompt": "string|null",    // backend MAY redact for builtin agents
  "parameters": [{ "name": "...", "type": "string|number|select|multiline", "required": bool, "description": "...", "options?: string[]" }],
  "default_model": { "provider_id": "...", "model_id": "..." },
  "tools": ["..."],                  // tool ids the agent has access to
  "metadata": {}
}
```

`source` distinguishes:
- `builtin`: shipped with the backend, usually read-only.
- `user`: created via the write API by the end user.
- `recipe`: loaded from a recipe file (Goose-style), may live on disk.
- `skill`: extracted from past sessions (Gemini-style automated derivation).

The extraction endpoint analyzes a completed session and synthesizes a reusable agent definition. Backends that don't implement this report `capabilities.skills_extraction = false` and return `501`.

### §6.6 Tools

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/tools` | query: `workspace_id?, source?` | `{tools: Tool[]}` |
| GET | `/v1/tools/{id}` | — | `Tool` |

### §6.7 MCP

If `capabilities.mcp = true`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/mcp/servers` | query: `workspace_id?` | `{servers: McpServer[]}` |
| GET | `/v1/mcp/servers/{id}` | — | `McpServer` |
| POST | `/v1/mcp/servers/{id}/reconnect` | — | `204` |
| GET | `/v1/mcp/servers/{id}/tools` | — | `{tools: Tool[]}` |
| GET | `/v1/mcp/servers/{id}/resources` | — | `{resources: McpResource[]}` |
| GET | `/v1/mcp/servers/{id}/resource_templates` | — | `{templates: McpResourceTemplate[]}` |
| POST | `/v1/mcp/servers/{id}/resources/read` | `{uri}` | `{contents: McpContent[]}` |
| POST | `/v1/mcp/servers/{id}/resources/subscribe` | `{uri}` | `204` |
| DELETE | `/v1/mcp/servers/{id}/resources/subscribe` | `{uri}` | `204` |
| GET | `/v1/mcp/servers/{id}/prompts` | — | `{prompts: McpPrompt[]}` |
| POST | `/v1/mcp/servers/{id}/prompts/get` | `{name, arguments}` | `{description?, messages: McpMessage[]}` |

`McpServer` includes lifecycle metadata (status, declared capabilities, instructions). `McpResource`/`McpPrompt` mirror the MCP spec shapes.

The TUI uses `/mcp/prompts` to populate slash-command palettes; calling `/prompts/get` produces a draft message the user submits.

### §6.8 LSP (optional)

If `capabilities.lsp = true`:

| Method | Path | Response |
|---|---|---|
| GET | `/v1/lsp/clients` | `{clients: LspClient[]}` |
| GET | `/v1/lsp/clients/{name}/diagnostics` | `{diagnostics: ...}` |

Otherwise omit; TUI hides LSP UI.

### §6.9 Files & Context

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/context/files` | — | `{files: ContextFile[]}` |
| POST | `/v1/sessions/{id}/context/files` | `{path, mode: "edit"\|"read"\|"pin"}` | `ContextFile` |
| DELETE | `/v1/sessions/{id}/context/files` | `{path}` | `204` |
| PATCH | `/v1/sessions/{id}/context/files` | `{path, mode}` | `ContextFile` |
| GET | `/v1/workspaces/{id}/files` | query: `path?, glob?, max_depth?` | `{entries: FileEntry[]}` |
| GET | `/v1/workspaces/{id}/files/read` | query: `path` | `application/octet-stream` (file content) |
| GET | `/v1/workspaces/{id}/repo_map` | query: `max_tokens?, focus_path?` | `{tree: RepoMapNode, tokens: int}` |

`ContextFile` = `{path, mode, added_at, last_modified, size, language?}`. `RepoMapNode` is recursive (file or directory) with per-node code outline (function/class names) where backend supports tree-sitter.

### §6.10 Diffs

| Method | Path | Response |
|---|---|---|
| GET | `/v1/sessions/{id}/diffs` | `{diffs: FileDiff[]}` (proposed-but-not-applied) |
| GET | `/v1/sessions/{id}/messages/{msg_id}/diffs` | `{diffs: FileDiff[]}` (per-message) |
| POST | `/v1/sessions/{id}/diffs/apply` | `{paths?: string[]}` | `{applied: string[]}` |
| POST | `/v1/sessions/{id}/diffs/reject` | `{paths?: string[]}` | `{rejected: string[]}` |
| POST | `/v1/sessions/{id}/undo` | `{count?: int}` | `{reverted_messages: string[]}` |
| POST | `/v1/sessions/{id}/rewind` | `{to_message_id: string, include_target?: bool}` | `{deleted_messages: string[]}` (MMM7) |

`/rewind` deletes every message after `to_message_id` in the named session. With `include_target=true`, it also deletes that message itself. Different from `/undo` (which counts backward from the tail) — useful when the user has scrolled and wants to fork off a known checkpoint.

### §6.11 Permissions

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/permissions` | query: `session_id?, status=pending\|all` | `{permissions: PermissionRequest[]}` |
| GET | `/v1/permissions/{id}` | — | `PermissionRequest` |
| POST | `/v1/permissions/{id}` | `{action: "allow"\|"deny"\|"allow_session"\|"allow_workspace"}` | `204` |
| GET | `/v1/policies` | query: `workspace_id?` | `{policies: Policy[]}` |
| PUT | `/v1/policies` | `{policies: Policy[]}` | `{policies: Policy[]}` |

Backends MAY implement policies as simple per-tool toggles, or as rich rule engines (Gemini-style TOML with folder trust + shell safety). The contract specifies the data shape, not the evaluator.

```json
// Policy
{
  "scope": "workspace|session",
  "scope_id": "...",
  "tool_name_pattern": "shell|edit|*",
  "path_pattern": "/src/**|*",
  "action": "allow|deny|ask",
  "annotations_filter": { "destructiveHint": false }   // optional, applies only to matching annotations
}
```

### §6.12 Providers & Models

| Method | Path | Response |
|---|---|---|
| GET | `/v1/providers` | `{providers: Provider[]}` |
| GET | `/v1/providers/{id}` | `Provider` |
| GET | `/v1/providers/{id}/models` | `{models: Model[]}` |
| POST | `/v1/providers/{id}/auth` | provider-specific OAuth/API-key flow init | `{redirect_url?, ...}` |

```json
// Provider
{
  "id": "anthropic",
  "name": "Anthropic",
  "auth_methods": ["api_key", "oauth"],
  "is_authenticated": true,
  "default_model": "claude-opus-4-7",
  "metadata": {}
}

// Model
{
  "id": "claude-opus-4-7",
  "name": "Claude Opus 4.7",
  "context_window": 200000,
  "max_output_tokens": 8192,
  "supports": {
    "tools": true,
    "vision": true,
    "thinking": true,
    "computer_use": false,
    "prompt_caching": true
  },
  "pricing": { "input_per_mtok": 15.00, "output_per_mtok": 75.00, "cache_read_per_mtok": 1.50, "cache_write_per_mtok": 18.75 }
}
```

### §6.13 Commands (slash-commands)

The catalog of invocable commands: built-in, MCP prompts, user-defined, and recipes. The TUI renders this as a slash-command palette.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/commands` | query: `workspace_id?` | `{commands: Command[]}` |
| POST | `/v1/sessions/{id}/commands/{cmd_id}` | `{arguments: object}` | `204` (effects flow via SSE) |

```json
// Command
{
  "id": "/add",
  "title": "Add file to context",
  "description": "...",
  "source": "builtin|mcp_prompt|recipe|user",
  "server_id": "...|null",                   // for MCP prompts
  "arguments": [{ "name", "type", "required", "description" }],
  "shortcut": "ctrl+a"                       // optional keyboard hint
}
```

### §6.14 Voice (optional)

If `capabilities.voice = true`:

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/sessions/{id}/voice/transcribe` | `audio/*` (multipart) | `{text: string, duration_ms: int}` |
| POST | `/v1/sessions/{id}/voice/synthesize` | `{text}` | `audio/*` (stream) |

### §6.15 Scheduled sessions (optional)

If `capabilities.scheduled_sessions = true`: see EXTENSIONS.md (TBD). Not normative in v0.1.

### §6.16 Metrics (optional)

If `capabilities.metrics = true`:

| Method | Path | Response |
|---|---|---|
| GET | `/v1/metrics` | `Metrics` |

```json
// Metrics
{
  "uptime_s": 12345,
  "sessions": {
    "total": 42,
    "active": 3,
    "by_status": { "idle": 39, "running": 2, "waiting_permission": 1, "error": 0 }
  },
  "messages": {
    "total": 1287,
    "by_role": { "user": 612, "assistant": 612, "system": 42, "tool": 21 }
  },
  "tokens": {
    "input_total": 4_812_300,
    "output_total": 1_220_800,
    "cache_read_total": 901_220,
    "cache_write_total": 117_440
  },
  "cost": {
    "total_usd": 12.84,
    "by_provider": { "anthropic": 11.20, "openai": 1.64 }
  }
}
```

Metrics are point-in-time snapshots. Backends MAY add custom counters under a vendor-prefixed key (`x_<vendor>_<counter>`).

### §6.18 Session tasks (optional)

If `capabilities.session_tasks = true`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/tasks` |  | `{tasks: [SessionTask]}` |
| POST | `/v1/sessions/{id}/tasks` | `{title, status?, metadata?}` | `SessionTask` |
| PATCH | `/v1/tasks/{id}` | `{title?, status?, metadata?}` | `SessionTask` |
| DELETE | `/v1/tasks/{id}` |  | 204 |

```json
// SessionTask
{
  "id": "tsk_01H...",
  "session_id": "sess_...",
  "title": "Run unit tests",
  "status": "pending",       // "pending" | "running" | "completed" | "failed"
  "created_at": "...",
  "updated_at": "...",
  "metadata": {}             // optional vendor extension bucket
}
```

Tasks are first-class state for backends that fan out subagents or
plan multi-step work. They show up in the TUI sidebar/footer and can
be enumerated by shell scripts via `gact tasks`. Status transitions
are advisory — the contract doesn't validate (e.g. `running →
pending` is legal).

### §6.17 Hooks (optional)

If `capabilities.hooks = true`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/hooks` |  | `{hooks: [Hook]}` |
| POST | `/v1/hooks` | `Hook` (no `id`) | `Hook` (with `id`) |
| DELETE | `/v1/hooks/{id}` |  | 204 |

```json
// Hook
{
  "id": "hk_01H...",
  "event": "tool.call.completed",  // any §7.3 event type, or "*"
  "command": "/usr/local/bin/notify-hook.sh",  // exec'd with event JSON on stdin
  "url": null,                                  // alternative: POST event JSON here
  "session_id": null,                           // optional scope
  "workspace_id": null                          // optional scope
}
```

A hook fires whenever an event matching `event` is published; if both `command` and `url` are set, `url` wins. The backend MUST run hooks asynchronously (no back-pressure on the main loop) and SHOULD time them out at 10s. Failures are logged but never propagated to the originating request. Hooks scoped to `session_id` or `workspace_id` only fire on events for that scope.

### §6.19 Memory stats (v0.2, optional)

If `capabilities.memory = true`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/memory/stats` | query: `session_id?` | `MemoryStats` |

```json
// MemoryStats
{
  "cache": {
    "hits": 1284,
    "misses": 192,
    "hit_rate": 0.87,                    // [0..1]
    "capacity": 1000
  },
  "session": {                           // present only when session_id query set
    "session_id": "sess_...",
    "messages_retained": 42,
    "tokens_retained": 3584,
    "tokens_budget": 4000,               // null if unbounded
    "profiles_attached": 3               // session-scoped knowledge records, opaque to TUI
  },
  "global": {                            // overall backend state
    "conversations_total": 128,
    "invocations_total": 2048
  },
  "metadata": {}                         // backend-specific
}
```

Backends without an introspectable memory layer set `capabilities.memory = false` and return 501. Backends that maintain memory but can't meaningfully report hit/miss (e.g. a pure context-window recap) SHOULD return zeros rather than omit the field — zeros are a valid signal.

The TUI uses this to surface a cache hit-rate indicator, show per-session context budget pressure, and power the `memory.cache.updated` event (§7.3) when the backend prefers polling over pushing.

---

## §7 Streaming Events (SSE)

### §7.1 Subscription

Two endpoints, depending on scope:

- `GET /v1/events?workspace_id=...` — all events for the workspace (sessions, MCP servers, permissions, etc.)
- `GET /v1/sessions/{id}/events` — only events for one session

Both use SSE. The TUI typically subscribes to the workspace stream while at the workspace level and switches to a session-scoped stream when focused on a single session (or maintains both — implementation choice).

The connection sends a `server.connected` event immediately and a `server.heartbeat` event every 15 seconds. Reconnection uses standard SSE `Last-Event-ID`.

### §7.2 Event envelope

Every SSE event has the shape:

```
event: <event_type>
id: <monotonic event id>
data: { "type": "<event_type>", "occurred_at": "...", "payload": { ... } }
```

The `event:` line and `data.type` are redundant on purpose — clients SHOULD use `data.type` (it survives JSON-only inspection) and may use `event:` for native SSE listener routing.

### §7.3 Event taxonomy

Event types are namespaced by resource. Unknown types MUST be tolerated and ignored by clients that don't recognize them.

| Type | When emitted | Payload |
|---|---|---|
| `server.connected` | On stream open | `{server_version}` |
| `server.heartbeat` | Every 15s | `{}` |
| `server.disposed` | Backend shutting down | `{reason}` |
| `workspace.updated` | Workspace metadata changed | `{workspace_id}` |
| `session.created` | New session | `{session: Session}` |
| `session.updated` | Session metadata changed | `{session_id, changed_fields: [...]}` |
| `session.deleted` | Session removed | `{session_id}` |
| `session.status_changed` | `idle → running → ...` | `{session_id, status, prev_status}` |
| `session.summarized` | Auto-summary completed | `{session_id, summary}` |
| `session.compacted` | History was compacted (a `compaction` part was inserted) | `{session_id, summary, compacted_count, auto: bool}` |
| `message.created` | New message added (initial frame) | `{message: Message}` |
| `message.part.added` | New part appended to message | `{message_id, part: Part}` |
| `message.part.delta` | Partial update to a part during streaming | `{message_id, part_id, delta: PartDelta}` |
| `message.part.completed` | Part finalized (e.g. tool_call input fully assembled) | `{message_id, part_id}` |
| `message.completed` | Whole message done (`stop_reason` known) | `{message_id, stop_reason, tokens, cost_usd}` |
| `message.error` | Generation failed mid-stream | `{message_id, error}` |
| `tool.call.started` | Tool execution started | `{call_id, tool_name, server_id?}` |
| `tool.call.progress` | Optional progress indication | `{call_id, progress, total?, message?}` (mirrors MCP `notifications/progress`) |
| `tool.call.completed` | Tool finished | `{call_id, is_error}` |
| `permission.requested` | User approval needed | `{permission: PermissionRequest}` |
| `permission.resolved` | User responded (or backend auto-resolved) | `{permission_id, action}` |
| `subagent.started` | Subsession spawned | `{subsession_id, parent_session_id, agent_id}` |
| `subagent.completed` | Subsession finished | `{subsession_id, summary, final_message_id}` |
| `mcp.server.status` | MCP server connect/disconnect/error | `{server_id, status, error?}` |
| `mcp.tools.list_changed` | MCP server's tools changed | `{server_id}` |
| `mcp.resources.list_changed` | MCP server's resources changed | `{server_id}` |
| `mcp.resources.updated` | Subscribed resource updated | `{server_id, uri}` |
| `mcp.prompts.list_changed` | MCP server's prompts changed | `{server_id}` |
| `mcp.log` | Log message from MCP server | `{server_id, level, logger?, data}` |
| `file.changed` | File in workspace changed (if backend watches) | `{path, change_type}` |
| `diff.generated` | New diffs available for current session | `{session_id, count}` |
| `cost.updated` | Per-session cost rolled forward | `{session_id, tokens, cost_usd}` |
| `notification` | Generic banner-worthy message | `{level: "info"\|"warning"\|"error", title, body?}` |
| `session.agent_routed` (v0.2) | Tier-1 orchestrator picked a tier-2 agent for the current turn | `{session_id, message_id, selected_agent, rationale?, confidence?, heuristic: bool}` |
| `memory.cache.updated` (v0.2) | Memory-cache stats snapshot | `{cache: {hits, misses, hit_rate, capacity}, scope: "global"\|"session", session_id?}` |
| `integration.status_changed` (v0.2) | One of /v1/health's integrations flipped status | `{integration: {name, status, detail}, prev_status}` |

### §7.4 Streaming a message

The canonical flow for an assistant turn:

```
session.status_changed     { status: "running" }
message.created            { message: { id, role: "assistant", parts: [], ... } }
message.part.added         { part: { id: p1, type: "thinking", thinking: "" } }
message.part.delta         { part_id: p1, delta: { text_append: "Let me think..." } }
message.part.delta         { part_id: p1, delta: { text_append: " about this." } }
message.part.completed     { part_id: p1 }
message.part.added         { part: { id: p2, type: "text", text: "" } }
message.part.delta         { part_id: p2, delta: { text_append: "Here's what..." } }
...
message.part.completed     { part_id: p2 }
message.part.added         { part: { id: p3, type: "tool_call", call_id: "c1", tool_name: "edit_file", input: {} } }
message.part.delta         { part_id: p3, delta: { input_json_append: "{\"path\":" } }
message.part.delta         { part_id: p3, delta: { input_json_append: "\"main.go\"}" } }
message.part.completed     { part_id: p3 }
permission.requested       { permission: {...} }                      [if permission needed]
permission.resolved        { permission_id, action: "allow" }         [user responded]
tool.call.started          { call_id: "c1", tool_name: "edit_file" }
tool.call.completed        { call_id: "c1", is_error: false }
message.created            { message: { id: ..., role: "tool", parts: [{type: "tool_result", call_id: "c1", content: [...]}] } }
... (assistant continues with another message)
message.completed          { message_id: <last assistant>, stop_reason: "end_turn", tokens: {...}, cost_usd: ... }
session.status_changed     { status: "idle" }
```

### §7.5 Delta shapes

| Part type | Delta keys |
|---|---|
| `text` | `text_append: string` |
| `thinking` | `thinking_append: string`, `signature?: string` (set on completion) |
| `tool_call` | `input_json_append: string` (concatenate, parse on completion), `annotations?` |
| Other | backend-defined; clients tolerate unknown delta shapes |

---

## §8 Extensibility

### 8.1 Vendor namespaces

Backends MAY expose endpoints under `/v1/ext/{vendor}/...` for features not covered by the spec. Example: `/v1/ext/charm/pubsub/...`. Clients ignore namespaces they don't understand.

Vendors MUST:
- Use a unique namespace (recommend a short DNS-safe name).
- Document the namespace at a publicly fetchable URL listed in `capabilities.extensions[].docs`.

### 8.2 Reserved field prefix

Any object MAY include vendor fields prefixed `x_<vendor>_<field>`. Clients MUST tolerate them (preserving on round-trip is recommended but not required outside of message parts).

### 8.3 Open discriminated unions

Part `type`, event `type`, command `source`, etc. are open enumerations. New values MAY be added without bumping the major version. Clients MUST tolerate them.

For `Part.type` specifically: clients MUST preserve unknown parts on round-trips through the backend (i.e. when forwarding messages back, e.g. for tool_result chains). Otherwise vendor-defined parts get silently dropped and break agent state.

### 8.4 Custom event types

Custom SSE events SHOULD be namespaced: `x.{vendor}.{event}` (e.g. `x.charm.lsp_diag_count`). Clients ignore unknown events.

### 8.5 Capability negotiation patterns

The TUI:
1. On connect, calls `GET /v1/capabilities`.
2. Disables UI affordances for any feature with `capabilities.<feature> = false`.
3. Subscribes to `/v1/events`.
4. Optionally calls `GET /v1/agents`, `GET /v1/tools`, `GET /v1/mcp/servers`, `GET /v1/commands` to populate menus.

The backend:
1. Returns `404` or `501` for endpoints corresponding to disabled capabilities.
2. Uses event namespacing for vendor-specific events.
3. Reports its `contract_version` honestly so older clients can refuse to connect to newer backends if they wish.

---

## §9 Compatibility Notes

### 9.1 Anthropic Messages API mapping

Our `Part` types align with Anthropic content blocks: `text`, `image`, `document`, `tool_use ↔ tool_call`, `tool_result`, `thinking`, `redacted_thinking`. Server tools (Anthropic) appear as regular `tool_call`/`tool_result` parts with `server_id` set to the appropriate Anthropic-server identifier.

Streaming: Anthropic's `content_block_start/delta/stop` map cleanly to our `message.part.added/delta/completed`. The Anthropic `message_start/delta/stop` map to our `message.created/.../message.completed`.

A backend wrapping the Anthropic SDK can implement this contract by passing through the streaming events with light envelope translation.

### 9.2 MCP mapping

Our `/v1/mcp/...` endpoints mirror MCP method names: `mcp/servers` ~ list of clients, `tools` ~ `tools/list`, `resources/read` ~ `resources/read`, `prompts/get` ~ `prompts/get`. Notifications (`notifications/tools/list_changed` etc.) map to events `mcp.tools.list_changed` etc.

A `tool_call` part with `server_id: "mcp_<id>"` is conceptually a `tools/call` to that MCP server. Tool results carry MCP `content[]` shapes (text/image/audio/resource) directly under our `tool_result.content`.

### 9.3 A2A mapping

A2A's agent-card pattern can be exposed as an `/v1/ext/a2a/agent_card.json` for inter-agent discovery. A2A's task lifecycle events (`task.created`, `task.updated`, etc.) overlay our session/message events. A backend that wants to be discoverable BY other agents (in addition to driving a TUI) implements both surfaces.

### 9.4 Aider-style edit modes

`Session.agent.mode` is a free-form string. Backends supporting multiple edit modes (architect, diff, whole, etc.) report the active one and accept changes via `PATCH /v1/sessions/{id}` with `{agent: {mode: "..."}}`. The set of valid modes is exposed via `GET /v1/agents/{id}` (the agent definition lists them — extension TBD).

---

## §10 Decisions and Rationale

The 10 questions raised during design review are decided here. Several are explicit "no, because X" decisions — those are still decisions, not deferrals.

1. **Bulk message operations: NO.** Use `POST /v1/sessions/import` for bulk loads. One way to do it; the export/import round-trip covers backfill, migration, and snapshot use cases. *Trigger to revisit:* a real backend with high-frequency message ingestion (e.g. CI logs).

2. **System messages: in the message stream as `role: "system"`.** Default included; suppressible via `?include_system=false`. Backends that store the system prompt only in session config simply never emit one. See §4.4.

3. **Compaction: both a part type and an event.** The `compaction` part type (§4.5) lives in the message history for archaeological reasons (the user can see "history was compacted here, summary: X"). The `session.compacted` event (§7.3) lets the TUI react in real time.

4. **Search: yes, `GET /v1/sessions/{id}/messages/search?q=...`** (§6.3). Gated by `capabilities.search_messages`. Simple full-text shape, returns matches with snippets. Backend ranks however it wants.

5. **Multi-tenant / multi-user: out of v0.1.** The bearer-token auth scheme already permits adding `user_id` claims in tokens later, and tagging resources with `created_by` would be additive. *Trigger to revisit:* shared-service deployments where one backend serves multiple end users.

6. **gRPC transport: out of v0.1.** SSE is sufficient for TUI latency budgets (humans don't notice <50ms differences in chat). Maintaining dual stacks is real cost. *Trigger to revisit:* A2A inter-agent traffic where HTTP/2 multiplexing matters, or backends targeting hard real-time response budgets.

7. **WebSocket events: out of v0.1.** Bidirectional WS gives no advantage over our REST-POST + SSE pairing for the TUI use case. *Trigger to revisit:* features needing client-pushed real-time events upstream (e.g. mouse-share for pair programming).

8. **Agent write API: yes** (§6.5). `POST/PUT/DELETE /v1/agents/{id}` gated by `capabilities.agent_write`. Goose-style recipes are a primary user-extension surface; without a write API the contract can't expose them.

9. **Skills are agents** with `source: "skill"` (§6.5). Backends doing automated extraction from past sessions (Gemini-style) expose `POST /v1/agents/extract?session_id=...`, gated by `capabilities.skills_extraction`. No dedicated namespace — that would fragment the agent picker UI.

10. **Telemetry: yes, `GET /v1/metrics`** (§6.16). Standard counters (sessions, messages, tokens, cost, by-provider), gated by `capabilities.metrics`. Vendor-specific counters go under `x_<vendor>_<key>`.

---

## §14 Error Taxonomy (v0.2)

v0.1 surfaces errors two ways: an `error` part type in a message's content stream (§4.5), and a global `error` response envelope (§6.0). Neither pins a shape for *categorising* errors — clients end up string-matching `message` fields to decide whether an error is retryable, the user's fault, or the platform's.

v0.2 adds a **typed error taxonomy** used by backends reporting `capabilities.structured_errors = true`. The same envelope flows through three surfaces:

- `message.error_info` (§4.4) — set when a message stops with `stop_reason: "error"` or degrades mid-stream.
- `error` part content (§4.5) — still valid; carries the same envelope as its body.
- HTTP response body on 4xx/5xx — §6.0's `error` object gains the same fields.

### 14.1 Error envelope

```json
{
  "error": "tool_error",                    // machine-readable type (see §14.2)
  "message": "Read of /tmp/x.h5 exceeded CLIO_MAX_FILE_SIZE_BYTES",
  "details": {                              // free-form context — opaque to the TUI
    "tool": "hdf5_analyze",
    "call_id": "c_42",
    "file_policy": "outside_allowed_roots"
  },
  "recoverable": true,                      // may the user retry meaningfully?
  "retry_after_s": null                     // hint for auto-retry UI; null if unknown
}
```

`error`, `message`, and `recoverable` are required. `details` is always an object (possibly empty) — clients treat it as display-only metadata and never rely on specific keys.

### 14.2 Canonical error types

| `error` | Meaning | TUI default rendering |
|---|---|---|
| `provider_error` | Upstream LM / model provider failed (timeout, auth, rate-limit) | Red toast, offer retry, surface provider name |
| `routing_error` | Tier-1 orchestrator (§4.3.1) couldn't classify the query | Transient warning; backend typically falls back gracefully |
| `agent_error` | A tier-2 agent's loop failed | Red per-turn badge, keep session open |
| `tool_error` | Tool invocation returned an error dict or raised | Inline under the tool row, don't kill the turn |
| `permission_error` | Backend's file/path/capability policy rejected the request | Modal with policy name + which op was blocked |
| `config_error` | Env/config invalid (missing API key, bad endpoint) | Route to Settings / `/v1/health` doctor view |
| `cancelled` | User cancelled (§6.11 / Ctrl+C) | Silent; just show the session returned to idle |
| `rate_limited` | Soft-limit backoff, not a hard failure | Transient; auto-retry after `retry_after_s` |
| `internal_error` | Unclassified backend failure | Generic red toast; backends MUST NOT leak stack traces via `message` |

Backends MAY add vendor-specific types prefixed `x_<vendor>_`. The TUI treats unknown types as `internal_error` for rendering while preserving the original in round-trips.

### 14.3 `recoverable` semantics

- `true` — user or auto-retry may succeed (network blip, transient provider outage, tool error on missing arg).
- `false` — retry is pointless without user intervention (config_error, permission_error, cancelled).

Used by the TUI's retry affordances: `R` re-sends the last user message when `recoverable = true`; Settings/doctor surface the error otherwise.

### 14.4 Interaction with v0.1

A v0.1 backend leaves `error_info` null and emits a v0.1 `error` part (§4.5) with the free-form `{code, message, recoverable}` shape. v0.2 clients accept both paths. A v0.2 backend SHOULD additionally populate `error_info` on the message so v0.2 clients see the richer shape.

---

## §11 Conformance Levels

A backend's conformance is defined by the capabilities it reports. We do not (yet) specify "levels" (e.g. minimal, standard, full). Rather, the TUI adapts to whatever capabilities are present.

A *minimum useful* backend probably reports:
- `workspaces` (even if a single implicit one)
- `sessions`
- `commands` (even if just built-in)
- `events_sse`

Without those four, there is no useful TUI to render.

---

*End of GACT v0.1 spec.*
