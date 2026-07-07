# GACT v0.2 — Generic Agentic-Coder TUI Contract

> **Reconciliation note (2026-07-01).** This document was reconciled
> to the *actually-implemented* GACT v0.2 wire, using as ground truth
> the reference backend `clio-agent-gact` (iowarp/clio-agent) at
> `develop @ 3527143` (source: `src/clio_agent/gact/` — routes,
> `types.py`, `events.py`, `turn.py`, `permission_gate.py`,
> `semantic_events.py`, and the Phase-0 truthfulness fixes clio
> #756/#759/#760/#761/#782/#789) plus six per-area truth reports
> read directly against that source (iowarp/gact-tui#232). Where the
> prose disagreed with the implementation, the implementation won.
> `contract_version` is unchanged (**`0.2`**).
>
> **Addendum (2026-07-06).** Transcript wire vocabulary re-verified
> against clio `develop @ e921eec` (iowarp/clio-agent#833): the
> normalized `turn.text.delta` / `turn.trace.delta` / `turn.action.added`
> / `call.result.delta` content twins were retired and are no longer
> emitted; `message.part.*` (+ `message.created` / `message.completed`)
> is the sole transcript vocabulary. See §7.3c.
>
> **Owner's direction (gact-tui#232): this spec is descriptive —
> reality leads.** When the reference backend and the prose diverge,
> the backend's wire is the contract and the prose gets rewritten to
> match it. Aspirational surface is kept only when explicitly marked
> as not-implemented or PROPOSED; nothing in this document may
> silently promise behavior clio does not exhibit.
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
>   **[NOT IMPLEMENTED in clio 3527143]** at their definition so an
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
    "version": "<package version>",   // backend build version (NOT the contract version).
                                      // clio reports the installed clio-agent package
                                      // version via importlib.metadata (currently 0.5.x);
                                      // the same value appears in /v1/health's
                                      // api-integration detail and the SSE
                                      // server.connected payload's `server_version`.
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
    "session_summary": false,         // /summarize not implemented (truthful since clio #760 / Phase 0)
    "attachments_upload": false,      // /attachments not implemented (truthful since clio #760 / Phase 0)
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
    "x_clio_synthetic_posthoc_streaming": false,   // AUTHORITATIVE: clio never replays synthetic deltas post-hoc
    "x_clio_stream_fallback_reasons": { /* map<reason, row> — see note below */ },
    "x_clio_direct_delete_permissions": true,
    "x_clio_prompt_registry": true,                // §6.20 — /v1/prompts
    "x_clio_expert_packs": true,                   // §6.22 — /v1/expert-packs
    "x_clio_agent_blueprints": true,               // §6.21 — /v1/agent-blueprints
    "x_clio_user_questions": true,                 // §6.23 — /v1/sessions/{id}/questions
    "x_clio_retry_attempts": true,                 // §6.24 — /v1/sessions/{id}/messages/{id}/retry
    "x_clio_context_frames": true,                 // §6.9 — /v1/sessions/{id}/context/frames + /context/state + /context/compact
    "x_clio_semantic_events": true,                // §7.6 — the semantic.event SSE spine
    "x_clio_semantic_trace_backend": "none",       // "none" | "file" | "factory"
    "x_clio_semantic_trace_detail": "semantic",    // "off" | "metadata" | "semantic" | "full_debug"
    "x_clio_hook_backend": "local_python",         // "local_python" | "none" | "factory" | "unavailable" (init failure)
    "x_clio_hook_events": { /* map<hook_event_name, int handler_count> */ },
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

The flag map is **truthful** as of clio #760/#782 (Phase 0):
`session_summary` and `attachments_upload` are now advertised `false`
because their routes (`POST /v1/sessions/{id}/summarize`,
`POST /v1/sessions/{id}/attachments`) are not registered. Summarization
is reachable via `POST /v1/sessions/{id}/compact` (§6.25).

A capability set to `false` (or absent) means the corresponding endpoints MUST return `404 Not Found` or `501 Not Implemented`. The TUI MUST hide UI affordances tied to that capability. The rule now holds **unconditionally in both directions** for the reference backend: a flag advertised `true` has its route registered, and a flag advertised `false` 404s. The conformance suite probes this (capability↔route truth).

**`x_clio_stream_fallback_reasons`** is a map of the 13 reason keys the
backend may attach to a batch-fallback part (from
`gact/runtime/capabilities.py::_STREAM_FALLBACK_REASON_DEFINITIONS`):
`stream_disabled_guided_output`, `stream_disabled_live_streaming`,
`streaming_dependency_unavailable`, `agent_not_available`,
`agent_not_streamable`, `stream_setup_failed`,
`stream_failed_before_output`, `stream_no_prediction`,
`stream_completed_without_chunks`, `provider_streaming_unsupported`,
`sync_execution_path`, `dynamic_prompt_stream_unavailable`,
`dynamic_tool_stream_unavailable`. Each row carries
`{category, synthetic_posthoc, live_streaming, recovery_actions,
description}`. Note the per-row `synthetic_posthoc: true` values are
legacy metadata — the authoritative top-level
`x_clio_synthetic_posthoc_streaming` is `false` (clio never replays
synthetic deltas after the fact; a fallback part arrives whole with
`stream_source: "batch"`, §7.4).

### 3.3.1 `GET /v1/capability-gaps` (vendor)

clio additionally exposes `GET /v1/capability-gaps` → a map of features
the backend recognises but cannot currently serve (with structured
reasons/recovery hints). This is the long-form of the
`x_clio_capability_gaps` flag. Optional; generic clients ignore it.

Response wrapper: `{"capability_gaps": map<feature, row>}`. Each row is

```json
{
  "status": "unsupported",           // gap status: "unsupported" | "unavailable"
  "advertised": false,               // whether the caps map claims it
  "category": "optional",            // gap classification
  "description": "…",
  "client_behavior": "…",            // what a client should do instead
  "recovery_actions": ["…"],
  "related_endpoints": ["…"],        // and/or "related_commands" (a row may carry both)
}
```

Current rows (clio 3527143): `voice` (`unsupported`, advertised false),
`lsp` (`unsupported`, advertised false), `optimizer_command`
(`unavailable`, advertised **true** — the command surface exists but
execution is stubbed; it carries both `related_endpoints` and
`related_commands`).

### 3.4 `GET /v1/health`

Returns 200 with `{"healthy": true, "uptime_s": <int>}` if the backend can serve requests. Used for connection probing.

**v0.2 extension** (`capabilities.integration_health == true`): the response MAY include an `integrations` array and a coarse `overall_status` field:

```json
// Implemented (clio 3527143) — live shape
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

Integrations are backend-specific — a backend MAY expose any combination of names the TUI can display tabularly. clio 3527143 reports `api` (HTTP surface), `sessions` (session store), `agent` (the built agent/runtime), `memory` (ARC/memory backend), and `lm` (model provider). Unknown names MUST render as a generic row without special handling.

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
(not a nested `tokens` object as v0.1 sketched), **serializes
zero-values** (`""` / `0` / `{}` defaults — never `null`, never
omitted), and surfaces session **mode** as three distinct fields
(`mode`, `edit_mode`, `routing_mode`) rather than the single free-form
`agent.mode` v0.1 imagined.

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
(§6.2 `/cancel`). **`waiting_permission` is declared in the enum but
NEVER emitted by clio** — while a permission request is pending the
session stays `running`; clients watch `permission.requested` (§6.11)
instead. All other values are live.

Forks: `POST /v1/sessions/{id}/fork` with `{at_message_id?: string,
title?: string}` returns **201** with a new session whose
`parent_session_id` is set. `at_message_id` truncation is *inclusive*
(the named message is the last one copied); an unknown id silently
copies **all** messages. Context files are copied. `mode`, `edit_mode`,
`routing_mode`, `model`, `agent`, and `metadata` are **NOT inherited**
— the fork is created with store defaults (`chat`/`diff`/`auto`, agent
`main`, empty model/metadata). No SSE event is emitted for a fork.
(Whether non-inheritance is desirable is an open question; it is the
implemented behavior and is codified here. See §6.2.)

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

Backends with `agent_routing = true` SHOULD emit a `routing_decision` part (§4.5) as the first part of an assistant message that was routed. The decision references `AgentDef.id`. **[NOT IMPLEMENTED in clio 3527143: the companion `session.agent_routed` SSE event is NOT emitted.]** clio surfaces routing two ways instead: the `routing_decision` part (which additionally carries an `execution_path` field, see §4.5) and the `semantic.event` spine (§7.6, e.g. `agent.invocation.started`). A client wanting live routing badges from clio listens to `semantic.event`, not `session.agent_routed`.

The implemented `AgentDef` (clio `types.py:AgentDef`) carries more than the sketch above — including `parent_id`, `prompt_id`/`prompt_profile`, `default_provider`/`default_model`, `skills[]`, `commands[]`, `capability_refs[]`, `enabled`, `validation_errors[]`, and a `source` value of `"expert_pack"` in addition to the v0.1 set. See §6.5 for the full shape.

Discovery: `GET /v1/agents?tier=2` lists tier-2 specialists; the base `/v1/agents` query returns all tiers. clio tier values: `0` untagged, `1` orchestrator, `2` specialist, `3` nanoagent (ephemeral).

### 4.4 Message

A **Message** is a turn in a session, owned by a role.

```json
{
  "id": "msg_...",
  "session_id": "sess_...",
  "turn_id": "msg_...",              // implemented (clio): the originating USER message id of
                                     // the turn this message belongs to. Durable (persisted +
                                     // served on reload); empty string outside a turn.
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
> open string; the values clio actually emits are
> **`end_turn` | `error` | `cancelled` | `blocked`** (the latter for a
> pre-message-hook veto). v0.1's enumerated set (`tool_use`/
> `max_tokens`/`permission_denied`) is advisory, not closed —
> clients MUST tolerate other values.
>
> Messages and their parts serialize via `to_wire()` — parts use
> `exclude_defaults` but always keep `id`/`type`/`agent_id`; the
> message envelope uses `exclude_none`. `GET /messages` and the SSE
> stream use the same projection, so a reload matches the live stream
> byte-for-byte.

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
| `file_diff` | Proposed file change | **Implemented (clio)**: `path: string`, `unified_diff: string`, `new_content: string` (whole-file replacement the apply path writes — re-applying a unified diff is fragile; ships on the wire in both SSE `message.part.added` and `GET /messages`), `status: string` (`"pending"`/`"applied"`/`"rejected"`/`"apply_failed"`), `edit_mode: string` (`diff`/`whole`/`patch`), `lines_added: int`, `lines_removed: int`. NOTE: clio uses `unified_diff`/`new_content`/`status`, NOT the v0.1 `before`/`after`/`applied` triple. **Lifecycle caveat**: the persisted Part's `status` is frozen at `"pending"` (its status at proposal time) — apply/reject mutate only the §6.10 diff rows and emit `file.diff.*` events; `GET /messages` never reflects apply state. `GET /diffs` + `file.diff.*` are authoritative. |
| `citation` | Source attribution | `text_range: {start, end}`, `source: {type: "document"\|"web"\|"resource", reference: string, location: object}` (v0.1 sketch) |
| `error` | In-stream error | `code: string`, `message: string`, `recoverable: bool` (v0.1 shape; v0.2 backends prefer `Message.error_info`, §14) |
| `compaction` | Marks where prior history was summarized away | `summary: string`, `compacted_message_ids: string[]`, `auto: bool` (true if backend-triggered, false if user-triggered). **[NOT EMITTED by clio 3527143]** — clio's `/compact` (§6.25) instead REPLACES the ledger with one synthetic assistant `text` message flagged `metadata.synthetic: "compact_summary"`; there is no `compaction` part type on clio's wire. Valid for other backends. |

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
>
> **Vendor part metadata clients depend on** (clio): streamed parts
> carry `metadata.stream_source` (`"live"` | `"batch"`) and
> `metadata.signature_field_name` (the internal contract field the
> text belongs to — e.g. `answer`, `reasoning`, `next_thought`).
> Provider-native reasoning arrives as `type: "thinking"` parts with
> `metadata: {thinking_source: "provider", provider_source: "...",
> default_collapsed: true}`.
>
> **Delegation / expert-handoff return envelope** (clio): the terminal
> part of a delegated (sub)agent's turn carries the `expert_handoff`
> envelope on `metadata` — the vendor fields a transcript client reads to
> render a `↩ child returns to parent` row. Keys: `agent_id`; `stage`
> (e.g. `"delegate.completed"` | `"parent.resumed"`); `status` (e.g.
> `"completed"`); `resumed_from` (the stage a parent resumed from, when
> applicable); `output` (the terminal deliverable, a copy of the `answer`
> text); `output_summary` (the cleaned one-line summary of `output`);
> `output_raw` (the structured child result — JSON for data/analysis
> returns, empty for prose returns); and `workflow_state` (the typed
> workflow dictionary, also surfaced on the message per §4.4). The
> remaining keys (`delegate_to`, `question`, `thought`, `depth`,
> `duration_ms`, `pack_id`, `provider_id`, `model_id`, …) are routing /
> bookkeeping. Generic clients ignore the envelope; it is a clio vendor
> extension.

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
  "permission_default": "ask"        // "allow" | "ask" | "deny"
}
```

> **Implemented (clio).** `permission_default` is a constant `"ask"`
> placeholder on every catalog row — it is **never consulted by the
> enforcement gate**. Whether a call actually prompts is decided by the
> destructive-substring classifier + the policy list (§6.11), not this
> field. Treat it as advisory display metadata against clio.

### 4.7 PermissionRequest

Implemented shape (clio `permission_gate.py`) — the row is THIN:

```json
{
  "id": "perm_<12hex>",
  "session_id": "sess_...",
  "tool_call": {
    "tool_name": "string",
    "input": {}
  },
  "summary": "string",               // human-readable preview ("Run: rm -rf /tmp/x")
  "created_at": "...",
  "status": "pending"                // lifecycle — see below
}
```

There is **no** `subsession_id`, `call_id`, `server_id`, or
`annotations` on clio's wire (those were v0.1 sketch fields).

Rows gain fields on resolution:

- `status`: `pending` | `resolved` (user-resolved) | `auto_approved` /
  `auto_denied` (policy / mode / direct-route resolutions) | `timeout`
  (600 s interactive timeout — resolved as deny, **no
  `permission.resolved` event is emitted for timeouts**).
- `action`: `allow` | `deny` | `allow_session` | `allow_workspace`.
- `resolved_at`: RFC 3339.
- `reason?`: set on auto-resolutions (`policy_deny`, `policy_allow`,
  `session_mode_readonly`, `user_requested_*`, …).
- `policy?`: the derived sticky policy attached when the resolution was
  `allow_session` / `allow_workspace` (§6.11).

Replied to via `POST /v1/permissions/{id}` with body `{"action": "allow"|"deny"|"allow_session"|"allow_workspace"}`.

---

## §5 Authentication

Backends MUST support at least one of:

- **`trust_socket`**: connections accepted only over Unix socket / named pipe; identity is implicit (current user). No header required.
- **`bearer`**: `Authorization: Bearer <token>` header. Token configured out-of-band.

Backends MAY support additional schemes (basic, OAuth, mTLS) and report them in `capabilities.auth.schemes`.

The active scheme is reported as `capabilities.auth.current`. The TUI uses this to decide whether to prompt for credentials at startup.

For SSE streams, the bearer token MAY also be passed as a query parameter `?auth_token=...` since some browsers do not allow custom headers on `EventSource`. Backends supporting bearer auth MUST also accept `?auth_token=...`.

> **Implemented (clio 3527143).** The reference backend reports
> `{"schemes": ["trust_socket"], "current": "trust_socket"}` — it does
> not implement `bearer` today. Clients SHOULD read `auth.schemes`
> rather than assume `bearer` is available.
>
> **What clio's `trust_socket` actually means (descriptive):** it is
> **unauthenticated TCP**, default bind `127.0.0.1:8100` — NOT a Unix
> socket. There is no bearer header and no `?auth_token` support on
> REST or SSE; identity is implicit in transport reachability
> (whoever can reach the port is the user). Browser access is gated
> only by the CORS origin allowlist (default
> `localhost:3000/4173/5173`, `allow_credentials=false`). Operators
> MUST NOT bind a non-loopback interface without an external auth
> layer (reverse proxy, tunnel, firewall).

---

## §6 Endpoints

Notation: `METHOD /path` followed by request body schema (if any) and response schema. Error responses follow §6.0.

### §6.0 Error format

All errors return an `error` wrapper. The v0.1 sketch used
`{error: {code, message, details}}`; the implemented v0.2 backend wraps
the §14 `ErrorInfo` envelope inside the same `error` key, so the inner
object gains fields rather than changing shape:

```json
// Implemented (clio 3527143) — every 4xx/5xx
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

Carve-outs and caveats (clio 3527143):

- `GET /v1/health` returns **503 with the HealthResponse body** (not an
  ErrorEnvelope) when `overall_status = "unavailable"` — the only
  non-envelope 4xx/5xx on the surface.
- `retry_after_s` is **never emitted** by clio today (always omitted
  via `exclude_none`).
- **404 tag inconsistency**: most session-lookup 404s currently emit
  `error: "internal_error"` (legacy), while newer routes (compact,
  rewind target, questions, attempts, message/file lookups) emit
  `error: "not_found"`. **`not_found` is the canonical tag** — new code
  MUST use it — but clients MUST tolerate the legacy `internal_error`
  emissions on 404 until clio finishes migrating (§14.2).

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
> a `storage_root` field. `POST` returns `201`. Workspace wire rows
> always include a **derived `storage_root`**. `PATCH` accepts
> `{name?, root_path?, metadata?}` plus `config` as a metadata alias,
> and **merges** metadata (no key removal); a malformed body is
> ignored. `DELETE` returns **409 `permission_error` for `ws_default`**
> (the implicit default workspace is undeletable), runs the
> direct-destructive-action permission policy (§6.11 — a policy `deny`
> auto-denies with 403) and records a resolved audit row in
> `/v1/permissions`; otherwise `204`. Workspace-scoped file routes
> (`/v1/workspaces/{id}/files`, `/files/read`, `/repo_map`) are in
> §6.9.

### §6.2 Sessions

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions` | query: `workspace_id?` (default scope `ws_default`), `include_all_workspaces?: bool`, `archived?: bool` (omitted = active-only, `true` = archived-only, `false` = active-only) | `{sessions: Session[]}` newest-first by `created_at`. **No `next_cursor`/`limit`/`before`/`parent_session_id`** (not implemented — `parent_session_id` reserved for future use; clio silently ignores it, so a subsession UI filtering on it would see ALL sessions) |
| POST | `/v1/sessions` | `{workspace_id? = "ws_default", title?, model?, agent?, mode? = "chat", edit_mode? = "diff", routing_mode? = "auto", metadata?}` — no `parent_session_id`/`fork_at_message_id` (forking is `/fork`) | `Session`, `200`. Unknown workspace → 404 (legacy tag `internal_error`). **No `session.created` event** is emitted |
| GET | `/v1/sessions/{id}` | query: `workspace_id?` — on mismatch → **403 `permission_error`** with `details.scope: "other_workspace"` | `Session` |
| PATCH | `/v1/sessions/{id}` | `{title?, model?, agent?, mode?, edit_mode?, routing_mode?, metadata?, archived?}` — `metadata` **merges shallowly** (never replaces; e.g. `metadata.pinned` survives unrelated patches) | `Session`; publishes `session.updated` with the **full Session object** as payload (§7.3a) |
| DELETE | `/v1/sessions/{id}` | — | `204`. Policy-gated (§6.11 direct destructive action: policy deny → **403 `permission_error`**; auto-approved deletes are audited as resolved rows in `/v1/permissions`). Cascades: messages, context-file ledger, ARC footprint, workspace mirror. **No `session.deleted` event today** — see the PROPOSED note below |
| POST | `/v1/sessions/{id}/fork` | `{at_message_id?, title?}` (malformed JSON tolerated as `{}`) | `Session` (new), **201**. `at_message_id` truncation is **inclusive**; an unknown id silently copies all messages. Context files copied. `mode`/`edit_mode`/`routing_mode`/`model`/`agent`/`metadata` **NOT inherited** (fork gets store defaults). No SSE event |
| POST | `/v1/sessions/{id}/cancel` | — | **204 always** (idle race tolerated). Best-effort: cooperative flag + event, 0.1 s grace, then asyncio task cancel. Session flips to `cancelled` **immediately** (even when idle). See the cancellation note below |
| POST | `/v1/sessions/{id}/summarize` | `{auto?, instructions?}` | **[NOT IMPLEMENTED in clio 3527143 — returns 404; `session_summary` is truthfully advertised `false`. Use `/compact` (§6.25).]** |
| GET | `/v1/sessions/{id}/export` | — | `application/json` blob `{version: "1", session, workspace, messages, context_files}` |
| POST | `/v1/sessions/import` | export blob | `Session` — creates a **fresh** session carrying only `title` + `metadata` (modes/model/rollups recomputed or dropped); malformed messages are skipped silently |
| POST | `/v1/sessions/{id}/undo` | `{count?: int}` (alias key `message_count` also read; `count < 1` → 422; non-object body → 422; invalid JSON tolerated as `{count: 1}`) | rollback envelope — see below (also §6.10) |
| POST | `/v1/sessions/{id}/rewind` | target key `message_id` (canonical) \| `target_message_id` \| `to_message_id`; `include_target?: bool = false`; unknown target → **404 `not_found`** | rollback envelope with `operation: "rewind"` — see below (also §6.10) |

**Rollback envelope (undo/rewind response).** Both routes return the
same eight-key envelope:

```json
{
  "session_id": "sess_...",
  "operation": "undo",                       // "undo" | "rewind"
  "deleted_message_ids": ["msg_...", ...],   // canonical — read this one
  "deleted_messages": ["msg_...", ...],      // alias of deleted_message_ids (IDs, not objects)
  "reverted_message_ids": ["msg_...", ...],  // alias of deleted_message_ids
  "message_count": 2,
  "memory_scope": "gact_visible_transcript_only",
  "session": { /* full Session */ }
}
```

The key `reverted_messages` does **NOT exist** on the wire (a v0.1
sketch that never shipped). `target_message_id`/`include_target` are
NOT in the rewind HTTP response — they appear only in the
`session.rewind` event payload and `metadata.last_rollback`. Undo
counts **messages** (any role), not turns; `count > len` deletes
everything without error. Both routes: **409 `conflict`** while the
session is `running`/`waiting_permission`; the destructive-action
policy guard applies (403 possible). Side effects: session status
forced `idle`; `metadata.last_rollback` stamped
`{operation, deleted_message_ids, target_message_id, include_target,
memory_scope, occurred_at}`. Event order after commit: per-message
`message.deleted {message_id, session_id, operation}` → `session.undo`
/ `session.rewind` → `session.updated` (full Session) — §7.3a.

**Cancellation (clio, best-effort).** `POST /cancel` sets a
cooperative cancel flag + per-turn event (polled at planner/expert/tool
boundaries), records a cancellation attempt
`{id: "canc_…", requested_at, in_flight, cooperative_signal_sent,
asyncio_task_cancel_scheduled, asyncio_task_cancel_sent,
hard_abort_supported: false, upstream_abort: "not_supported",
executor_work_may_continue}`, then after a **0.1 s grace** hard-cancels
the asyncio task if still running. The resulting
`session.status_changed` carries vendor extras:
`execution_cancellation: "none" | "cooperative_pending" |
"turn_boundary" | "best_effort"`, `executor_work_may_continue`, and the
`cancellation_attempt` summary. **There is no `session.cancelled`
event type** — the transition rides `session.status_changed`.

> **PROPOSED addition — `session.deleted` event.** DELETE currently
> emits nothing, so a session deleted by another client is
> unobservable (lists are workspace+archive filtered, so refetch
> inference is unreliable). Per the owner's decision on
> iowarp/gact-tui#232, a broadcast `session.deleted`
> `{session_id, workspace_id}` event is the agreed fix so clients can
> drop per-session state deterministically — tracked as a clio issue;
> **not current behavior**, do not depend on it yet.

### §6.3 Messages

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/messages` | query params **NOT honored** (`before`/`limit`/`include_system` silently ignored) | `{messages: Message[] newest-first, next_cursor: null (always)}` — the full ledger, unbounded. May include one **live in-flight assistant message** (`metadata: {live: true, status: "running"}`) while a turn is streaming |
| GET | `/v1/sessions/{id}/messages/{msg_id}` | — | `Message`; 404 `not_found` |
| POST | `/v1/sessions/{id}/messages` | `{parts: Part[], text?, model?, agent?, agent_id?, metadata?}` | `{message_id, accepted_at}`, HTTP **200** |
| DELETE | `/v1/sessions/{id}/messages/{msg_id}` | — | `204` |
| DELETE | `/v1/messages/{msg_id}` | query: `session_id?` | `204` (clio also exposes this session-less delete alias) |
| PATCH | `/v1/sessions/{id}/messages/{msg_id}/parts/{part_id}` | partial part | **[NOT IMPLEMENTED in clio 3527143.]** |
| GET | `/v1/sessions/{id}/messages/search` | query: `q` | `{matches: SearchMatch[]}` (gated by `search_messages`; clio takes `q` only, no cursor; empty `q` → `{matches: []}`) |

> **Drift note.** `POST /messages` body: clio accepts either
> `parts: Part[]` or a convenience `text: string`, plus a per-turn
> agent override via `agent: AgentRef` or `agent_id: string`. The ack
> is a synchronous HTTP **200** `{message_id, accepted_at}` (the v0.1
> sketch said `202`); the user message, its `message.created` event,
> and `session.status_changed(running)` are all published **before**
> the ack returns. The assistant turn then streams asynchronously over
> SSE (§7). `image` parts in the body are preserved when
> `multimodal_image_parts=true`.
>
> **No concurrency guard**: posting while the session is `running`
> starts a second concurrent turn (the newest turn wins the in-flight
> tracking). The `prev_status` in the resulting
> `session.status_changed` is hardcoded `"idle"`.
>
> **POST error paths** (clio): 404 session-not-found (legacy tag
> `internal_error`); 503 `provider_configuring` while LM config is in
> flight; 503 `agent_not_available` with `details.agent_status ∈
> {starting, failed, not_configured}` + `details.recovery_actions[]`;
> 501 unsupported model ref (a per-message or session model override
> that doesn't match the active model — a stale *session* override is
> silently cleared instead when an active model exists); 501 for image
> parts without vision support; 422 when the body has neither text nor
> image parts.
>
> Messages serialize via `to_wire()` (§4.4) — reload is byte-identical
> to the live stream.

```json
// SearchMatch (implemented — no created_at)
{
  "message_id": "msg_...",
  "part_id": "part_...",
  "snippet": "...{q}... with surrounding context",
  "score": 0.87
}
```

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
| POST | `/v1/sessions/{id}/context/files` | `{path (optionally "@"-prefixed → source:"mention"), mode? = "read", workspace_id?, size?, last_modified?, language?}` — upserts by path | `ContextFile` |
| DELETE | `/v1/sessions/{id}/context/files` | `{path}` | `204` (idempotent; matches `path`/`display_path`/`resolved_path`) |
| GET | `/v1/workspaces/{id}/files` | — | `{entries: FileEntry[]}` (workspace tree) |
| GET | `/v1/workspaces/{id}/files/read` | query: `path` | file content — see serving rules below |
| GET | `/v1/workspaces/{id}/repo_map` | — | `{tree: RepoMapNode, tokens: int, truncated: bool}` |

Implemented shapes (clio):

- **`ContextFile`** = `{path, display_path, resolved_path,
  workspace_id, source: "mention"|"api", mode, added_at,
  last_modified, size, language}`. **Absolute paths are accepted
  verbatim (NOT workspace-bounded)**; relative paths are bounded (403
  `path_outside_workspace` on escape). `read`/`pin` modes require an
  existing regular file (404 / 422 `context_file_error` with
  `recovery_actions`); `edit` does not. Context files persist across
  restarts (`context_files.json`).
- **`FileEntry`** = `{path (relative to root_path, native separators),
  type: "file"|"dir", size?: int, modified?: ISO-8601 Z}`. The walk is
  capped at **5000 entries**, skips VCS/cache/build/vendor dirs, and
  excludes symlinks unless the file policy allows them. A missing root
  returns `{entries: []}` — not an error.
- **`RepoMapNode`** = `{name, path (/-normalized, root path ""), type,
  children?, size?}`; `tokens` = Σ max(1, size/4); `truncated: true`
  when the 5000-entry cap was hit. **clio serves NO tree-sitter code
  outlines** — nodes are plain name/path/type/size. (Outlines remain
  valid for backends that support them.)
- **`/files/read` serving rules**: textual files (`text/*` MIME,
  JSON/XML/JS/YAML/sh/TOML, or sniffed UTF-8) are served **decoded**
  as `text/plain; charset=utf-8`; binary files are served as raw bytes
  with the real guessed content type (else
  `application/octet-stream`). Errors: 400 `invalid_path`, 403
  `path_outside_workspace`, 404 `not_found`, 413 `file_too_large`
  (policy `max_file_size_bytes`), 500 `read_failed`.

> **Drift note.** `PATCH /v1/sessions/{id}/context/files` is **[NOT
> IMPLEMENTED in clio 3527143]** — to change a file's mode, DELETE +
> re-POST. The old "context file content" route is gone in favor of the
> workspace-scoped `/v1/workspaces/{id}/files` + `/files/read`. clio
> also adds two **vendor** context-introspection routes (gated by
> `x_clio_context_frames`):
>
> | Method | Path | Response |
> |---|---|---|
> | GET | `/v1/sessions/{id}/context/frames` (query `limit?` — clamped to 1..200, default 50) | `{frames: ContextFrame[]}` — per-turn assembled-context snapshots (what was actually fed to the model: items with `kind`, `included`, `reason`, `tokens_estimated`) |
> | GET | `/v1/sessions/{id}/context/frames/{frame_id}` | `{frame: ContextFrame}` (wrapped, not a bare ContextFrame) |
> | GET | `/v1/sessions/{id}/context/policy` | `SessionContextPolicy` — effective memory/context policy (memory scope, cross-session-read availability, consent flags) |
> | GET | `/v1/sessions/{id}/context/state` (query `scope?=<expert>`) | `ContextStateResponse` — per-expert context-usage snapshot (token fullness, auto-compaction line, `/context-style` category buckets) |
> | POST | `/v1/sessions/{id}/context/compact` (query `scope?=<expert>`) | `ContextStateResponse` — LLM-summarizes the live working set into one summary segment, then returns the updated state |
>
> **`/context/state`** is the per-expert context-usage view. `scope` selects
> the expert lane; omit it for the session-default expert. The response is
> back-compatible (clients ignore unknown fields):
>
> ```json
> // ContextStateResponse
> {
>   "session_id": "...",
>   "scope": "<expert>",              // echoes the requested scope ("" = default)
>   "as_of": 1700000000000,            // epoch millis of the snapshot, or null
>   "window_tokens": 200000,           // model context window; 0 = unknown
>   "live_tokens": 12000,              // segment-store attribution sum
>   "pct_used": 0.06,                  // live_tokens/window_tokens, or null
>   "used_tokens": 15500,              // NEW: REAL prompt tokens from the last LM call; null between turns
>   "used_pct": 0.0775,                // NEW: used_tokens/window_tokens; null when unavailable
>   "autocompact_pct": 0.85,           // NEW: auto-compaction trigger fraction in (0,1]; default 0.85
>   "live_block_count": 7,
>   "tokens_by_kind": { "<SegmentKind>": 8000 },
>   "categories": {                    // NEW: /context-style buckets; zero buckets dropped
>     "system": 0, "messages": 8000, "tools": 0, "reasoning": 0,
>     "tool_calls": 4000, "observations": 0, "summary": 0, "io": 0, "other": 0,
>     "framing": 3500                  //   synthetic = used_tokens - live_tokens; present only when used_tokens>0 and framing>0
>   },
>   "segments": [ /* attributed working-set rows */ ],
>   "render_text": "...",              // pre-rendered one-line summary
>   "render_keys": { /* ... */ }
> }
> ```
>
> **Fullness** = `used_pct` (model-grounded, preferred) else `pct_used`; draw
> the auto-compaction line on the bar at `autocompact_pct`; absolute usage =
> `used_tokens` (or `live_tokens` when `used_tokens` is null) / `window_tokens`.
> `categories` keys are drawn from `system | messages | tools | reasoning |
> tool_calls | observations | summary | io | other`, plus the synthetic
> `framing` key.
>
> **`/context/compact`** summarizes the live working set into a single summary
> segment and returns the post-compaction `ContextStateResponse` for the same
> `scope`. Errors: `409 {"error": "nothing_to_compact"}` (no live segments),
> `503 {"error": "compaction_unavailable"}` (no LM bound / summary failed),
> `404` session not found. (These two routes use the flat `{"error": "..."}`
> envelope, not the §14 object form.)
>
> Both routes are gated by the same `x_clio_context_frames` capability as the
> frame routes above.

### §6.10 Diffs

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/diffs` | — | `{diffs: FileDiff[]}` — **ALL** diff rows for the session (statuses `pending`/`applied`/`rejected`/`apply_failed`), not just proposed-but-not-applied |
| GET | `/v1/sessions/{id}/messages/{msg_id}/diffs` | — | `{diffs: FileDiff[]}` (per-message; unknown message → 404 `not_found`) |
| POST | `/v1/sessions/{id}/diffs/apply` | `{paths?: string[]}` | `{applied: string[], write_errors?: {path: string}}` |
| POST | `/v1/sessions/{id}/diffs/reject` | `{paths?: string[]}` | `{rejected: string[]}` |
| POST | `/v1/sessions/{id}/undo` | `{count?: int}` | rollback envelope (§6.2) |
| POST | `/v1/sessions/{id}/rewind` | `{message_id \| target_message_id \| to_message_id, include_target?: bool}` | rollback envelope (§6.2) (MMM7) |

Implemented diff row shape (clio):

```json
{
  "path": "src/main.go",
  "applied": false,          // DERIVED compat bool: status == "applied"
  "status": "pending",       // canonical: pending | applied | rejected | apply_failed
  "unified_diff": "...",     // optional
  "part_id": "part_...",     // optional
  "message_id": "msg_..."    // optional
}
```

`new_content`/`edit_mode`/`lines_added`/`lines_removed` appear **only
on the `file_diff` Part** (§4.5), never in diff rows. Diff rows are
**in-memory only** — they do not survive a server restart (the
`file_diff` parts in messages do).

**Apply semantics** (clio): only `status == "pending"` rows are
targeted (omitted/empty `paths` = all pending). Applied / rejected /
`apply_failed` rows are silently skipped — **a failed write cannot be
retried via this endpoint**. A failed write flips the row to
`apply_failed` and emits `file.diff.write_failed`; `write_errors`
values are error-repr strings. Rows without `new_content` are marked
applied **without a disk write** (legacy path). The write is a
whole-file replacement gated by workspace root + file policy +
permission policy (auto-audited in `/v1/permissions` with reason
`user_clicked_apply` — no interactive prompt) and refused under
`session.mode` `plan`/`architect`. 200 even when nothing matched.

`/rewind` deletes every message after the target in the named session.
With `include_target=true`, it also deletes that message itself.
Different from `/undo` (which counts backward from the tail) — useful
when the user has scrolled and wants to fork off a known checkpoint.
Full body/response semantics in §6.2.

### §6.11 Permissions

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/permissions` | query: `session_id?`, `status?` (any status value or `all`; default all), `limit` (default 100, max 500) | `{permissions: PermissionRequest[] (desc by created_at), metadata: {session_id, status, limit, total, returned, truncated, total_before_filters, total_after_session_filter}}` |
| GET | `/v1/permissions/{id}` | — | `PermissionRequest` **[NOT IMPLEMENTED in clio 3527143 — clio exposes only the list + the reply POST.]** |
| POST | `/v1/permissions/{id}` | `{action: "allow"\|"deny"\|"allow_session"\|"allow_workspace"}` | `204`. **Idempotent**: POST on an already-resolved row is a silent 204 (no event re-emit). 404/422 currently use the legacy tag `internal_error` (clio inconsistency; target taxonomy `not_found`/`bad_request` — §14.2) |
| GET | `/v1/policies` | — | `{policies: Policy[]}` |
| PUT | `/v1/policies` | `{policies: Policy[]}` | `{policies: Policy[]}` — **atomic validation**: 400 if the body is not `{policies: [...]}`; 422 rejecting the WHOLE update if any row is invalid, with `details: {policy_errors[], allowed_scopes, allowed_actions}` |

**Sticky grants** (clio #759, Phase 0): resolving with `allow_session`
/ `allow_workspace` additionally derives a sticky allow policy
`{scope, scope_id, tool_name_pattern: <exact tool>, path_pattern?:
<exact path>, action: "allow", created_from_permission_id}`, appends it
to `/v1/policies`, and **persists it to disk**
(`permission_policies.json` — survives restart). The derived policy is
attached to the resolved row as `.policy`.

```json
// Policy (implemented)
{
  "scope": "workspace|session",
  "scope_id": "...",                 // empty = wildcard within scope
  "tool_name_pattern": "shell|edit|*",   // fnmatch glob, default "*"
  "path_pattern": "/src/**|*",           // fnmatch glob, optional
  "action": "allow|allow_session|allow_workspace|deny|ask"
}
```

Policy semantics (clio's evaluator, descriptive):

- Action enum is `allow | allow_session | allow_workspace | deny |
  ask` — `allow_session`/`allow_workspace` enforce identically to
  `allow`. The v0.1 `annotations_filter` key is **not evaluated**
  (stored if sent, ignored).
- Matching: **first match wins in list order**; empty `scope_id`
  matches every session/workspace in scope; the path is extracted from
  args `filepath|path|output_path|target_path` and matched both raw
  and resolved.
- Action `ask` matches but merely falls through to the rest of the
  gate (it does NOT defeat the safe-shell fast-allow below).
- Policies are consulted **ONLY for destructive-classified tool calls
  and direct destructive routes** — non-destructive tools bypass
  policies entirely (a `deny` policy on a non-destructive tool is
  unenforced).

**Gate semantics (clio, vendor-descriptive).** A tool call is
destructive-classified when its lowercase name contains one of
`delete | remove | rm_ | drop | destroy | exec | shell | write`.
The gate then runs in order:

1. user `pre_tool` hook veto → deny with NO row and NO event;
2. non-destructive → fast-allow (policies never consulted);
3. session `mode` ∈ {`plan`, `architect`} → auto-deny: `auto_denied`
   row + `permission.resolved` with reason `session_mode_readonly`, NO
   `permission.requested`;
4. policy deny → `auto_denied` row + resolved event, reason
   `policy_deny`;
5. policy allow (any allow action) → `auto_approved` row + resolved
   event, reason `policy_<action>`;
6. safe-shell diagnostic fast-allow (read-only diagnostic chains and
   tmp-file text-reshape pipelines) → allow with NO row/event;
7. otherwise interactive: `pending` row + `permission.requested` +
   the turn blocks for up to **600 s**. On timeout the row's status
   becomes `timeout`, the call is denied, and **NO
   `permission.resolved` event is emitted** — clients must not wait on
   a resolved event for timeouts.

**Session status during a pending permission**: the session stays
`running` (clio never enters `waiting_permission`, §4.2) — pendency is
observable only via `permission.requested` +
`GET /v1/permissions?status=pending`.

> **`x_clio_direct_delete_permissions=true`** (vendor): 12+ direct
> DELETE-ish routes (sessions, workspaces, messages, agents, hooks,
> MCP servers, schedules, diffs, catalog, …) run the same policy guard
> with synthetic tool names namespaced `gact.*` (e.g.
> `gact.session.delete`). Policy deny ⇒ `auto_denied` audit row + 403
> `permission_error` with `details: {reason: "policy_deny",
> recovery_actions: ["change_policy", "retry", "exit"]}`; otherwise an
> `auto_approved` audit row (reason `policy_allow` or
> `user_requested_*`) + `permission.resolved` event — **never an
> interactive prompt**. Consequence: clients WILL receive
> `permission.resolved` events with no matching `permission.requested`
> (every auto/direct resolution) — a client keying resolved→requested
> must tolerate unmatched ids.

Backends MAY implement policies as simple per-tool toggles, or as rich rule engines (Gemini-style TOML with folder trust + shell safety). The contract specifies the data shape, not the evaluator.

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

If `capabilities.scheduled_sessions = true`. Implemented in clio 3527143
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

Implemented `UserQuestion` (clio `types.py:UserQuestion`):

```json
{
  "id": "ques_<12hex>",
  "session_id": "sess_...",
  "prompt": "string",
  "status": "pending",               // pending | answered | cancelled | expired
  "kind": "freeform",                // freeform | choice | confirmation
  "options": [{"label": "", "value": "", "description": ""}],
  "created_at": "...", "updated_at": "...", "expires_at": "",
  "source": "orchestrator",
  "turn_id": "", "attempt_id": "",
  "answer": "", "selected_options": [],
  "answer_metadata": {}, "metadata": {}
}
```

Semantics (clio, descriptive):

- **`expired` is declared but inert** — clio never sets it; `expires_at`
  is stored, not enforced; **clio emits no `user_question.expired`
  event**. (The event type is still valid spec surface: the emulator
  emits it and the web keeps a listener — §7.3b.)
- `kind: "confirmation"` with no options auto-injects Yes/No options.
- `POST /questions`: 422 `bad_request` on empty prompt; always flips
  the session to `waiting_user` + stamps
  `metadata.pending_user_question_id`; emits `user_question.created`
  with the full row.
- `POST .../answer`: 404 `not_found` unknown/wrong-session; **409**
  (tag `bad_request`) if not pending; **422** (tag `bad_request`) if
  any `selected_options` entry is outside the question's option
  value/label set (only enforced when the question has options).
- **Ask-user turn lifecycle**: an orchestrator-raised question ends
  the turn **WITHOUT a `message.completed` event** — the boundary is
  `session.status_changed → waiting_user` (whose payload includes
  `pending_user_question_id`). Answering the last pending question
  whose `metadata.resume_on_answer` is set stages a NEW turn with a
  server-synthesized `"[Answer to agent question]"` user message
  (visible in `GET /messages`) and emits `user_question.resumed`
  `{question_id, session_id, queued_user_message_id, source_turn_id}`
  **BEFORE** `user_question.answered`.
- `POST .../cancel` on a non-pending question still 200s and re-emits
  `user_question.cancelled` with the row as-is.

Lifecycle is mirrored on SSE via the `user_question.*` events (§7.3):
`created`/`answered`/`cancelled` carry the full UserQuestion dump;
`resumed` carries the 4-key dict above. Orchestrator-raised questions
also produce a `semantic.event`.

## §6.24 Turn retry / attempts (vendor — `x_clio_retry_attempts`)

Re-run a turn (optionally with notes / a different model) without
re-typing the user message. Optional.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sessions/{id}/attempts` | — | `{attempts: [TurnAttempt]}` (unknown session → 404 `not_found`) |
| POST | `/v1/sessions/{id}/messages/{msg_id}/retry` | `RetryTurnRequest` `{notes?, execute?, model?, provider_id?, model_id?}` | `TurnAttempt`, HTTP **202** |

Implemented `TurnAttempt`:

```json
{
  "id": "att_...",
  "session_id": "sess_...",
  "source_message_id": "msg_...",    // the USER message being retried
  "status": "recorded",              // recorded | queued | running | completed | failed | cancelled
  "notes": "", "model": {}, "warning": "", "metadata": {}
}
```

Semantics (clio):

- `execute: false` records the attempt only (`status: "recorded"`).
- Pointing `msg_id` at an **assistant** message resolves back to the
  source user message of that turn.
- `notes` are appended to the re-run prompt as a `"[Retry notes]"`
  block.
- A `model` override that doesn't match the active model produces a
  `warning` (when recorded) or a **422 unsupported-model error** (when
  executing).
- An execute request blocked from running settles the attempt as
  `status: "failed"` with `metadata.execution_blocked_reason`.
- Lifecycle rides SSE as `turn.retry_requested` /
  `turn.retry_running` / `turn.retry_completed` / `turn.retry_failed`
  / `turn.retry_cancelled`, each with the full TurnAttempt as payload
  (§7.3a).

## §6.25 Compaction

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/sessions/{id}/compact` | `{focus?: string}` (malformed body tolerated) | 200 `{session_id, compacted: true, event_id: "mem_evt_...", archived_count: int, summary: string}` — or 200 `{session_id, compacted: false, reason}` when there is nothing to compact |

Errors: 404 `not_found` (unknown session — note: this route uses the
canonical tag), 503 `agent_unavailable` (no LM agent bound), 502
`upstream_error` (summarization failed), 500 `memory_update_failed`
(ARC store failure).

Behavior (clio 3527143, descriptive):

- The transcript source is the text parts of the **last 50 messages**.
- On success the visible ledger is **REPLACED by ONE synthetic
  assistant `text` message** (`msg_compact_*`) whose single part
  carries `metadata.synthetic: "compact_summary"` +
  `memory_event_id`. **There is no `compaction` part type** on clio's
  wire (§4.5, §10 item 3).
- The original messages are archived **in-memory only**
  (process-lifetime); the ARC conversation is replaced with the
  summary when ARC is configured.
- Emits `session.compacted` with payload `{event_id, archived_count,
  summary_chars, summary_message_id, version: 1}` (§7.3a) plus a
  `memory.compacted` semantic event (semantic spine only, §7.6).

This is the implemented path for both history compaction and the
user-facing summary (the `/summarize` route is not registered and
`session_summary` is truthfully advertised `false` — see §6.2).

---

## §7 Streaming Events (SSE)

### §7.1 Subscription

**Implemented (clio 3527143): SSE is session-scoped only.**

- `GET /v1/sessions/{id}/events` — events for one session.

> **Drift note.** The v0.1 sketch also defined a global
> `GET /v1/events?workspace_id=...` workspace-wide stream. That route is
> **[NOT IMPLEMENTED in clio 3527143]** (returns `404`). A client driving
> clio subscribes per session. The global stream remains valid spec
> surface for backends that want it, but MUST NOT be assumed present —
> read it as optional and probe.

**Connection preamble.** On connect clio sends `server.connected`
immediately, then a `session.snapshot` event (authoritative
`{session_id, status, updated_at, authoritative: true}`) so the client
can reconcile state, then replayed + live events. The preamble always
carries **`id: 0`**, is re-sent on every (re)connect, and is NOT part
of the replay timeline. All real event ids are **≥ 1, strictly
ascending per session but non-contiguous** (ids come from a single
process-global counter shared across sessions and global events).
Response headers: `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no`.

**Replay (`Last-Event-ID`).** Reconnection uses standard SSE
`Last-Event-ID` (unparseable → treated as 0). Replay yields only
events with `id > Last-Event-ID` from a per-session buffer bounded at
**256 non-transient events**, merged with global (`session_id = ""`)
events, ordered by id. Replayed events keep their original `id` and
`occurred_at` and carry **`replay: true`** in the envelope (§7.2);
live duplicates of already-replayed ids are suppressed, so
replay-vs-live duplication cannot occur. Resume beyond the 256-event
window is NOT gap-free — clients recover via `GET /messages` refetch.
Slow consumers may lose events silently (subscriber queue depth 256,
drop-on-full) — same recovery.

**Heartbeats are TRANSIENT.** A `server.heartbeat` (`{}` payload) is
emitted at least every 15 seconds per attached connection (multiple
clients on one session may observe more). Heartbeats are delivered to
live subscribers only — they are **never recorded in replay history**
(so an idle hour cannot evict real events from the resume window; clio
#761) and never counted as turn progress.

**Global events.** Events published with `session_id = ""`
(`lm.provider.changed`/`lm.provider.failed`, `mcp.server.error`/
`mcp.server.reconnected`) fan out to EVERY live session stream and
appear in every session's replay merge.

### §7.2 Event envelope

Every SSE event has the shape:

```
event: <event_type>
id: <monotonic event id>
data: { "type": "<event_type>", "occurred_at": "...", "payload": { ... }, "replay": true? }
```

The `event:` line and `data.type` are redundant on purpose — clients SHOULD use `data.type` (it survives JSON-only inspection) and may use `event:` for native SSE listener routing.

`replay?: true` is present **only** on events re-delivered from the
replay buffer (§7.1); live events omit the key.

### §7.3 Event taxonomy

Event types are namespaced by resource. Unknown types MUST be tolerated and ignored by clients that don't recognize them.

#### §7.3a Implemented event set (clio 3527143)

These are the wire event `type` values the reference backend actually
publishes on `GET /v1/sessions/{id}/events`. The message-streaming core
(`server.*`, `session.status_changed`, `message.*`) matches the v0.1
sketch; the rest reflect clio's resource model.

| Type | When emitted | Payload |
|---|---|---|
| `server.connected` | On stream open (id 0, preamble) | `{server_version}` |
| `server.heartbeat` | ≥ every 15s per attached connection; TRANSIENT (never replayed, §7.1) | `{}` |
| `session.snapshot` | Right after `server.connected` (id 0, preamble) | `{session_id, status, updated_at, authoritative: true}` |
| `session.status_changed` | status transition | `{session_id, status, prev_status?, updated_at, reason?, pending_user_question_id?}`; on `/cancel` additionally `{execution_cancellation: "cooperative_pending"\|"none"\|"turn_boundary"\|"best_effort", executor_work_may_continue, cancellation_attempt}`. **No `session.cancelled` event type exists** |
| `session.updated` | PATCH `/v1/sessions/{id}` and after undo/rewind (only) | payload IS the **full Session object** (model_dump; zero-values present) |
| `session.compacted` | `/compact` succeeded (§6.25) | `{event_id, archived_count, summary_chars, summary_message_id, version: 1}` |
| `session.cleared` | `/clear` backend command wiped the ledger (policy-guarded) | `{session_id}` |
| `session.undo` / `session.rewind` | rollback committed (§6.2) — after per-message `message.deleted`, before `session.updated` | `{session_id, deleted_message_ids, target_message_id, include_target}` (`target_message_id: ""` / `include_target: false` for undo) |
| `message.created` | new message frame (user msg, streamed assistant frame, finalize assistant frame, tool-observer frame) | payload IS the **flat wire Message** (`Message.to_wire()`) — **NOT** `{message: Message}`. Assistant frames arrive with `parts: []` and a `turn_id`. No `role: "tool"` messages are emitted (tool results are `tool_result` parts on the assistant message) |
| `message.part.added` | new part appended | `{turn_id, message_id, stream_source: "live"\|"batch", part}` |
| `message.part.delta` | streaming part delta | `{turn_id, message_id, part_id, stream_source: "live", signature_field_name, delta: {text_append}}` — thinking parts ALSO use `text_append` (§7.5) |
| `message.part.completed` | part finalized | `{turn_id, message_id, part_id, stream_source, final_text, stream_fallback?}` — **`final_text` is authoritative**: clients MUST replace buffered deltas with it. A streamed part whose text cleans to empty is dropped and never receives `part.completed` |
| `message.completed` | turn settled | `{turn_id, message_id, stop_reason: end_turn\|error\|cancelled\|blocked, tokens, cost_usd, error_info?, metadata?}` — exactly one per turn EXCEPT the ask-user pause (none, §6.23). Turn failures surface as `error_info` here + `session.status_changed(error)`; there is no `message.error` event |
| `message.deleted` | message removed | `{message_id, session_id, operation?}` (`operation` = `undo`\|`rewind` on rollback) |
| `tool.call.started` | tool exec start | `{call_id, tool, args, telemetry_source}` (key is `tool`, not `tool_name`) |
| `tool.call.completed` | tool exec finish | `{call_id, tool, ok, duration_ms, cached, telemetry_source, error?, result? (bounded), execution_cancellation?, executor_work_may_continue?}` (key is `ok`, not `is_error`) |
| `tool.selection.invalid` | router picked an unavailable tool | vendor |
| `permission.requested` | interactive gate blocked (§6.11) | payload IS the **flat PermissionRequest row** (§4.7) — NOT `{permission: ...}`. Replayed copies may show post-resolution `status`/`action` (the payload is mutated by reference) |
| `permission.resolved` | resolution (user or auto) | `{permission_id, action, session_id, reason?}` — arrives WITHOUT a matching `requested` event for all auto/direct resolutions |
| `subagent.started` / `subagent.completed` | subsession lifecycle | §4.3 |
| `turn.started` / `turn.completed` | dual-namespace turn lifecycle (§7.3c) | `{turn_id, agent_id}` / `{turn_id}`. **`turn.failed` is NOT a bus event** (semantic.event only, §7.6) |
| `state.updated` | turn state change (dual-namespace lifecycle, §7.3c) | `{turn_id, value, visibility: "hidden"}` |
| `turn.retry_requested` / `turn.retry_running` / `turn.retry_completed` / `turn.retry_failed` / `turn.retry_cancelled` | retry lifecycle (§6.24) | full TurnAttempt (flat) |
| `context.file.added` / `context.file.removed` | session context files (§6.9) | — |
| `file.diff.applied` / `file.diff.rejected` | diff apply lifecycle (§6.10) | `{session_id, path, part_id, message_id}` |
| `file.diff.write_failed` | diff write failed (§6.10) | `{session_id, path, part_id, message_id, error}` |
| `memory.search.completed` | memory search served | vendor |
| `memory_search_sessions.completed` / `.denied`, `memory_read_session_summary.completed` / `.denied`, `memory_read_context_frame.completed` / `.denied` | memory-tool audit events (§6.19 tools) | vendor |
| `arc.op` | context mutations (allow-listed ids/kinds/token_count only) | vendor |
| `agent.reasoning.delta` | throttled (≥1 s) liveness ping while the model reasons | `{stream_source: "reasoning"}` — carries NO text; vendor |
| `lm.provider.changed` / `lm.provider.failed` | `/v1/providers/lm` config result | global (`session_id: ""`, broadcast to all streams) |
| `mcp.server.error` / `mcp.server.reconnected` | MCP server health transitions | global (`session_id: ""`, broadcast to all streams) |
| `user_question.created` / `.answered` / `.cancelled` / `.resumed` | ask-user lifecycle (§6.23) | full UserQuestion; `.resumed` = `{question_id, session_id, queued_user_message_id, source_turn_id}` |
| `semantic.event` | the semantic-execution spine | §7.6 (vendor; `x_clio_semantic_events`) |

Removed from this table vs earlier drafts because clio does **not**
publish them on the bus (they are read via REST or ride
`semantic.event` / synthetic system `message.created` frames):
`tool.started`, `agent.invocation.started/completed`,
`context.frame.created/completed`, `memory.compacted`,
`memory.policy_summary`, `session.active_pack`,
`session.active_agent_blueprint`.

There is no `file.diff.proposed` event — a diff proposal arrives as a
batch `message.part.added` (`file_diff` part) plus a `semantic.event`
`artifact.proposed` `{path, unified_diff, new_content, edit_mode,
lines_added, lines_removed}`.

#### §7.3c Normalized transcript channel — RETIRED (clio e921eec)

The normalized channel's four *content* twins — `turn.text.delta`,
`turn.trace.delta`, `turn.action.added`, and `call.result.delta` — were
**retired in clio `e921eec` (iowarp/clio-agent#833)** and are no longer
emitted on the bus. They were a provisional double-publish alongside
`message.*` that never gained a single client consumer (no reducer,
store, or Go code ever read them). `message.part.*` (+
`message.created` / `message.completed`) is the **sole transcript wire
vocabulary** (§7.3a, §7.4). Clients MUST NOT declare or depend on the
retired types.

The three *lifecycle* events `turn.started` / `turn.completed` /
`state.updated` **remain** as dual-namespace lifecycle events —
conservatively kept server-side because their semantic twins feed ARC.
They carry `{turn_id, agent_id}` / `{turn_id}` / `{turn_id, value,
visibility: "hidden"}` respectively and are listed in §7.3a.

#### §7.3b Specified-but-not-emitted by clio

The following event types are defined in v0.1/v0.2 and remain valid spec
surface for other backends, but the reference backend does **NOT** emit
them today. A client driving clio must not wait on them. Where clio
offers an alternative, it is noted.

| Type | Status against clio | Alternative |
|---|---|---|
| `server.disposed` | not emitted | — |
| `workspace.updated` | not emitted | — |
| `session.created` | not emitted | discover via REST list |
| `session.deleted` | **not emitted — PROPOSED addition** (owner decision on iowarp/gact-tui#232: to be added as a broadcast `{session_id, workspace_id}`; tracked as a clio issue). Until then, session deletion by another client is unobservable | REST list refetch (unreliable — lists are workspace+archive filtered) |
| `session.summarized` | not emitted | `session.compacted` (§6.25) |
| `message.error` | not emitted | `message.completed.error_info` (§14) + `session.status_changed(error)` |
| `tool.call.progress` | not emitted | — |
| `mcp.server.status` / `mcp.tools.list_changed` / `mcp.prompts.list_changed` / `mcp.resources.list_changed` / `mcp.resources.updated` / `mcp.log` | not emitted (but see `mcp.server.error`/`mcp.server.reconnected`, §7.3a). Concrete names per the MCP notification mapping (§9.2) | poll `/v1/mcp/servers` |
| `file.changed` | not emitted | — |
| `diff.generated` | not emitted | `file.diff.*` cover apply/reject; proposal = batch `message.part.added` + semantic `artifact.proposed` |
| `cost.updated` | not emitted | rollups arrive on `message.completed` |
| `notification` | not emitted | — |
| `turn.failed` | not emitted as a plain bus event | `semantic.event` with `status: "failed"` (§7.6) |
| `session.agent_routed` (v0.2) | **not emitted** | `routing_decision` part (§4.5) + `agent.invocation.*` semantic events (§7.6) |
| `user_question.expired` | **not emitted by clio** (expiry is inert — §15.7.7) — but **the emulator emits it** (`emulator/internal/server/handlers_user_questions.go`) and the web keeps a live listener | — |
| `context.frame.created` / `context.frame.completed` | **not emitted by any backend today**; the web keeps forward-compat listeners (`LiveConnectionConfig.ts`) | frame data rides REST §6.9 + the `semantic.event` spine (§7.6) |
| `memory.cache.updated` (v0.2) | **not emitted** | poll `/v1/memory/stats` |
| `integration.status_changed` (v0.2) | **not emitted** | poll `/v1/health` |

### §7.4 Streaming a message

The implemented flow for an assistant turn (clio 3527143 — note flat
`message.created` payloads throughout):

```
session.status_changed     { session_id, status: "running", prev_status: "idle" }
message.created            { id: mu, role: "user", parts: [...], turn_id: mu, ... }        [flat wire Message]
message.created            { id: ma, role: "assistant", parts: [], turn_id: mu, ... }      [on first chunk / first tool part]
message.part.added         { turn_id, message_id: ma, stream_source: "live",
                             part: { id: p1, type: "thinking"|"text", ... } }
message.part.delta         { turn_id, message_id: ma, part_id: p1, stream_source: "live",
                             signature_field_name, delta: { text_append: "..." } }
...                        [text parts close at every runtime boundary:
                            tool call, expert switch, field switch]
message.part.completed     { turn_id, message_id: ma, part_id: p1, stream_source: "live",
                             final_text: "<authoritative cleaned text>" }
message.part.added         { ..., part: { type: "tool_call", call_id: "c1", ... } }        [COMPLETE — inputs are never streamed]
permission.requested       { id, session_id, tool_call: {tool_name, input}, summary,
                             created_at, status: "pending" }                               [flat row; only if the gate blocks]
permission.resolved        { permission_id, action: "allow", session_id }
tool.call.started          { call_id: "c1", tool, args, telemetry_source }
tool.call.completed        { call_id: "c1", tool, ok, duration_ms, cached, ... }
message.part.added         { ..., part: { type: "tool_result", call_id: "c1", ... } }      [on the assistant message — NO role:"tool" frames]
...
message.part.completed     { ..., final_text }                                             [finalize may RE-emit part.completed with the
                                                                                            parsed clean final_text for a streamed part]
message.part.added         { ..., stream_source: "batch", part: {...} }                    [batch fallback: whole part, no deltas,
message.part.completed     { ..., stream_source: "batch", final_text, stream_fallback }     then completed]
message.completed          { turn_id, message_id: ma, stop_reason: "end_turn",
                             tokens: {...}, cost_usd, metadata: {...} }
session.status_changed     { session_id, status: "idle", prev_status: "running", updated_at }
```

Per expert/field text segment: one `part.added` + N `part.delta` + one
`part.completed(final_text)`. Batch (non-streamed) parts get
`part.added` + `part.completed` with `stream_source: "batch"` (+
`stream_fallback` reason, §3.3) at finalize — **no synthetic post-hoc
deltas are ever replayed** (`x_clio_synthetic_posthoc_streaming:
false`).

#### §7.4a Turn lifecycle invariant (clio #756)

**Every turn terminates.** A crash inside finalize itself settles via
a last-resort path (`_settle_failed_finalize`): a persisted
empty-parts assistant message with `stop_reason: "error"` and
`error_info.error: "finalize_error"` (`details.reason:
"turn_finalize_error"`, `details.stage: "finalize"`), a
`message.completed(stop_reason: "error")` event, the retry attempt
marked `failed`, and `session.status_changed → error`. The settle is
skipped only if the session already left `running`. Clients can
therefore rely on: after `session.status_changed(running)`, a terminal
`message.completed` + terminal `session.status_changed` always arrive
— except the ask-user pause, whose boundary is
`session.status_changed → waiting_user` (§6.23).

Related terminal envelopes: the no-progress watchdog
(`CLIO_GACT_TURN_TIMEOUT_S`; per-session progress heartbeat +
process-global LM-activity liveness, clio #761) aborts a stalled turn
with `error_info.error: "provider_timeout"` (`recoverable: true`,
`stop_reason: "error"`) and keeps partial streamed text as the answer.
Empty-output turns settle as `error_info.error: "empty_response"`.

### §7.5 Delta shapes

| Part type | Delta keys (clio) |
|---|---|
| `text` | `text_append: string` |
| `thinking` | `text_append: string` — clio streams thinking parts with `text_append`, NOT `thinking_append` |
| `tool_call` | never streamed by clio — `tool_call` parts arrive complete via `part.added` |
| Other | backend-defined; clients tolerate unknown delta shapes |

`thinking_append` and `input_json_append` are **never emitted by
clio**; they remain valid delta keys for other backends only. Delta
events carry the vendor fields `stream_source` and
`signature_field_name` (§4.5) — provider-native thinking parts stream
as `type: "thinking"` with `metadata: {thinking_source: "provider",
provider_source, default_collapsed: true}`.

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

**Served allow-list.** The semantic spine captures far more than it
serves. Only these `event_type` values reach the SSE wire:
`react.step.completed`, `expert.extract.completed`,
`expert.response.completed`, `expert.lifecycle.started`,
`(blueprint.)delegation.started` / `.completed` / `.parent_resumed` /
`.failed`, `memory.search.completed` — **PLUS any event whose `status`
is `failed`/`error`/`cancelled`** (e.g. `turn.failed`). Everything
else (turn/agent/hook lifecycle, `tool.call.*` mirrors,
`lm.token.delta`, `memory.compacted`, `arc.op`) is captured on the
durable trace/ARC/hooks but NOT served over SSE. The captured set is
open.

**Detail levels** (`x_clio_semantic_trace_detail`, also per-event):
`off` suppresses SSE + hooks but never durable capture; `metadata`
emits envelope fields but empty payloads; `semantic` (default) emits
payloads where **only genuine credentials** (keys matching
`api_key`/`token`/`password`/`secret`/…) are redacted to
`"[redacted]:N chars"` — session content (text, reasoning, prompts,
results) passes through, and reasoning is explicitly kept on
`react.step.completed` and `expert.extract.completed`; `full_debug`
emits raw payloads. `lm.token.delta` is always captured at `off`
detail and never appears on the wire. Durable tracing is controlled by
`x_clio_semantic_trace_backend` (`none`/`file`/`factory`).

> **Note for generic clients.** `semantic.event` is the clio answer to
> the unimplemented `session.agent_routed` / `memory.cache.updated`
> events (§7.3b). It is NOT part of the generic GACT contract — treat it
> as an opt-in vendor stream keyed off `x_clio_semantic_events`.

### §7.7 Machine-checked wire event vocabulary (normative)

The single source of truth for the SSE event-`type` vocabulary is the
fenced block below. Every line is `<event.type> <implemented|spec-only>`
(grammar `/^([a-z][a-z0-9_.]*) (implemented|spec-only)$/`, one entry per
line, blank lines and `#` comments ignored): `implemented` = the
reference backend (clio) publishes the type on the bus today (§7.3a);
`spec-only` = valid spec surface that clio does not emit (§7.3b) but
another backend (e.g. the emulator) or a forward-compat client may
legitimately carry. The block is `§7.3a ∪ §7.3b` restricted to the
concrete event *types* — the semantic-spine `event_type` vocabulary
(§7.6) and the never-a-bus-type rows (`turn.failed`,
`memory.cache.updated`, `integration.status_changed`) are deliberately
absent. Custom `x.{vendor}.*` types (§8.4) are out of scope and exempt.

This block is enforced in both directions by two tests, so a client type
missing from the spec — or a spec type no client declares — fails CI:

- `apps/core/tests/spec_vocabulary.test.ts` asserts set-equality with
  the TypeScript `WIRE_EVENT_TYPES` canonical array, which is itself
  compile-time-equal to the `GactEvent` discriminated union (`satisfies`
  + an `AssertNever` exhaustiveness guard).
- `contract/conformance/vocabulary_checks.go` (`Drift_EventVocabulary`)
  asserts every observed live `data.type` on the SSE stream is present
  in this block.

```wire-vocabulary
# implemented — clio publishes these on the bus today (§7.3a)
agent.reasoning.delta implemented
arc.op implemented
context.file.added implemented
context.file.removed implemented
file.diff.applied implemented
file.diff.rejected implemented
file.diff.write_failed implemented
lm.provider.changed implemented
lm.provider.failed implemented
mcp.server.error implemented
mcp.server.reconnected implemented
memory.search.completed implemented
memory_read_context_frame.completed implemented
memory_read_context_frame.denied implemented
memory_read_session_summary.completed implemented
memory_read_session_summary.denied implemented
memory_search_sessions.completed implemented
memory_search_sessions.denied implemented
message.completed implemented
message.created implemented
message.deleted implemented
message.part.added implemented
message.part.completed implemented
message.part.delta implemented
permission.requested implemented
permission.resolved implemented
semantic.event implemented
server.connected implemented
server.heartbeat implemented
session.cleared implemented
session.compacted implemented
session.rewind implemented
session.snapshot implemented
session.status_changed implemented
session.undo implemented
session.updated implemented
state.updated implemented
subagent.completed implemented
subagent.started implemented
tool.call.completed implemented
tool.call.started implemented
tool.selection.invalid implemented
turn.completed implemented
turn.retry_cancelled implemented
turn.retry_completed implemented
turn.retry_failed implemented
turn.retry_requested implemented
turn.retry_running implemented
turn.started implemented
user_question.answered implemented
user_question.cancelled implemented
user_question.created implemented
user_question.resumed implemented
# spec-only — valid surface clio does not emit today (§7.3b)
context.frame.completed spec-only
context.frame.created spec-only
cost.updated spec-only
diff.generated spec-only
file.changed spec-only
mcp.log spec-only
mcp.prompts.list_changed spec-only
mcp.resources.list_changed spec-only
mcp.resources.updated spec-only
mcp.server.status spec-only
mcp.tools.list_changed spec-only
message.error spec-only
notification spec-only
server.disposed spec-only
session.agent_routed spec-only
session.created spec-only
session.deleted spec-only
session.summarized spec-only
tool.call.progress spec-only
user_question.expired spec-only
workspace.updated spec-only
```

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

3. **Compaction: an event, plus a visible marker in history.** The `session.compacted` event (§7.3) lets the TUI react in real time. The original design paired it with a `compaction` part type (§4.5) as the in-history marker; **the reference backend does not emit that part** — clio instead replaces the ledger with one synthetic assistant `text` message flagged `metadata.synthetic: "compact_summary"` (§6.25), which serves the same archaeological purpose. The part type remains valid for backends that keep pre-compaction history inline.

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

### 14.2 Emitted error types (clio 3527143) + target set

The taxonomy below documents the tags the reference backend
**actually emits**, split into the two tiers where they appear. Tags
are an open set; the TUI treats unknown types as `internal_error` for
rendering while preserving the original in round-trips. Backends MAY
add vendor-specific types prefixed `x_<vendor>_`.

**Tier A — HTTP response tags** (§6.0 envelope on 4xx/5xx):

| `error` | HTTP | Meaning |
|---|---|---|
| `not_found` | 404 | Resource missing — **canonical** for all resource-missing 404s |
| `validation_error` | 400/422 | Body/param failed validation |
| `bad_request` | 400/409/422 | Malformed or state-invalid request (question routes, §6.23) |
| `conflict` | 409 | State conflict (e.g. rollback while `running`) |
| `permission_error` | 401/403 | Policy/scope rejected the request (incl. `details.scope: "other_workspace"`, direct-destructive `policy_deny`) |
| `unsupported` | 405/501 | Method or model/vision capability not supported |
| `not_implemented` | 501 | Endpoint recognised but not implemented |
| `agent_not_available` | 503 | No agent built (`details.agent_status`, `details.recovery_actions[]`) |
| `provider_configuring` | 503 | LM config in flight — retry after `/v1/providers/lm/wait` |
| `arc_unavailable` / `compaction_unavailable` / `dependency_missing` / `upstream_unavailable` | 503 | Readiness family — a dependency is down |
| `agent_unavailable` / `upstream_error` / `memory_update_failed` | 503/502/500 | `/compact` pipeline errors (§6.25) |
| `internal_error` | 5xx (and legacy 404/422) | Unclassified failure. **Legacy**: many session-lookup 404s and a few 422s still emit this tag — clients must tolerate it where `not_found`/`validation_error` is meant (§6.0) |
| `request_error` | any | Fallback wrapper for unclassified request failures |

**Tier B — turn-settlement tags** (`message.error_info` /
`message.completed.error_info`):

| `error` | Meaning | TUI default rendering |
|---|---|---|
| `provider_error` | Upstream LM / model provider failed (timeout, auth, rate-limit) | Red toast, offer retry, surface provider name |
| `provider_timeout` | No-progress watchdog aborted a stalled turn (clio #761); partial streamed text kept; `recoverable: true` | Offer retry |
| `finalize_error` | Finalize itself crashed; settled by the §7.4a invariant (`details.reason: "turn_finalize_error"`, `details.stage: "finalize"`); `recoverable: true` | Offer retry |
| `empty_response` | Model produced no usable output | Offer retry |
| `cancelled` | User cancelled (§6.2 `/cancel`); details carry `execution_cancellation`, `executor_work_may_continue`, `cancellation_attempt` | Silent; show the session settled `cancelled` |
| `permission_error` | Pre-message hook veto (`stop_reason: "blocked"`) or gate denial killed the turn | Modal with what was blocked |
| `tool_error` | Tool invocation returned an error dict or raised | Inline under the tool row, don't kill the turn |
| `routing_error` | Tier-1 orchestrator (§4.3.1) couldn't classify the query | Transient warning; backend typically falls back gracefully |
| `agent_error` | A tier-2 agent's loop failed | Red per-turn badge, keep session open |
| `config_error` | Env/config invalid (missing API key, bad endpoint) | Route to Settings / `/v1/health` doctor view |
| `rate_limited` | Soft-limit backoff, not a hard failure | Transient; auto-retry after `retry_after_s` (never emitted by clio today) |

**`details.recovery_actions[]` convention**: error `details` MAY carry
a `recovery_actions: string[]` list of machine-readable next steps
(e.g. `["change_policy", "retry", "exit"]`, `["configure_model"]`).
Display-only; clients MUST NOT branch on specific values.

**Target coherent set (normative for new code).** New clio code MUST
emit `not_found` for every resource-missing 404, `validation_error` /
`bad_request` for 400/422, and MUST NOT mint new uses of
`internal_error` for classifiable failures. The legacy
`internal_error`-on-404 emissions above are grandfathered for clients
to tolerate, not a license to add more.

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

## §15 Implementation status — remaining drift list (clio 3527143)

Consolidated record of what **remains known-divergent** after the
2026-07 reconciliation (iowarp/gact-tui#232). The implementation is
authoritative; this list exists so adapter and client authors know
what to depend on. Items resolved by Phase 0 (capability
truthfulness, heartbeat transience, the `replay` flag, the finalize
error envelope, sticky-grant persistence) are now **documented
behavior above, not drift**.

### 15.1 Endpoints — present but renamed/reshaped vs v0.1 sketch
- **SSE is session-scoped only**: `GET /v1/sessions/{id}/events`. The
  global `GET /v1/events` is **not implemented** (§7.1).
- **Summarization is `/compact`**: `POST /v1/sessions/{id}/compact`
  (§6.25). The `/summarize` route is not registered; `session_summary`
  is truthfully `false` (§6.2).
- **Tool catalog** is `GET /v1/tools` (unified) + `/v1/catalog/tools`
  alias; `Tool` list rows omit `input_schema`/`annotations` (§6.6).
- **LM config** is the `GET`/`PUT /v1/providers/lm` singleton, not the
  per-provider `/auth` flow (§6.12).
- **Message POST** returns `200` (not `202`) and accepts a `text`
  convenience field + per-turn `agent`/`agent_id` (§6.3).
- **Error discriminator key is `error`** (the §14 tag), not `code` (§6.0).

### 15.2 Endpoints / params — specified but NOT implemented in clio
- `GET /v1/events` (global stream) — §7.1
- `POST /v1/sessions/{id}/summarize`, `POST /v1/sessions/{id}/attachments`
  — routes absent AND flags truthfully `false` (§3.3)
- Pagination everywhere: `GET /v1/sessions` ignores
  `parent_session_id`/`limit`/`before` (reserved); `GET /messages`
  ignores `before`/`limit`/`include_system` and always returns
  `next_cursor: null` (§6.2, §6.3)
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
- Context frames/policy/state `/v1/sessions/{id}/context/frames*`, `/context/policy`, `/context/state`, `/context/compact` (§6.9)
- Memory search/events/tools `/v1/memory/search`, `/v1/sessions/{id}/memory/*` (§6.19)
- Capability gaps `/v1/capability-gaps` (§3.3.1)
- Scheduled sessions + sharing (§6.15, §6.15b)
- `DELETE /v1/messages/{id}` session-less alias (§6.3)

### 15.4 Shape drift (implementation wins — now codified above)
- `Session`: flattened `tokens_input`/`tokens_output`; boolean
  `archived`; adds `mode`/`edit_mode`/`routing_mode`; status enum adds
  `waiting_user`/`cancelled` (and `waiting_permission` is never
  emitted); zero-values serialized, never `null` (§4.2).
- `Message`: nested `tokens`; **no per-message `model`**; adds
  `turn_id`; `stop_reason` open string with observed set
  `end_turn|error|cancelled|blocked` (§4.4).
- `Part`: single flat struct; `image` uses flat `data`/`url`/`media_type`;
  `file_diff` uses `unified_diff`/`new_content`/`status`/`edit_mode`/
  `lines_added`/`lines_removed`; `routing_decision` adds `execution_path`
  (§4.5).
- `PermissionRequest`: thin row + lifecycle fields; no
  `subsession_id`/`call_id`/`server_id`/`annotations` (§4.7).
- `AgentDef`: flat `default_provider`/`default_model`; `parameters` is an
  object; adds many fields incl. `capability_refs`, `source:"expert_pack"`
  (§6.5).
- Error body wraps `ErrorInfo` (`error`/`message`/`details`/`recoverable`/
  `retry_after_s` — the latter never emitted) (§6.0/§14).
- Rollback responses use the eight-key envelope; `reverted_messages`
  does not exist (§6.2).

### 15.5 SSE events
- Implemented set + exact payloads in §7.3a; specified-but-not-emitted
  in §7.3b. The provisional normalized `turn.*` content channel was
  **retired** in clio `e921eec` (#833) — `message.part.*` is the sole
  transcript vocabulary; only the `turn.started` / `turn.completed` /
  `state.updated` lifecycle events survive (§7.3c).
- `message.created` payloads are **flat** wire Messages (codified —
  the `{message: ...}` nesting was v0.1 sketch only).
- Heartbeat transience and the `replay: true` flag are documented
  behavior (§7.1/§7.2), not drift.
- The three v0.2 events (`session.agent_routed`, `memory.cache.updated`,
  `integration.status_changed`) are **not emitted**; clio's higher-level
  story is the `semantic.event` spine (§7.6) plus polling for caps/health.

### 15.6 Capabilities envelope
- Full implemented flag map in §3.3 (incl. all `x_clio_*` vendor
  flags); truthful in both directions since Phase 0.
- `backend.version` is the installed package version (dynamic,
  currently 0.5.x), distinct from `contract_version` (`0.2`).
- `auth.schemes = ["trust_socket"]` only; no `bearer`; trust_socket
  means unauthenticated loopback TCP (§5).
- `extensions = []`.

### 15.7 Known clio-side inconsistencies (documented as-is; clio issues)
1. **Legacy `internal_error` on 404/422** in older session/permission
   routes while newer routes emit `not_found`/`bad_request`. Canonical
   target codified in §14.2; clients must tolerate both.
2. **`waiting_permission` declared but never emitted** (§4.2) —
   pendency is only observable via `permission.requested` + the
   permissions list.
3. **Permission timeout emits no `permission.resolved` event** and a
   late reply is a silent no-op (§6.11).
4. **`file_diff` Part.status frozen at `"pending"`** in the persisted
   message; `GET /diffs` + `file.diff.*` are authoritative (§4.5/§6.10).
5. **No concurrency guard on `POST /messages`** — a second post while
   `running` starts a concurrent turn; `prev_status` is hardcoded
   `"idle"` (§6.3).
6. **No `session.deleted` event** — PROPOSED addition per the #232
   owner decision (§6.2, §7.3b).
7. **UserQuestion `expired` status is inert** — declared, never set,
   `expires_at` unenforced (§6.23).
8. **Per-connection heartbeat tasks** — N attached clients observe up
   to N heartbeats per 15 s window (§7.1). Harmless (transient).
9. **Normalized `turn.*` transcript content channel** — **RESOLVED
   (clio #833)**: the four content twins (`turn.text.delta` /
   `turn.trace.delta` / `turn.action.added` / `call.result.delta`) were
   retired in clio `e921eec` with zero consumers ever built; clients
   purged the declared surface (gact-tui#232). `message.part.*` is the
   sole transcript vocabulary; `turn.started` / `turn.completed` /
   `state.updated` remain as lifecycle events (§7.3c).
10. **Fork inherits nothing** (modes/model/metadata reset to defaults)
    — codified as implemented behavior, flagged as a candidate future
    change (§6.2).

### 15.8 Conformance fixtures
`contract/conformance/` asserts the v0.2 caps flags,
`/v1/agents?tier=2`, `/v1/memory/stats`, integration health, and the
structured-error envelope. The structured-error check accepts both
`code` and `error` discriminators.

The previously-flagged `checkDiffs` staleness is resolved: **clio now
serves both `applied` (derived bool, `status == "applied"`) and
`status` on diff rows** (§6.10), so the fixture's `applied` assertion
is satisfied against real sessions.

The suite additionally asserts the #232 drift classes: flat
`message.created` payloads, capability↔route truth for single-route
flags, `session.updated` carrying the full Session, the §6.2 rollback
envelope keys, `/compact` accepting `{focus}`, and Last-Event-ID
replay returning real events (heartbeats must not evict history).

---

*End of GACT v0.2 spec.*
