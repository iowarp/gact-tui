# GACT v0.2 — Generic Agentic-Coder TUI Contract

> **Reconciliation note (2026-06-07).** This document was reconciled
> to the *actually-implemented* GACT v0.2 wire, using as ground truth
> the reference backend `clio-agent-gact` (iowarp/clio-agent) at
> `develop @ f647db1` (source: `src/clio_agent/gact/{app.py,types.py,
> events.py,semantic_events.py,agent_blueprints.py,expert_packs.py}`)
> plus a live `GET /v1/capabilities` capture from a running clio with
> a model wired. Where the prose disagreed with the implementation,
> the implementation won. `contract_version` is unchanged (**`0.2`**).
>
> This is a **descriptive** reconciliation: it documents what is built,
> not new protocol. Two classes of content are marked inline:
>
> - **Vendor extensions** — every `x_clio_*` capability flag, the
>   `semantic.event` SSE spine, and the clio-only endpoints (prompts,
>   agent-blueprints, expert-packs, context frames, user-questions,
>   turn-retry, memory tools, schedules, sharing) are **optional
>   vendor surface**. A generic GACT client MUST run without them; a
>   generic GACT backend need not implement them. They are catalogued
>   here so consumers that *do* parse clio's wire have an authority.
> - **Aspirational / not-yet-implemented** — a handful of v0.1/early-v0.2
>   shapes that the spec describes but the reference backend does not
>   emit (e.g. the global `/v1/events` stream, `session.agent_routed` /
>   `memory.cache.updated` / `integration.status_changed` events,
>   `POST /v1/sessions/{id}/summarize`). These are flagged
>   **[NOT IMPLEMENTED in clio f647db1]** at their definition so an
>   adapter author knows not to depend on them against clio today.
>
> See §15 (Implementation status) for the consolidated drift list.

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

> This subsection records the *design intent* of v0.2. For what the
> reference backend actually ships (which events/endpoints landed and
> which did not), see the per-section drift notes and the consolidated
> §15.

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

The block below is the **full implemented flag map** as emitted by the
reference backend (`clio-agent-gact`). The boolean values shown are
clio's live answers with a model wired; another backend reports its own.
The `x_clio_*` block is **vendor extension** (§8.2) — generic clients
ignore unknown `x_*` keys but the keys are catalogued here so clio
consumers have an authority for the values.

```json
{
  "contract_version": "0.2",
  "backend": {
    "name": "clio-agent-gact",        // e.g. "clio-agent-gact" / "crush" / "claudecode"
    "version": "0.1.0",               // backend build version (NOT the contract version)
    "vendor": "iowarp",               // e.g. "iowarp" / "charmbracelet"
    "homepage": "https://github.com/iowarp/clio-agent"   // optional
  },
  "capabilities": {
    // --- v0.1 baseline ---
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
    "scheduled_sessions": true,       // §6.15 — /v1/sessions/{id}/schedules (vendor-ish, see note)
    "hooks": true,                    // §6.17 — /v1/hooks
    "session_tasks": true,            // §6.18 — /v1/sessions/{id}/tasks
    "metrics": true,                  // §6.16 — GET /v1/metrics
    "session_branching": true,        // fork support (§6.2 /fork)
    "session_sharing": true,          // §6.15b — /v1/sessions/{id}/share + /v1/shared/{token}
    "session_export": true,           // §6.2 export/import
    "session_summary": true,          // user-facing TLDR — but see status note below ⚠
    "attachments_upload": true,       // base64 byte upload — but see status note below ⚠
    "multimodal_image_parts": true,   // §4.5 — POST /messages accepts/preserves `image` parts
    "cost_tracking": true,
    "thinking_blocks": true,          // extended thinking content blocks
    "edit_modes": true,               // Aider-style multi-mode (Session.edit_mode: diff/whole/patch)
    "plan_mode": true,                // read-only plan mode (Session.mode: chat/plan/edit/architect)
    "search_messages": true,          // §6.3 — full-text search across messages
    "agent_write": true,              // §6.5 — POST/PUT/DELETE on /v1/agents
    "skills_extraction": true,        // §6.5 — POST /v1/agents/extract

    // --- v0.2 generic additions ---
    "agent_routing": true,            // §4.3.1 — multi-tier agents + routing decisions
    "memory": true,                   // §6.19 — /v1/memory/stats introspection
    "structured_errors": true,        // §14 — typed error_info taxonomy
    "integration_health": true,       // §3.4 — /v1/health `integrations[]` array
    "tool_telemetry": true,           // §4.5 — tool_result.cached + duration_ms

    // --- x_clio_* — VENDOR EXTENSION (optional; generic clients ignore) ---
    // These intentionally carry richer-than-boolean values. See §8.2.
    "x_clio_cancellation": "best_effort",          // "none" | "best_effort" | "hard"
    "x_clio_executor_cancellation": false,
    "x_clio_text_streaming": "best_effort_live",   // "none" | "batch" | "best_effort_live"
    "x_clio_synthetic_posthoc_streaming": false,
    "x_clio_stream_fallback_reasons": { /* map<reason, {category, recovery_actions, ...}> */ },
    "x_clio_direct_delete_permissions": true,
    "x_clio_prompt_registry": true,                // §6.20 — /v1/prompts
    "x_clio_expert_packs": true,                   // §6.22 — /v1/expert-packs
    "x_clio_agent_blueprints": true,               // §6.21 — /v1/agent-blueprints
    "x_clio_user_questions": true,                 // §6.23 — /v1/sessions/{id}/questions
    "x_clio_retry_attempts": true,                 // §6.24 — /v1/sessions/{id}/messages/{id}/retry
    "x_clio_context_frames": true,                 // §6.9 — /v1/sessions/{id}/context/frames
    "x_clio_semantic_events": true,                // §7.6 — the semantic.event SSE spine
    "x_clio_semantic_trace_backend": "none",       // "none" | "file" | "factory"
    "x_clio_semantic_trace_detail": "semantic",    // "off" | "metadata" | "semantic" | "full_debug"
    "x_clio_hook_backend": "local_python",
    "x_clio_hook_events": { /* map of hook event names → metadata */ },
    "x_clio_capability_gaps": { /* map<feature, {...}>; mirrors GET /v1/capability-gaps */ }
  },
  "transports": {
    "events_sse": true,               // §7
    "events_websocket": false         // optional, future
  },
  "auth": {
    "schemes": ["trust_socket"],      // §5 — clio runs trust_socket only today
    "current": "trust_socket"         // active scheme
  },
  "extensions": []                    // §8.1 — array of {id, version, docs}; clio ships none
}
```

> ⚠ **`session_summary` and `attachments_upload` are advertised `true`
> but the dedicated routes (`POST /v1/sessions/{id}/summarize`,
> `POST /v1/sessions/{id}/attachments`) are NOT registered in clio
> f647db1** — both return `404`. Summarization is reachable via
> `POST /v1/sessions/{id}/compact` (§6.25). Treat these two flags as
> over-claimed by the reference backend; see §15. Clients SHOULD probe
> rather than trust these two flags.

A capability set to `false` (or absent) means the corresponding endpoints MUST return `404 Not Found` or `501 Not Implemented`. The TUI MUST hide UI affordances tied to that capability. The reverse direction is NOT guaranteed by clio today for the two flags above — see the warning.

### 3.3.1 `GET /v1/capability-gaps` (vendor)

clio additionally exposes `GET /v1/capability-gaps` → a map of features
the backend recognises but cannot currently serve (with structured
reasons/recovery hints). This is the long-form of the
`x_clio_capability_gaps` flag. Optional; generic clients ignore it.

### 3.4 `GET /v1/health`

Returns 200 with `{"healthy": true, "uptime_s": <int>}` if the backend can serve requests. Used for connection probing.

**v0.2 extension** (`capabilities.integration_health == true`): the response MAY include an `integrations` array and a coarse `overall_status` field:

```json
// Implemented (clio f647db1) — live shape
{
  "healthy": true,
  "uptime_s": 1234,
  "overall_status": "degraded",           // "ready" | "degraded" | "unavailable"
  "integrations": [
    {"name": "api",      "status": "ready",       "detail": "..."},
    {"name": "sessions", "status": "ready",       "detail": "..."},
    {"name": "agent",    "status": "degraded",    "detail": "..."},
    {"name": "memory",   "status": "ready",       "detail": "..."},
    {"name": "lm",       "status": "ready",       "detail": "..."}
  ]
}
```

Integrations are backend-specific — a backend MAY expose any combination of names the TUI can display tabularly. clio f647db1 reports `api` (HTTP surface), `sessions` (session store), `agent` (the built agent/runtime), `memory` (ARC/memory backend), and `lm` (model provider). Unknown names MUST render as a generic row without special handling.

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

The shape below reflects the implemented `Session` (clio
`types.py:Session`). Note the reference backend **flattens** the
cumulative token rollups to top-level `tokens_input` / `tokens_output`
(not a nested `tokens` object as v0.1 sketched), omits unpopulated
optional fields rather than emitting `null`, and surfaces session
**mode** as three distinct fields (`mode`, `edit_mode`, `routing_mode`)
rather than the single free-form `agent.mode` v0.1 imagined.

```json
{
  "id": "sess_...",
  "workspace_id": "ws_...",
  "parent_session_id": "",           // "" (not null) when not a fork
  "title": "string",
  "status": "idle",                  // "idle" | "running" | "waiting_permission" | "waiting_user" | "error" | "cancelled"
  "created_at": "...",
  "updated_at": "...",
  "message_count": 12,
  "model": {
    "provider_id": "anthropic",
    "model_id": "claude-opus-4-7",
    "variant": ""
  },
  "agent": {
    "id": "main",                    // which agent persona/recipe is active (default "main")
    "mode": ""
  },
  "tokens_input": 12500,             // cumulative input tokens (flattened)
  "tokens_output": 8400,             // cumulative output tokens (flattened)
  "cost_usd": 0.42,
  "mode": "chat",                    // "chat" | "plan" | "edit" | "architect"  (plan_mode/edit_modes)
  "edit_mode": "diff",               // "diff" | "whole" | "patch"
  "routing_mode": "auto",            // "auto" | "chat" | "experts" | "reasoning_only"  (agent_routing knob)
  "archived": false,                 // hide from active list, keep for browse
  "metadata": {}                     // backend-specific, open-ended (e.g. metadata.pinned: bool)
}
```

> **Drift note.** v0.1 sketched `summary`, `archived_at`, a nested
> `tokens{input,output,cache_read,cache_write}` block, and
> `model.variant: null`. The reference backend instead uses a boolean
> `archived`, flattened `tokens_input`/`tokens_output`, empty-string
> defaults for unset optionals, and adds `mode`/`edit_mode`/`routing_mode`.
> `waiting_user` and `cancelled` are new status values. Clients MUST
> tolerate both the v0.1 and the implemented shapes per §2.

`status` semantics: `waiting_user` means the turn is blocked on a
user-question (§6.23); `cancelled` is a terminal post-cancel state
(§6.2 `/cancel`).

Forks: `POST /v1/sessions/{id}/fork` with `{at_message_id?: string, title?: string}` returns a new session with `parent_session_id` set.

`mode` / `edit_mode` / `routing_mode` are settable at creation
(`POST /v1/sessions`) and updatable via `PATCH /v1/sessions/{id}`.
`routing_mode` steers the tier-1 orchestrator (§4.3.1): `auto` runs the
normal planner, `chat` forces every turn through the chat path,
`experts` rejects direct chat/none routes, `reasoning_only` biases
toward tool/expert reasoning.

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

Backends with `agent_routing = true` SHOULD emit a `routing_decision` part (§4.5) as the first part of an assistant message that was routed. The decision references `AgentDef.id`. **[NOT IMPLEMENTED in clio f647db1: the companion `session.agent_routed` SSE event is NOT emitted.]** clio surfaces routing two ways instead: the `routing_decision` part (which additionally carries an `execution_path` field, see §4.5) and the `semantic.event` spine (§7.6, e.g. `agent.invocation.started`). A client wanting live routing badges from clio listens to `semantic.event`, not `session.agent_routed`.

The implemented `AgentDef` (clio `types.py:AgentDef`) carries more than the sketch above — including `parent_id`, `prompt_id`/`prompt_profile`, `default_provider`/`default_model`, `skills[]`, `commands[]`, `capability_refs[]`, `enabled`, `validation_errors[]`, and a `source` value of `"expert_pack"` in addition to the v0.1 set. See §6.5 for the full shape.

Discovery: `GET /v1/agents?tier=2` lists tier-2 specialists; the base `/v1/agents` query returns all tiers. clio tier values: `0` untagged, `1` orchestrator, `2` specialist, `3` nanoagent (ephemeral).

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
  "tokens": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0 },
  "cost_usd": 0.0,
  "stop_reason": "",                                       // free-form string (see note)
  "parts": [ /* Part[]; see §4.5 */ ],
  "error_info": null,                                      // v0.2 — see §14
  "metadata": {}
}
```

> **Drift note.** The reference backend's `Message` (clio
> `types.py:Message`) carries a **nested** `tokens` block (unlike the
> flattened `Session`), and does **not** carry a per-message `model`
> field — the active model lives on the `Session`. `stop_reason` is an
> open string; v0.1's enumerated set (`end_turn`/`tool_use`/`max_tokens`/
> `cancelled`/`error`/`permission_denied`) is advisory, not closed —
> clients MUST tolerate other values.

While streaming, a message's `parts` array grows; clients MUST accept partial messages and update them via SSE deltas (§7.4).

**v0.2 `error_info`**: when `stop_reason` is `"error"` or a degraded success with trailing failure context, backends with `capabilities.structured_errors = true` MUST set `error_info` to a typed error envelope per §14. v0.1 backends leave the field null and emit `error` parts in the content stream instead — both paths remain valid.

**clio metadata extensions (June 2026)**: assistant messages MAY carry
`metadata.reasoning_log[]` entries `{model, question, reasoning, response,
reasoning_chars}` and `metadata.workflow_state` as a typed dictionary
returned by expert workflows. Clients SHOULD summarize these as evidence
or detail-panel affordances and SHOULD NOT inline-dump full reasoning text
into the main transcript.

### 4.5 Part (Content Block)

The content of a message is an ordered list of typed parts. The discriminator is `type`. Every part has an `id` (stable for the lifetime of the message), `type`, and optional `metadata`.

**Core part types** (every conforming backend MUST handle these in messages it produces, but MAY return only a subset depending on what the backend supports):

| `type` | Purpose | Key fields |
|---|---|---|
| `text` | Plain text | `text: string` |
| `thinking` | Extended reasoning | `thinking: string`, `signature?: string` (opaque, round-tripped) |
| `redacted_thinking` | Encrypted reasoning | `data: string`, `signature?: string` |
| `image` | Image content | **Implemented (clio)**: flat `data?: string` (base64), `url?: string`, `media_type?: string` — NOT a nested `source` object. Gated by `multimodal_image_parts`. |
| `document` | Document content | `source: {...same}`, `title?`, `context?`, `citations?: {enabled: bool}` (v0.1 sketch; clio does not emit document parts today) |
| `tool_call` | Model invokes a tool | `call_id: string`, `tool_name: string`, `input: object`, `server_id?: string` (for MCP), `annotations?: {readOnlyHint, destructiveHint, idempotentHint, openWorldHint, title}` |
| `tool_result` | Result of a tool | `call_id: string`, `content: Part[]` (recursive — text, image, resource, etc.), `is_error: bool`, **v0.2 (tool_telemetry)**: `cached: bool` (result came from a memory cache hit, not fresh execution), `duration_ms: number` (wall-clock) |
| `routing_decision` (v0.2) | Orchestrator picked an agent for this turn | `selected_agent: string` (matches `AgentDef.id` at §6.5 / `/v1/agents`), `rationale?: string`, `confidence?: number` (0..1), `heuristic: bool` (true = deterministic keyword match; false = LM router). **clio extension**: also carries `execution_path: string` — `"fast"` (deterministic tool template, no LM) or `"expert_loop"` (full expert tool-loop), empty when N/A. SHOULD be the first part of a routed assistant message when `agent_routing` is true. |
| `subagent_call` | Spawn a subagent | `subsession_id: string`, `agent_id: string`, `prompt: string`, `params?: object` |
| `subagent_result` | Subagent terminal result | `subsession_id: string`, `summary: string`, `final_message_id: string` |
| `resource_link` | MCP resource reference | `server_id: string`, `uri: string`, `name?, description?, mime_type?, annotations?` |
| `resource` | Embedded MCP resource | `server_id: string`, `uri: string`, `mime_type: string`, `text?: string`, `data?: string` (base64) |
| `file_diff` | Proposed file change | **Implemented (clio)**: `path: string`, `unified_diff: string`, `new_content: string` (whole-file replacement the apply path writes — re-applying a unified diff is fragile), `status: string` (`"pending"`/`"applied"`/`"rejected"`/`"apply_failed"`), `edit_mode: string` (`diff`/`whole`/`patch`), `lines_added: int`, `lines_removed: int`. NOTE: clio uses `unified_diff`/`new_content`/`status`, NOT the v0.1 `before`/`after`/`applied` triple. |
| `citation` | Source attribution | `text_range: {start, end}`, `source: {type: "document"\|"web"\|"resource", reference: string, location: object}` (v0.1 sketch) |
| `error` | In-stream error | `code: string`, `message: string`, `recoverable: bool` (v0.1 shape; v0.2 backends prefer `Message.error_info`, §14) |
| `compaction` | Marks where prior history was summarized away | `summary: string`, `compacted_message_ids: string[]`, `auto: bool` (true if backend-triggered, false if user-triggered) |

> **Implemented part shape (clio `types.py:Part`).** The reference
> backend models `Part` as a **single flat struct** with all of the
> above fields present as optional, JSON-`omitempty` keys — there are no
> per-type sub-objects on the wire, and `id` MAY be empty on inbound
> user parts (the server assigns it). `type` is the discriminator; a
> reader keys off it and reads only the relevant flat fields. This is
> why `image` uses flat `data`/`url`/`media_type` and `file_diff` uses
> flat `unified_diff`/`new_content`/`status` rather than nested objects.
> The nested-`source` / `before`/`after` shapes in the table are the
> v0.1 sketch and are NOT what clio emits.

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

> **Implemented (clio f647db1).** The reference backend reports
> `{"schemes": ["trust_socket"], "current": "trust_socket"}` — it does
> not implement `bearer` today. Clients SHOULD read `auth.schemes`
> rather than assume `bearer` is available.

---

## §6 Endpoints

Notation: `METHOD /path` followed by request body schema (if any) and response schema. Error responses follow §6.0.

### §6.0 Error format

All errors return an `error` wrapper. The v0.1 sketch used
`{error: {code, message, details}}`; the implemented v0.2 backend wraps
the §14 `ErrorInfo` envelope inside the same `error` key, so the inner
object gains fields rather than changing shape:

```json
// Implemented (clio f647db1) — every 4xx/5xx
{
  "error": {
    "error": "not_found",            // machine-readable taxonomy tag (§14.2). v0.1 called this `code`.
    "message": "string",             // human-readable
    "details": {},                   // always an object (possibly empty); display-only
    "recoverable": false,
    "retry_after_s": null            // omitted when null
  }
}
```

> **Drift note.** clio's discriminator key is **`error`** (the §14 tag),
> not v0.1's `code`. Clients should read either (`error` ?? `code`). The
> conformance suite (§checkStructuredErrors) accepts both during the
> transition.

Status codes follow standard HTTP conventions: 400 validation, 401 auth, 403 permission, 404 not-found, 409 conflict, 422 invalid state, 429 rate limit, 500 internal, 501 not implemented.

### §6.1 Workspaces

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/workspaces` | — | `{workspaces: Workspace[]}` (clio: no `next_cursor`) |
| POST | `/v1/workspaces` | `{name, root_path?, storage_root?, metadata?}` | `Workspace`, `201` |
| GET | `/v1/workspaces/{id}` | — | `Workspace` |
| PATCH | `/v1/workspaces/{id}` | partial `Workspace` | `Workspace` |
| DELETE | `/v1/workspaces/{id}` | — | `204` |

> **Drift note.** clio's `CreateWorkspaceRequest` requires `name` and
> takes `storage_root` (not `config`); the implemented `Workspace` adds
> a `storage_root` field. `POST` returns `201`. Workspace-scoped file
> routes (`/v1/workspaces/{id}/files`, `/files/read`, `/repo_map`) are in
> §6.9.

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
| POST | `/v1/sessions/{id}/summarize` | `{auto?, instructions?}` | **[NOT IMPLEMENTED in clio f647db1 — returns 404 despite `session_summary=true`. Use `/compact` (§6.25).]** |
| GET | `/v1/sessions/{id}/export` | — | `application/json` blob (full session w/ messages) |
| POST | `/v1/sessions/import` | session blob | `Session` |
| POST | `/v1/sessions/{id}/undo` | `{count?: int}` | `{reverted_messages: string[]}` (also in §6.10) |
| POST | `/v1/sessions/{id}/rewind` | `{to_message_id, include_target?}` | `{deleted_messages: string[]}` (also in §6.10) |

> **Drift note.** Implemented `POST /v1/sessions` accepts
> `{workspace_id, title?, model?, agent?, mode?, edit_mode?, routing_mode?, metadata?}`
> (clio `CreateSessionRequest`) — note `mode`/`edit_mode`/`routing_mode`
> instead of `fork_at_message_id` (forking is its own `/fork` route).
> `PATCH /v1/sessions/{id}` accepts
> `{title?, model?, agent?, mode?, edit_mode?, routing_mode?, metadata?, archived?}`.
> clio's list/create responses are `{sessions: [...]}` / `Session` with
> **no `next_cursor`** (pagination not implemented).

### §6.3 Messages

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/messages` | query: `before?, limit?, include_system?: bool` (cursor pagination, newest-first) | `{messages: Message[], next_cursor?}` |
| GET | `/v1/sessions/{id}/messages/{msg_id}` | — | `Message` |
| POST | `/v1/sessions/{id}/messages` | `{parts: Part[], text?, model?, agent?, agent_id?, metadata?}` | `{message_id, accepted_at}` (clio returns `200`, not `202`) |
| DELETE | `/v1/sessions/{id}/messages/{msg_id}` | — | `204` |
| DELETE | `/v1/messages/{msg_id}` | query: `session_id?` | `204` (clio also exposes this session-less delete alias) |
| PATCH | `/v1/sessions/{id}/messages/{msg_id}/parts/{part_id}` | partial part | **[NOT IMPLEMENTED in clio f647db1.]** |
| GET | `/v1/sessions/{id}/messages/search` | query: `q` | `{matches: SearchMatch[]}` (gated by `search_messages`; clio takes `q` only, no cursor) |

> **Drift note.** `POST /messages` body: clio accepts either
> `parts: Part[]` or a convenience `text: string`, plus a per-turn
> agent override via `agent: AgentRef` or `agent_id: string`. It returns
> the ack synchronously with HTTP `200` (the spec said `202`); the
> assistant turn still streams asynchronously over SSE (§7). `image`
> parts in the body are preserved when `multimodal_image_parts=true`.

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
| GET | `/v1/agents` | query: `workspace_id?, source?, tier?` | `{agents: AgentDef[]}` |
| GET | `/v1/agents/{id}` | — | `AgentDef` |
| POST | `/v1/agents` | `AgentDef` (without `id`) | `AgentDef` (with assigned id), `201` |
| PUT | `/v1/agents/{id}` | `AgentDef` (id MUST match path) | `AgentDef` |
| DELETE | `/v1/agents/{id}` | — | `204` |
| POST | `/v1/agents/extract` | `{session_id, name?, description?}` | `AgentDef`, `201` (gated by `skills_extraction`) |

```json
// AgentDef — implemented shape (clio types.py:AgentDef)
{
  "id": "code_expert",
  "source": "builtin",               // "builtin"|"user"|"recipe"|"skill"|"expert_pack"
  "title": "Code Expert",
  "description": "...",
  "parent_id": "",                   // hierarchy link (multi-tier / overlay parent)
  "system_prompt": "",               // backend MAY redact for builtin agents
  "prompt_id": "",                   // ref into the prompt registry (§6.20)
  "prompt_profile": "",
  "default_provider": "",            // NOTE: flat strings, not a nested ModelRef
  "default_model": "",
  "parameters": {},                  // object (clio), not the v0.1 array-of-params
  "module": {}, "signature": {}, "structured_outputs": {}, "fanout": {},  // execution semantics
  "tools": ["..."],                  // tool ids the agent has access to
  "skills": ["..."],
  "commands": ["..."],
  "capability_refs": [               // richer than `tools`: kind = tool|skill|command
    {"kind": "tool", "id": "...", "title": "", "description": "", "source": "builtin",
     "status": "available", "metadata": {}}
  ],
  "metadata": {},
  "enabled": true,
  "validation_errors": [],
  // v0.2 multi-tier routing:
  "tier": 2,                         // 0 untagged | 1 orchestrator | 2 specialist | 3 nanoagent
  "specialization": "code_editing",
  "keywords": ["edit", "refactor", "fix", "review"]
}
```

`source` distinguishes:
- `builtin`: shipped with the backend, usually read-only.
- `user`: created via the write API by the end user.
- `recipe`: loaded from a recipe file (Goose-style), may live on disk.
- `skill`: extracted from past sessions (Gemini-style automated derivation).
- `expert_pack`: contributed by an installed expert pack (§6.22, clio).

> **Drift note.** The implemented `AgentDef` differs from the v0.1
> sketch: `default_provider`/`default_model` are **flat strings** (not a
> nested `ModelRef`); `parameters` is an **object** (not an array of
> param descriptors); and it adds `parent_id`, `prompt_id`,
> `prompt_profile`, the execution-semantics objects
> (`module`/`signature`/`structured_outputs`/`fanout`),
> `skills`/`commands`/`capability_refs`, `enabled`, and
> `validation_errors`. `?tier=N` filters by tier.

The extraction endpoint analyzes a completed session and synthesizes a reusable agent definition. Backends that don't implement this report `capabilities.skills_extraction = false` and return `501`.

### §6.6 Tools

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/tools` | — | `{tools: Tool[]}` (unified catalog across every mounted MCP server) |
| GET | `/v1/tools/{id}` | — | `Tool` (detail) |
| GET | `/v1/catalog/tools` | — | `{tools: Tool[]}` (clio alias; `ListToolsResponse` shape) |

> **Drift note.** clio's `Tool` (clio `types.py:Tool`) carries
> `{id, source, server_id?, name, title, description, permission_default,
> owner, tags[], visible_to[]}` and does **not** ship the
> `input_schema`/`output_schema`/`annotations` the v0.1 §4.6 sketch
> showed in the list view (those may appear in the `/v1/tools/{id}`
> detail). The full tool catalog aggregates bundled in-process gateway
> tools (fs/hdf5/parquet) plus any installed third-party MCP servers.

### §6.7 MCP

If `capabilities.mcp = true`:

Implemented in clio:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/mcp/servers` | query: `workspace_id?` | `{servers: McpServer[]}` |
| GET | `/v1/mcp/handshake` | query: `workspace_id?, session_id?` | `{servers: [{name, reachable, state, transport, tools_count, tools, error?, latency_ms?}]}` |
| POST | `/v1/mcp/servers` | install descriptor | `McpServer`, `201` (clio: install third-party server) |
| GET | `/v1/mcp/servers/{id}` | — | `McpServer` |
| DELETE | `/v1/mcp/servers/{id}` | — | `204` (clio: uninstall) |
| GET | `/v1/mcp/servers/{id}/tools` | — | `{tools: Tool[]}` |
| GET | `/v1/mcp/servers/{id}/resources` | — | `{resources: McpResource[]}` |
| GET | `/v1/mcp/servers/{id}/prompts` | — | `{prompts: McpPrompt[]}` |
| POST | `/v1/mcp/servers/{id}/call` | `{tool, arguments}` | tool result (clio: direct external-tool call) |

The `/v1/mcp/handshake` response is live health, not a durable registry:
stdio MCP servers are mounted per active workspace and `cwd` is the
workspace root. One unreachable server is reported independently and does
not imply that other servers or their tools are unavailable.

`McpServer` includes lifecycle metadata (status, declared capabilities, instructions). `McpResource`/`McpPrompt` mirror the MCP spec shapes.

The TUI uses `/mcp/servers/{id}/prompts` to populate slash-command palettes.

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
| GET | `/v1/workspaces/{id}/files` | — | `{entries: FileEntry[]}` (workspace tree) |
| GET | `/v1/workspaces/{id}/files/read` | query: `path` | file content (clio returns the raw bytes) |
| GET | `/v1/workspaces/{id}/repo_map` | — | `{tree: RepoMapNode, tokens: int}` |

`ContextFile` = `{path, mode, added_at, last_modified, size, language?}`. `RepoMapNode` is recursive (file or directory) with per-node code outline (function/class names) where backend supports tree-sitter.

> **Drift note.** `PATCH /v1/sessions/{id}/context/files` is **[NOT
> IMPLEMENTED in clio f647db1]** — to change a file's mode, DELETE +
> re-POST. The old "context file content" route is gone in favor of the
> workspace-scoped `/v1/workspaces/{id}/files` + `/files/read`. clio
> also adds two **vendor** context-introspection routes (gated by
> `x_clio_context_frames`):
>
> | Method | Path | Response |
> |---|---|---|
> | GET | `/v1/sessions/{id}/context/frames` (query `limit?`) | `{frames: ContextFrame[]}` — per-turn assembled-context snapshots (what was actually fed to the model: items with `kind`, `included`, `reason`, `tokens_estimated`) |
> | GET | `/v1/sessions/{id}/context/frames/{frame_id}` | `ContextFrame` |
> | GET | `/v1/sessions/{id}/context/policy` | `SessionContextPolicy` — effective memory/context policy (memory scope, cross-session-read availability, consent flags) |

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
| GET | `/v1/permissions/{id}` | — | `PermissionRequest` **[NOT IMPLEMENTED in clio f647db1 — clio exposes only the list + the reply POST.]** |
| POST | `/v1/permissions/{id}` | `{action: "allow"\|"deny"\|"allow_session"\|"allow_workspace"}` | `204` |
| GET | `/v1/policies` | — | `{policies: Policy[]}` |
| PUT | `/v1/policies` | `{policies: Policy[]}` | `{policies: Policy[]}` |

> clio additionally advertises `x_clio_direct_delete_permissions=true`:
> a destructive delete tool-call may be auto-permitted under policy
> rather than always prompting. Vendor knob; generic clients ignore it.

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
| GET | `/v1/providers/{id}/models` | `{models: Model[]}` (query: `api_base?`) |
| GET | `/v1/providers/{id}/handshake` | provider probe (query: `api_base?, refresh?`) |
| POST | `/v1/providers/{id}/auth` | provider-specific OAuth/API-key flow init |
| GET | `/v1/providers/lm` | `LMProviderInfo` (clio: current LM config + picker presets) |
| GET | `/v1/providers/lm/wait` | `LMProviderInfo` (long-poll readiness after async PUT; query `timeout?`) |
| PUT | `/v1/providers/lm` | `LMProviderInfo` (clio: set provider/model/api_base/api_key/...; builds the agent at runtime) |

> **Implemented (clio).** The TUI configures the model through the
> singleton **`/v1/providers/lm`** surface. `PUT` may configure the LM
> asynchronously; clients SHOULD follow with
> `GET /v1/providers/lm/wait?timeout=<seconds>` until `state` is
> `ready` or `error`. `GET` returns `LMProviderInfo`
> `{configured, provider, api_base, model, temperature, max_tokens,
> context_length, chosen_context?, context_window?, is_reasoning?,
> native_tool_calling?, thinking_budget, transport?, state,
> status_message, error, operation_id, presets[]}` — `api_key` is never
> echoed back.
> `PUT` body is `LMProviderRequest`
> `{provider, api_base, model, api_key, temperature?, max_tokens?,
> context_length?, parallel?, transport?, thinking_budget?}`. Defaults:
> `temperature=0.0`; `max_tokens=0`, `context_length=0`, and
> `parallel=0` mean "let the server choose/default." Each preset row
> carries `supports_vision` (model multimodal capability for the picker).
> `GET /v1/providers/{id}/handshake` is report-only: it checks
> connectivity/auth/catalog metadata and returns `models[]`, `source`,
> `error?`, `connectivity`, `auth`, `latency_ms`, `generated_at`,
> `provider_id`, and `provider_kind` without changing the active LM.

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
  "chosen_context": 200000,
  "context_source": "server_default",
  "is_reasoning": true,
  "native_tool_calling": true,
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

If `capabilities.scheduled_sessions = true`. Implemented in clio f647db1
as session-scoped schedules:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/schedules` | — | `{schedules: [...]}` |
| POST | `/v1/sessions/{id}/schedules` | schedule spec | created schedule |
| DELETE | `/v1/schedules/{schedule_id}` | — | `204` |

### §6.15b Session sharing (optional)

If `capabilities.session_sharing = true`. Implemented in clio:

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/sessions/{id}/share` | share opts | `{token, url?, ...}` |
| GET | `/v1/shared/{token}` | — | shared session view |

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

Metrics are point-in-time snapshots. Backends MAY add custom counters under a vendor-prefixed key (`x_<vendor>_<counter>`). clio's `Metrics` adds a `latencies` map (`{name → {count, p50_ms, p95_ms, max_ms}}`).

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

The TUI uses this to surface a cache hit-rate indicator and show per-session context budget pressure. (The polling-companion `memory.cache.updated` event is **not** emitted by clio — see §7.3.)

> **Drift note.** clio's session block carries more than the sketch:
> `{session_id, messages_retained, tokens_retained, tokens_budget,
> profiles_attached, context_files_attached, context_files_by_mode,
> compact_summaries, token_pressure, threshold_state
> (empty/normal/warning/critical), compaction_recommended}`. clio also
> exposes related **vendor** memory surface:
>
> | Method | Path | Response |
> |---|---|---|
> | GET | `/v1/memory/search` (query `q`, `include_cross_session?`) | `MemorySearchResponse` `{query, include_cross_session, searched_sessions[], hits[]}` |
> | GET | `/v1/sessions/{id}/memory/events` (query `limit?`) | per-session memory event log |
> | GET | `/v1/sessions/{id}/memory/events/{event_id}` | one memory event |
> | POST | `/v1/sessions/{id}/memory/tools/search-sessions` | agent-facing cross-session search tool |
> | POST | `/v1/sessions/{id}/memory/tools/read-session-summary` | agent-facing summary read tool |
> | POST | `/v1/sessions/{id}/memory/tools/read-context-frame` | agent-facing context-frame read tool |

---

## §6.20 Prompt registry (vendor — `x_clio_prompt_registry`)

clio exposes a versioned prompt registry the TUI's agent editor reads
and writes. Optional vendor surface; generic clients ignore it.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/prompts` | — | `{prompts: [...]}` |
| GET | `/v1/prompts/{prompt_id}` | — | prompt record (`{prompt_id:path}`) |
| POST | `/v1/prompts/{prompt_id}/render` | render vars (query `profile?`) | rendered text |
| POST | `/v1/prompts/{prompt_id}/validate` | candidate prompt | validation result |
| PUT | `/v1/prompts/{prompt_id}` | prompt body | saved prompt |
| POST | `/v1/prompts/reload` | — | reload from disk |

## §6.21 Agent blueprints (vendor — `x_clio_agent_blueprints`)

Blueprints are declarative agent definitions loaded from installable
**sources**; they materialise into the `/v1/agents` catalog. Optional.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/agent-blueprints/sources` | list blueprint sources |
| POST | `/v1/agent-blueprints/sources` | add a source (`201`) |
| POST | `/v1/agent-blueprints/sources/{source_id}/refresh` | re-pull a source |
| DELETE | `/v1/agent-blueprints/sources/{source_id}` | remove a source |
| GET | `/v1/agent-blueprints` (query `workspace_id?`) | list blueprints |
| GET | `/v1/agent-blueprints/{blueprint_id}` | one blueprint (`{id:path}`) |
| POST | `/v1/agent-blueprints/validate` | validate a candidate |
| POST | `/v1/agent-blueprints/install` | install (`201`) |
| POST | `/v1/agent-blueprints/{blueprint_id}/update` | update installed |
| DELETE | `/v1/agent-blueprints/{blueprint_id}` | uninstall |
| POST | `/v1/agent-blueprints/{blueprint_id}/mcp/{descriptor_id}/enable` | enable a blueprint-bundled MCP descriptor |
| GET / POST | `/v1/sessions/{id}/agent-blueprint` | get / set the session's active blueprint |
| GET / PUT | `/v1/sessions/{id}/agent-overlay` | get / set a per-session overlay on the active blueprint |
| POST | `/v1/sessions/{id}/agent-overlay/export` | export the overlay as a reusable artifact (`201`) |

## §6.22 Expert packs (vendor — `x_clio_expert_packs`)

An expert pack bundles tier-2 specialist agents + their tools/prompts.
Installed packs contribute `AgentDef` rows with `source:"expert_pack"`.
Optional.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/expert-packs` (query `workspace_id?`) | list packs |
| GET | `/v1/expert-packs/{pack_id}` | one pack (`{id:path}`) |
| POST | `/v1/expert-packs/validate` | validate a candidate pack |
| GET / POST | `/v1/sessions/{id}/expert-pack` | get / set the session's active pack |

## §6.23 User questions (vendor — `x_clio_user_questions`)

The backend can block a turn to ask the user a question (free-form,
choice, or confirmation); the session enters `status:"waiting_user"`.
Optional.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/questions` | query: `status?` | `{questions: [UserQuestion]}` |
| POST | `/v1/sessions/{id}/questions` | `CreateUserQuestionRequest` | `UserQuestion` (`201`) |
| POST | `/v1/sessions/{id}/questions/{qid}/answer` | `AnswerUserQuestionRequest` | `UserQuestion` |
| POST | `/v1/sessions/{id}/questions/{qid}/cancel` | — | `UserQuestion` |

`UserQuestion` = `{id, session_id, prompt, status (pending/answered/
cancelled/expired), kind (freeform/choice/confirmation), options[], …,
answer, selected_options[]}`. Lifecycle is mirrored on SSE via the
`user_question.*` events (§7.3).

## §6.24 Turn retry / attempts (vendor — `x_clio_retry_attempts`)

Re-run a turn (optionally with notes / a different model) without
re-typing the user message. Optional.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/attempts` | — | `{attempts: [TurnAttempt]}` |
| POST | `/v1/sessions/{id}/messages/{msg_id}/retry` | `RetryTurnRequest` `{notes?, execute?, model?, provider_id?, model_id?}` | `TurnAttempt` |

## §6.25 Compaction

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/sessions/{id}/compact` | `{auto?, instructions?}` | compaction result; inserts a `compaction` part (§4.5) and emits `session.compacted` (§7.3) |

This is the implemented path for both history compaction and the
user-facing summary (the `session_summary` flag's intended `/summarize`
route is not registered — see §6.2).

---

## §7 Streaming Events (SSE)

### §7.1 Subscription

**Implemented (clio f647db1): SSE is session-scoped only.**

- `GET /v1/sessions/{id}/events` — events for one session.

> **Drift note.** The v0.1 sketch also defined a global
> `GET /v1/events?workspace_id=...` workspace-wide stream. That route is
> **[NOT IMPLEMENTED in clio f647db1]** (returns `404`). A client driving
> clio subscribes per session. The global stream remains valid spec
> surface for backends that want it, but MUST NOT be assumed present —
> read it as optional and probe.

On connect clio sends `server.connected` immediately, then a
`session.snapshot` event (authoritative `{session_id, status, updated_at,
authoritative: true}`) so the client can reconcile state, then live
events. A `server.heartbeat` is emitted every 15 seconds. Reconnection
uses standard SSE `Last-Event-ID`; the bus replays buffered events newer
than that id (bounded history per session), so a client that connects
right after POSTing a message still receives that turn's events.

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

#### §7.3a Implemented event set (clio f647db1)

These are the wire event `type` values the reference backend actually
publishes on `GET /v1/sessions/{id}/events`. The message-streaming core
(`server.*`, `session.status_changed`, `message.*`) matches the v0.1
sketch; the rest reflect clio's resource model.

| Type | When emitted | Notes |
|---|---|---|
| `server.connected` | On stream open | `{server_version}` |
| `server.heartbeat` | Every 15s | `{}` |
| `session.snapshot` | Right after `server.connected` | `{session_id, status, updated_at, authoritative}` |
| `session.status_changed` | status transition | `{session_id, status, prev_status?}` |
| `session.updated` | session metadata changed | — |
| `session.compacted` | history compacted (a `compaction` part inserted) | §6.25 |
| `session.cleared` | session history cleared | — |
| `session.active_pack` | active expert pack changed (§6.22) | vendor |
| `session.active_agent_blueprint` | active blueprint changed (§6.21) | vendor |
| `message.created` | new message frame | `{message: Message}` |
| `message.part.added` | new part appended | `{message_id, part: Part}` |
| `message.part.delta` | streaming part delta | `{message_id, part_id, delta}` (§7.5) |
| `message.part.completed` | part finalized | `{message_id, part_id}` |
| `message.completed` | message done | `{message_id, stop_reason, tokens, cost_usd}` |
| `message.deleted` | message removed | `{message_id}` |
| `tool.call.started` / `tool.call.completed` | tool exec start/finish | `{call_id, tool_name, server_id?}` / `{call_id, is_error}` |
| `tool.started` | bundled-gateway tool started | vendor |
| `tool.selection.invalid` | router picked an unavailable tool | vendor |
| `permission.requested` / `permission.resolved` | approval lifecycle | `{permission}` / `{permission_id, action}` |
| `subagent.started` / `subagent.completed` | subsession lifecycle | §4.3 |
| `agent.invocation.started` / `agent.invocation.completed` | agent loop boundaries | vendor |
| `turn.started` / `turn.completed` / `turn.failed` | turn lifecycle | vendor |
| `turn.retry_requested` | a retry was queued (§6.24) | vendor |
| `context.file.added` / `context.file.removed` | session context files (§6.9) | — |
| `context.frame.created` / `context.frame.completed` | per-turn context frame (§6.9) | vendor |
| `file.diff.applied` / `file.diff.rejected` / `file.diff.write_failed` | diff apply lifecycle (§6.10) | — |
| `memory.compacted` / `memory.policy_summary` / `memory.search.completed` | memory subsystem | vendor |
| `lm.provider.changed` / `lm.provider.failed` | `/v1/providers/lm` config result | — |
| `user_question.created` / `.answered` / `.cancelled` / `.resumed` | ask-user lifecycle (§6.23) | vendor |
| `semantic.event` | the semantic-execution spine | §7.6 (vendor; `x_clio_semantic_events`) |

#### §7.3b Specified-but-not-emitted by clio

The following event types are defined in v0.1/v0.2 and remain valid spec
surface for other backends, but the reference backend does **NOT** emit
them today. A client driving clio must not wait on them. Where clio
offers an alternative, it is noted.

| Type | Status against clio | Alternative |
|---|---|---|
| `server.disposed` | not emitted | — |
| `workspace.updated` | not emitted | — |
| `session.created` / `session.deleted` | not emitted | discover via REST list |
| `session.summarized` | not emitted | `session.compacted` (§6.25) |
| `message.error` | not emitted | `Message.error_info` (§14) / `turn.failed` |
| `tool.call.progress` | not emitted | — |
| `mcp.server.status` / `mcp.*.list_changed` / `mcp.resources.updated` / `mcp.log` | not emitted | poll `/v1/mcp/servers` |
| `file.changed` | not emitted | — |
| `diff.generated` | not emitted | `file.diff.*` cover apply/reject |
| `cost.updated` | not emitted | rollups arrive on `message.completed` |
| `notification` | not emitted | — |
| `session.agent_routed` (v0.2) | **not emitted** | `routing_decision` part (§4.5) + `agent.invocation.*` semantic events (§7.6) |
| `memory.cache.updated` (v0.2) | **not emitted** | poll `/v1/memory/stats` |
| `integration.status_changed` (v0.2) | **not emitted** | poll `/v1/health` |

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

### §7.6 Semantic events (vendor — `x_clio_semantic_events`)

clio publishes a parallel, higher-level **semantic execution** spine on
the same SSE channel under the single wire type **`semantic.event`**.
Where `message.part.delta` says "text arrived", a semantic event says
"a turn started", "a tool was called", "an agent was invoked", "memory
was accessed", "the turn settled". The same object feeds live SSE,
optional durable trace logging, and user hooks. Optional vendor surface;
generic clients ignore the `semantic.event` type.

Envelope (clio `semantic_events.py:SemanticEvent.to_dict`):

```json
{
  "schema_version": "clio.semantic_event.v1",
  "event_id": "sem_...",
  "event_type": "turn.started",     // dotted vocabulary (see below)
  "session_id": "sess_...",
  "workspace_id": "ws_...",
  "trace_id": "...", "turn_id": "...", "span_id": "...", "parent_span_id": "",
  "status": "completed",            // started | completed | failed | ...
  "summary": "human-readable one-liner",
  "actor": {}, "subject": {}, "blueprint": {}, "provider": {},
  "payload": {},                    // redacted per detail level (see below)
  "live_observed": true,
  "detail_level": "semantic",       // off | metadata | semantic | full_debug
  "occurred_at": "..."
}
```

Observed `event_type` values include: `turn.started` / `turn.completed`
/ `turn.failed`, `tool.call.started` / `tool.call.completed` /
`tool.selection.invalid`, `agent.invocation.started` /
`agent.invocation.completed`, `subagent.started` / `subagent.completed`,
`memory.compacted` / `memory.search.completed`. The set is open.

**Detail levels** (`x_clio_semantic_trace_detail`, also per-event):
`off` suppresses the event; `metadata` emits envelope fields but empty
payloads; `semantic` (default) emits payloads with sensitive keys
(prompts, inputs, outputs, secrets, transcripts, …) redacted to
`"[redacted]:N chars"`; `full_debug` emits raw payloads. Durable tracing
is controlled by `x_clio_semantic_trace_backend` (`none`/`file`/
`factory`).

> **Note for generic clients.** `semantic.event` is the clio answer to
> the unimplemented `session.agent_routed` / `memory.cache.updated`
> events (§7.3b). It is NOT part of the generic GACT contract — treat it
> as an opt-in vendor stream keyed off `x_clio_semantic_events`.

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
3. Subscribes to `GET /v1/sessions/{id}/events` per focused session (clio has no global stream — §7.1).
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

## §15 Implementation status — reconciliation drift list (clio f647db1)

Consolidated record of where the reference backend
(`clio-agent-gact`, iowarp/clio-agent @ develop `f647db1`, plus a live
`/v1/capabilities`) diverges from the prose above. The implementation is
authoritative; this list exists so adapter and client authors know what
to depend on.

### 15.1 Endpoints — present but renamed/reshaped vs v0.1 sketch
- **SSE is session-scoped only**: `GET /v1/sessions/{id}/events`. The
  global `GET /v1/events` is **not implemented** (§7.1).
- **Summarization is `/compact`**: `POST /v1/sessions/{id}/compact`
  (§6.25). The `/summarize` route is not registered (§6.2).
- **Tool catalog** is `GET /v1/tools` (unified) + `/v1/catalog/tools`
  alias; `Tool` list rows omit `input_schema`/`annotations` (§6.6).
- **LM config** is the `GET`/`PUT /v1/providers/lm` singleton, not the
  per-provider `/auth` flow (§6.12).
- **Message POST** returns `200` (not `202`) and accepts a `text`
  convenience field + per-turn `agent`/`agent_id` (§6.3).
- **Error discriminator key is `error`** (the §14 tag), not `code` (§6.0).

### 15.2 Endpoints — specified but NOT implemented in clio
- `GET /v1/events` (global stream) — §7.1
- `POST /v1/sessions/{id}/summarize` — §6.2 (caps over-claims `session_summary`)
- `POST /v1/sessions/{id}/attachments` — caps over-claims `attachments_upload`
- `PATCH /v1/sessions/{id}/context/files` — §6.9
- `PATCH /v1/sessions/{id}/messages/{id}/parts/{id}` — §6.3
- `GET /v1/permissions/{id}` — §6.11
- MCP: `/reconnect`, `/resource_templates`, `/resources/read`,
  `/resources/subscribe`, `/prompts/get` — §6.7

### 15.3 Endpoints — clio adds (vendor or minor, gated by `x_clio_*`)
- Prompt registry `/v1/prompts*` (§6.20)
- Agent blueprints `/v1/agent-blueprints*` + session blueprint/overlay (§6.21)
- Expert packs `/v1/expert-packs*` + session pack (§6.22)
- User questions `/v1/sessions/{id}/questions*` (§6.23)
- Turn retry/attempts `/v1/sessions/{id}/attempts`, `.../retry` (§6.24)
- Context frames/policy `/v1/sessions/{id}/context/frames*`, `/context/policy` (§6.9)
- Memory search/events/tools `/v1/memory/search`, `/v1/sessions/{id}/memory/*` (§6.19)
- Capability gaps `/v1/capability-gaps` (§3.3.1)
- Scheduled sessions + sharing (§6.15, §6.15b)
- `DELETE /v1/messages/{id}` session-less alias (§6.3)

### 15.4 Shape drift (implementation wins)
- `Session`: flattened `tokens_input`/`tokens_output`; boolean
  `archived` (no `archived_at`); adds `mode`/`edit_mode`/`routing_mode`;
  status enum adds `waiting_user`,`cancelled`; empty-string optionals,
  not `null` (§4.2).
- `Message`: nested `tokens`; **no per-message `model`**; `stop_reason`
  open string (§4.4).
- `Part`: single flat struct; `image` uses flat `data`/`url`/`media_type`;
  `file_diff` uses `unified_diff`/`new_content`/`status`/`edit_mode`/
  `lines_added`/`lines_removed`; `routing_decision` adds `execution_path`
  (§4.5).
- `AgentDef`: flat `default_provider`/`default_model`; `parameters` is an
  object; adds many fields incl. `capability_refs`, `source:"expert_pack"`
  (§6.5).
- Error body wraps `ErrorInfo` (`error`/`message`/`details`/`recoverable`/
  `retry_after_s`) (§6.0/§14).

### 15.5 SSE events
- Implemented set in §7.3a; specified-but-not-emitted in §7.3b.
- The three v0.2 events (`session.agent_routed`, `memory.cache.updated`,
  `integration.status_changed`) are **not emitted**; clio's higher-level
  story is the `semantic.event` spine (§7.6) plus polling for caps/health.

### 15.6 Capabilities envelope
- Full implemented flag map in §3.3 (incl. all `x_clio_*` vendor flags).
- `backend.version` is the build version (`0.1.0`), distinct from
  `contract_version` (`0.2`).
- `auth.schemes = ["trust_socket"]` only; no `bearer` (§5).
- `extensions = []`.

### 15.7 Suspected clio-side inconsistencies (worth a clio issue)
1. **`session_summary` and `attachments_upload` advertised `true` with
   no backing route** (both `404`). Either register the routes or drop
   the flags. (§3.3, §6.2)
2. `backend.version` is `0.1.0` while the wire is GACT `0.2` and the
   product is past 0.7 — likely a stale hardcoded value, harmless but
   confusing for diagnostics.

### 15.8 Conformance fixtures
`contract/conformance/{conformance.go,v0_2.go,...}` were reviewed and
remain **consistent** with the reconciled spec (they assert the v0.2
caps flags, `/v1/agents?tier=2`, `/v1/memory/stats`, integration health,
and the structured-error envelope — all of which hold). The
structured-error check already accepts both `code` and `error`
discriminators. **No fixture changes were made**; left as-is to avoid
disturbing conformance tooling.

> ⚠ **One fixture is stale vs the implemented `file_diff` shape.**
> `checkDiffs` (conformance.go) requires each diff row to carry an
> `applied` (bool) key, but clio's `file_diff` Part uses `status`
> (`pending`/`applied`/`rejected`/`apply_failed`), not `applied` — see
> §4.5. The check only passes today because the probed session has an
> empty `diffs` list; it would error against a clio session with pending
> diffs. **Left as a follow-up** (a fix risks the emulator, which may
> still emit `applied` — verify the emulator's diff shape before
> changing the assertion). Other optional follow-ups: assert SSE is
> session-scoped, and probe the over-claimed
> `session_summary`/`attachments_upload` flags.

---

*End of GACT v0.2 spec.*
