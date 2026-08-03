---
name: gact-wire-protocol-reference
description: >-
  Load this when working with the GACT REST+SSE wire contract: adding/consuming
  endpoints or SSE events, writing or debugging adapters, emulator scenarios, or
  client wire code (tui/internal/client, tui/internal/ui/live_*, apps/core wire),
  interpreting contract/SPEC.md, capability flags, turn lifecycle, Last-Event-ID
  replay, permission or diff events, or any "works on emulator, breaks on clio"
  (or vice versa) symptom. Keywords: SSE, envelope, payload, capabilities,
  message.part.delta, final_text, replay, conformance, drift, dialect.
---

# GACT wire protocol reference (v0.2, as implemented)

This is the standalone domain pack for the GACT wire contract. It is written so
you do NOT need to read the 2,284-line `contract/SPEC.md` first — but SPEC.md is
the authority, and every claim below cites its section (§N). Where this file and
SPEC.md ever disagree, SPEC.md wins; where SPEC.md and the reference backend
disagree, **the backend's wire wins** ("reality leads" — owner direction on
iowarp/gact-tui#232, recorded in the SPEC reconciliation note of 2026-07-01,
landed as commit `59d136d2` "docs(contract): reconcile SPEC.md to clio reality;
conformance asserts the drift classes (#247)").

**Vocabulary** (used throughout):

- **GACT** — the Generic Agentic-Coder TUI contract: REST under `/v1/` plus
  Server-Sent Events (SSE, a one-way HTTP streaming format) for live updates.
- **clio** — the reference backend (iowarp/clio-agent). SPEC.md v0.2 was
  reconciled against clio `develop @ 3527143`. Default bind `127.0.0.1:8100` (§5).
- **emulator** — this repo's Go backend (`emulator/`) implementing the contract
  with scriptable fake turns. It speaks a *looser, older dialect* than clio —
  see the dialect table (section 5). This difference is the #1 junior trap.
- **turn** — one user message plus the backend's streamed assistant response,
  from `session.status_changed(running)` to a terminal settle (§7.4).
- **part** — one typed content block inside a message (`text`, `thinking`,
  `tool_call`, `tool_result`, `file_diff`, ...) (§4.5).
- **capability flag** — a boolean in `GET /v1/capabilities` gating a feature (§3.3).
- **dialect** — a backend's concrete variant of the wire. Two coexist in this
  repo: clio's codified shape and the emulator's pre-reconciliation shape.

**The genericity rule (project doctrine, overrides convenience):** GACT is a
generic interface to many agents. Never bake one backend's semantics
(dedup, filtering, event interpretation) into a client — semantics belong on
the server. Clients stay *liberal in what they accept* across dialects. See
gact-working-discipline for the full doctrine.

---

## 1. REST surface quickref (§6)

All paths are prefixed `/v1/` (§2). Bodies are JSON. Errors use the §6.0
envelope (section 9 below). "clio" column notes reference-backend behavior.

### Core resources

| Area | Endpoints | Key facts | SPEC |
|---|---|---|---|
| Health | `GET /health` | `{healthy, uptime_s}` + v0.2 `overall_status`, `integrations[]` (clio rows: api, sessions, agent, memory, lm). 503 returns the HealthResponse body, NOT the error envelope — the only such carve-out | §3.4, §6.0 |
| Capabilities | `GET /capabilities` | See section 4 | §3.3 |
| Capability gaps | `GET /capability-gaps` | Vendor (clio): map of recognised-but-unserved features | §3.3.1 |
| Workspaces | `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/{id}` | POST requires `name`, returns 201. PATCH merges metadata (no key removal). DELETE of `ws_default` → 409 | §6.1 |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/{id}`, `POST .../fork`, `POST .../cancel`, `GET .../export`, `POST /sessions/import` | POST returns 200 (not 201); no `session.created` event. PATCH metadata merges shallowly; publishes `session.updated` with the FULL Session. DELETE emits NO event (gap — section 10). `/cancel` is 204 always, best-effort. Fork returns 201, truncation inclusive, inherits NOTHING (section 10) | §6.2 |
| Rollback | `POST /sessions/{id}/undo` `{count?}`, `POST .../rewind` `{message_id\|target_message_id\|to_message_id, include_target?}` | Both return the eight-key rollback envelope: `session_id, operation, deleted_message_ids` (canonical) + aliases `deleted_messages`/`reverted_message_ids`, `message_count, memory_scope, session`. `reverted_messages` does NOT exist on the wire. 409 `conflict` while running. Events: per-message `message.deleted` → `session.undo`/`.rewind` → `session.updated` | §6.2 |
| Messages | `GET/POST /sessions/{id}/messages`, `GET/DELETE .../messages/{msg_id}`, `DELETE /messages/{msg_id}` (clio alias), `GET .../messages/search?q=` | POST body `{parts: Part[]}` or clio convenience `text: string`, plus per-turn `agent`/`agent_id`; ack is synchronous HTTP 200 `{message_id, accepted_at}` — the user message + `message.created` + `status_changed(running)` are published BEFORE the ack returns. List query params (`before`/`limit`/`include_system`) silently ignored; `next_cursor` always null (section 10) | §6.3 |
| Agents | `GET/POST /agents`, `GET/PUT/DELETE /agents/{id}`, `POST /agents/extract` | `?tier=N` filters (0 untagged, 1 orchestrator, 2 specialist, 3 nanoagent). Writes gated by `agent_write`; extract by `skills_extraction`. AgentDef: flat `default_provider`/`default_model` strings, `parameters` is an object | §6.5, §4.3.1 |
| Tools | `GET /tools`, `GET /tools/{id}`, `GET /catalog/tools` (clio alias) | List rows omit `input_schema`/`annotations`. `permission_default` is a constant `"ask"` placeholder on clio — never consulted by the gate | §6.6, §4.6 |
| MCP | `GET /mcp/servers`, `GET /mcp/handshake`, `POST /mcp/servers`, `GET/DELETE /mcp/servers/{id}`, `GET .../tools`, `.../resources`, `.../prompts`, `POST .../call` | Handshake = live health, not registry. clio does NOT implement `/reconnect`, `/resource_templates`, `/resources/read`, `/resources/subscribe`, `/prompts/get` (§15.2) — the emulator registers some of those | §6.7 |
| Permissions | `GET /permissions` (query `session_id?, status?, limit`), `POST /permissions/{id}` `{action}` | See section 7. `GET /permissions/{id}` is NOT implemented in clio (emulator has it) | §6.11 |
| Policies | `GET /policies`, `PUT /policies` | PUT is atomic: any invalid row rejects the whole update (422 with `details.policy_errors[]`) | §6.11 |
| Providers | `GET /providers`, `GET /providers/{id}`, `.../models`, `.../handshake`, `POST .../auth`; `GET/PUT /providers/lm`, `GET /providers/lm/wait` | clio's model config is the `/providers/lm` singleton. PUT may configure asynchronously → poll `GET /providers/lm/wait?timeout=N` until `state` ∈ {ready, error}. `api_key` never echoed back. **PUT /providers/lm DOES build the agent at runtime** | §6.12 |
| Commands | `GET /commands`, `POST /sessions/{id}/commands/{cmd_id}` | 204; effects flow via SSE | §6.13 |
| Files/context | `GET/POST/DELETE /sessions/{id}/context/files`, `GET /workspaces/{id}/files`, `.../files/read?path=`, `.../repo_map` | ABSOLUTE paths accepted verbatim (not workspace-bounded); relative paths bounded (403 `path_outside_workspace`). Walk capped at 5000 entries. PATCH context-files NOT implemented in clio — DELETE + re-POST | §6.9 |
| Diffs | `GET /sessions/{id}/diffs`, `GET .../messages/{msg_id}/diffs`, `POST .../diffs/apply` `{paths?}`, `POST .../diffs/reject` | See section 8 | §6.10 |
| Compaction | `POST /sessions/{id}/compact` `{focus?}` | 200 `{session_id, compacted, event_id, archived_count, summary}` or `{compacted: false, reason}`. This IS the summarize path — `/summarize` is not registered on clio and `session_summary` is truthfully `false` | §6.25 |
| Metrics | `GET /metrics` | Snapshot counters; clio adds a `latencies` map | §6.16 |
| Memory | `GET /memory/stats?session_id=` | v0.2, gated by `memory`. clio adds vendor `/memory/search`, `/sessions/{id}/memory/events`, memory tools | §6.19 |
| Hooks | `GET/POST /hooks`, `DELETE /hooks/{id}` | Async, ~10s timeout, failures never propagate | §6.17 |
| Session tasks | `GET/POST /sessions/{id}/tasks`, `PATCH/DELETE /tasks/{id}` | Status transitions advisory | §6.18 |
| Schedules / sharing | `/sessions/{id}/schedules`, `DELETE /schedules/{id}`; `POST /sessions/{id}/share`, `GET /shared/{token}` | Optional, capability-gated | §6.15, §6.15b |
| LSP / voice | `GET /lsp/clients`, `.../diagnostics`; `POST .../voice/transcribe`, `.../voice/synthesize` | clio: both flags `false` | §6.8, §6.14 |

### Vendor surface (clio `x_clio_*` — optional; generic clients MUST run without it)

| Area | Root | SPEC |
|---|---|---|
| Prompt registry | `/v1/prompts*` (list/get/render/validate/save/reload) | §6.20 |
| Agent blueprints | `/v1/agent-blueprints*` + per-session blueprint/overlay routes | §6.21 |
| Expert packs | `/v1/expert-packs*` + `/sessions/{id}/expert-pack` | §6.22 |
| User questions | `/v1/sessions/{id}/questions*` (ask-user flow; session → `waiting_user`) | §6.23 |
| Turn retry | `/v1/sessions/{id}/attempts`, `POST .../messages/{id}/retry` (202) | §6.24 |
| Context frames/state | `/sessions/{id}/context/frames*`, `/context/policy`, `/context/state`, `/context/compact` | §6.9 |

### SSE subscription

| Stream | clio | emulator | SPEC |
|---|---|---|---|
| `GET /v1/sessions/{id}/events` | ✅ the only stream | ✅ | §7.1 |
| `GET /v1/events` (global / `?workspace_id=`) | ❌ 404 — **[NOT IMPLEMENTED in clio 3527143]**, valid spec surface for other backends | ✅ registered and serving (verified live 2026-07-06) | §7.1 |

---

## 2. The SSE envelope — and the payload.payload trap

Every SSE event (§7.2):

```
event: <event_type>
id: <monotonic event id>
data: {"type": "<event_type>", "occurred_at": "<RFC3339>", "payload": { ... }, "replay": true?}
```

- `event:` line and `data.type` are deliberately redundant; prefer `data.type`.
- `replay: true` appears ONLY on events re-delivered from the replay buffer
  (clio; the emulator never sets it — dialect table).
- clio sends a preamble on every (re)connect: `server.connected` then
  `session.snapshot` (`{session_id, status, updated_at, authoritative: true}`),
  both with `id: 0`, never part of the replay timeline (§7.1). The emulator
  sends `server.connected` only — no `session.snapshot`, no id line on it
  (verified live 2026-07-06).

**THE TRAP.** In the TUI, `client.SSEEvent.Payload` (`tui/internal/client/sse.go`)
is the decoded **entire `data:` object** — i.e. the envelope. The actual event
data is one level down. Every handler must do:

```go
pl, _ := e.Payload["payload"].(map[string]any)   // the real payload
ts   := e.Payload["occurred_at"]                  // envelope field, top level
```

This is stated in the header comment of `tui/internal/ui/live_events.go` and is
the single most common wire-handling bug: reading `e.Payload["status"]` where
`e.Payload["payload"].(map[string]any)["status"]` was meant compiles fine and
silently never matches.

**Parser strictness (this repo's client).** `StreamEvents` in
`tui/internal/client/sse.go` is a hand-rolled line parser that requires a space
after the field colon (`"id: "`, `"event: "`, `"data: "`) and tolerates LF or
CRLF. A spec-legal server emitting `data:foo` (no space) would be silently
ignored. Both clio and the emulator emit the spaced form today.

---

## 3. Turn lifecycle (§7.4, §7.4a)

Canonical event sequence for one user turn against clio (condensed from §7.4;
emulator differences in section 5):

```
session.status_changed   {status: "running", prev_status: "idle"}
message.created          <flat wire Message, role: "user", turn_id = its own id>
message.created          <flat wire Message, role: "assistant", parts: [], turn_id>   [on first chunk]
message.part.added       {turn_id, message_id, stream_source: "live", part: {type: "thinking"|"text", ...}}
message.part.delta       {turn_id, message_id, part_id, stream_source: "live",
                          signature_field_name, delta: {text_append: "..."}}          [× N]
message.part.completed   {turn_id, message_id, part_id, stream_source, final_text}
message.part.added       {part: {type: "tool_call", ...}}     [COMPLETE — tool inputs never streamed]
permission.requested     <flat PermissionRequest row>          [only if the gate blocks — section 7]
permission.resolved      {permission_id, action, session_id}
tool.call.started        {call_id, tool, args, telemetry_source}
tool.call.completed      {call_id, tool, ok, duration_ms, cached, ...}
message.part.added       {part: {type: "tool_result", ...}}    [on the assistant message — NO role:"tool" frames]
...
message.completed        {turn_id, message_id, stop_reason, tokens, cost_usd, error_info?}
session.status_changed   {status: "idle", prev_status: "running"}
```

Rules a client may rely on (each one has broken someone):

| Rule | Detail | SPEC |
|---|---|---|
| Segment contract | Per text segment: one `part.added` + N `part.delta` + one `part.completed`. Text parts close at every runtime boundary (tool call, expert switch, field switch) — expect MANY short segments, not one long one | §7.4 |
| `final_text` is authoritative | Clients MUST replace buffered deltas with `part.completed.final_text`. Finalize may RE-emit `part.completed` with cleaned text for an already-streamed part. A streamed part whose text cleans to empty is dropped and NEVER receives `part.completed`. Naive delta accumulators show ghost/wrong text | §7.3a, §7.4 |
| Batch fallback | Non-streamed parts arrive whole: `part.added` + `part.completed` with `stream_source: "batch"` + a `stream_fallback` reason (13 reason keys, §3.3). NO synthetic post-hoc deltas ever (`x_clio_synthetic_posthoc_streaming: false`) | §7.4 |
| Every turn terminates | Even a crash inside finalize settles (`_settle_failed_finalize`): empty-parts assistant message, `message.completed(stop_reason: "error")` with `error_info.error: "finalize_error"`, `session.status_changed → error`. After `running`, a terminal `message.completed` + terminal `status_changed` ALWAYS arrive — with one exception → | §7.4a |
| Ask-user exception | An orchestrator question ends the turn WITHOUT `message.completed`; the boundary is `session.status_changed → waiting_user` (payload carries `pending_user_question_id`). Waiting for `message.completed` here hangs forever | §6.23, §7.3a |
| Exactly one `message.completed` per turn | Except the ask-user pause (none). Turn failures ride `error_info` on it — there is no `message.error` event | §7.3a |
| Watchdog / empty output | Stalled turns abort with `error_info.error: "provider_timeout"` (`recoverable: true`, partial text kept); empty output settles as `empty_response` | §7.4a |
| Flat payloads | `message.created` payload IS the wire Message (never `{message: ...}`); `permission.requested` payload IS the flat PermissionRequest row; `session.updated` payload IS the full Session | §7.3a |

**Delta shapes (§7.5).** clio streams both `text` AND `thinking` parts with
`delta.text_append`. `thinking_append` and `input_json_append` are NEVER
emitted by clio (valid for other backends — the emulator uses `thinking_append`,
and the TUI reads all three: `tui/internal/ui/live_message_parts.go`).
`tool_call` parts are never streamed.

**Events you must NEVER wait on against clio** (§7.3b — each hangs forever):
`session.created`, `session.deleted` (PROPOSED, not shipped), `message.error`,
`cost.updated`, `session.cancelled` (does not exist — cancellation rides
`session.status_changed`), `session.agent_routed`, `memory.cache.updated`,
`integration.status_changed`, `tool.call.progress`, `notification`,
`session.summarized`, `permission.resolved` after a timeout (section 7),
`waiting_permission` status (section 7).

**Do not build on `turn.*`** (`turn.started/completed`, `turn.text.delta`, ...):
it is a provisional double-published channel with zero consumers;
codify-or-deprecate is tracked in iowarp/gact-tui#232 (§7.3c).

---

## 4. Capabilities (§3.3)

`GET /v1/capabilities` → `{contract_version: "0.2", backend: {name, version,
vendor, homepage}, capabilities: {...}, transports: {events_sse, events_websocket},
auth: {schemes, current}, extensions: []}`.

**The truthfulness rule (bidirectional, since clio Phase 0 #760/#782):** flag
`true` ⇒ its route is registered; flag `false` (or absent) ⇒ the route returns
404/501, and the client MUST hide the affordance. The conformance suite probes
this (`checkCapabilityTruth` in `contract/conformance/drift_checks.go`) — it is
the check that would have caught the historical `session_summary`/
`attachments_upload` over-claim.

Standard flags (§3.3 — clio's live values in parentheses where notable):

- **v0.1 baseline (28):** `workspaces, sessions, subagents, mcp, lsp(false),
  files, diffs, permissions, providers, commands, voice(false),
  scheduled_sessions, hooks, session_tasks, metrics, session_branching,
  session_sharing, session_export, session_summary(false — use /compact),
  attachments_upload(false), multimodal_image_parts, cost_tracking,
  thinking_blocks, edit_modes, plan_mode, search_messages, agent_write,
  skills_extraction`
- **v0.2 additions (5):** `agent_routing, memory, structured_errors,
  integration_health, tool_telemetry`
- **`x_clio_*` vendor extensions** (richer-than-boolean values; generic clients
  ignore): `x_clio_cancellation("best_effort"), x_clio_executor_cancellation,
  x_clio_text_streaming("best_effort_live"),
  x_clio_synthetic_posthoc_streaming(false — authoritative),
  x_clio_stream_fallback_reasons(map), x_clio_direct_delete_permissions,
  x_clio_prompt_registry, x_clio_expert_packs, x_clio_agent_blueprints,
  x_clio_user_questions, x_clio_retry_attempts, x_clio_context_frames,
  x_clio_semantic_events, x_clio_semantic_trace_backend,
  x_clio_semantic_trace_detail, x_clio_hook_backend, x_clio_hook_events,
  x_clio_capability_gaps`

**Version strings lie; flags don't.** As of 2026-07-06 all five adapters
(opencode, crush, goose, claudecode: `adapters/*/server.go`; Python:
`adapters/claude-agent-sdk-server/src/gact_claude_sdk/server.py`) still
advertise `contract_version: "0.1"` while the SPEC and emulator report `0.2`,
and stale "v0.1" package docs remain in `tui/internal/client` and emulator
`routes.go`. Never gate a feature on `contract_version` or `backend.version` —
capability flags are the only reliable gate.

**Auth (§5).** clio reports `auth.schemes: ["trust_socket"]`, which in practice
means **unauthenticated loopback TCP** (default `127.0.0.1:8100` — NOT a Unix
socket). No bearer, no `?auth_token` on REST or SSE; browsers gated only by a
CORS allowlist. Never bind non-loopback without an external auth layer.

---

## 5. THE dialect table — emulator vs clio

Two wire dialects coexist in this repo. The TUI works against both **only
because it is deliberately liberal** (`live_events.go` / `live_message_parts.go`
accept both). "Fixing" the TUI to match one dialect breaks the other. Code green
against the emulator can break against clio and vice versa. Rows marked ✔ were
verified live against the emulator on 2026-07-06 (built from this repo's HEAD).

| Wire behavior | clio (codified in SPEC) | emulator (this repo) |
|---|---|---|
| SSE preamble | `server.connected` + `session.snapshot`, both `id: 0` (§7.1) | ✔ `server.connected` only, no id line, NO `session.snapshot` |
| `replay: true` on replayed events | Yes (§7.2) | ✔ Never set |
| Replay buffer | 256 non-transient events per session (§7.1) | 1024-event ring, default in `NewBus` (`emulator/internal/events/bus.go`) |
| Event ids | ≥1, strictly ascending per session, NON-contiguous (process-global counter) (§7.1) | ✔ ascending; contiguous in single-session runs — do not rely on contiguity either way |
| Part events | Carry `turn_id`, `stream_source`, and `part.completed.final_text` (§7.3a) | ✔ `{message_id, part}` / `{message_id, part_id, delta}` only — NO turn_id/stream_source, NO `final_text` on `part.completed` (`emulator/internal/scenario/scenario.go`) |
| Thinking deltas | `text_append` (§7.5) | ✔ `thinking_append` |
| `cost.updated` event | Never emitted — rollups ride `message.completed` (§7.3b) | ✔ Emitted after every `message.completed` |
| Global `GET /v1/events` | 404 (§7.1) | ✔ Registered and serving |
| Error envelope discriminator | `{error: {error: <tag>, message, details, recoverable, retry_after_s?}}` (§6.0) | ✔ `{error: {code, message}}` — the v0.1 `code` key |
| `POST /v1/sessions` | `workspace_id` optional, defaults `ws_default` (§6.2) | ✔ 400 `invalid_body` "workspace_id is required" |
| `POST /messages` body | `{parts}` OR convenience `{text}` (§6.3) | ✔ strict decoder REJECTS `text` ("unknown field") — send `{parts: [{type: "text", text: "..."}]}` |
| Extra routes emulator has, clio lacks | — | `POST .../summarize`, `POST .../attachments`, `PATCH .../parts/{id}`, `GET /permissions/{id}`, MCP `/reconnect` `/resource_templates` `/resources/read` `/resources/subscribe` `/prompts/get`, `POST .../questions/{id}/expire`, `GET .../context/files/content` (`emulator/internal/server/routes.go`) |
| Route clio has, emulator lacks | `POST /sessions/{id}/compact` (§6.25) | ✔ not registered (only the vendor `/context/compact`) |
| Capability claims | `session_summary: false`, `attachments_upload: false` (truthful) | ✔ both `true` (its routes exist — self-consistent, so conformance passes on BOTH; passing conformance does NOT mean emulator behavior == clio behavior) |
| Permission trigger | Destructive-substring classifier + gate (section 7) | Danger keywords in the user text: `delete`, `rm `, `drop `, `truncate` (`emulator/internal/scenario/default_script.go`) |
| Backend id | `{name: "clio-agent-gact", vendor: "iowarp"}` | ✔ `{name: "gact-emulator", vendor: "gact", version: "0.2.0"}` |

Whether the emulator should be synced to the codified clio dialect or kept
deliberately loose (to force clients to stay liberal) is an **open question** —
no issue in the repo records a decision as of 2026-07-06. Do not "fix" the
emulator's dialect as a drive-by; that is a spec-first change (see
gact-change-control).

---

## 6. Resume and replay semantics (§7.1)

How reconnection actually works, and what this repo's TUI really does:

1. **Reconnect with `Last-Event-ID: <n>`** (unparseable → treated as 0). The
   server replays buffered events with `id > n`, original ids and `occurred_at`
   preserved; clio marks them `replay: true` and suppresses live duplicates of
   already-replayed ids.
2. **The buffer is bounded** (clio 256 non-transient events; emulator 1024).
   Resume beyond the window is NOT gap-free. Heartbeats (`server.heartbeat`,
   ≥ every 15 s, `{}` payload) are transient — never recorded in replay history,
   so an idle hour cannot evict real events (clio #761).
3. **Slow consumers lose events silently** (subscriber queue depth 256,
   drop-on-full, on both backends).
4. **Correct recovery for any gap: refetch `GET /v1/sessions/{id}/messages`.**
   Messages serialize via the same `to_wire()` projection as the live stream, so
   a reload is byte-identical to what streaming produced (§6.3). Any client state
   not reconstructible from REST will silently diverge — design state so a
   refetch fully rebuilds it.
5. **Ids are NOT contiguous per session** on clio (process-global counter shared
   across sessions + global events). Gap-detection by id arithmetic is invalid.
6. **Global events** (`session_id: ""` — `lm.provider.changed/.failed`,
   `mcp.server.error/.reconnected`) fan out to every session stream and appear
   in every session's replay merge — expect them on ANY stream.

**What the TUI actually does** (as of 2026-07-06):
- Resumes with `Last-Event-ID` from `connection.lastSeenSeqID`, plus per-session
  high-water marks (`lastSeenSeqIDBySession`) to suppress cross-session replay
  (`tui/internal/ui/app_connection_state.go`, `app_sse_commands.go`).
- Batches up to 128 events per Bubbletea update (`maxSSEBatchEvents`,
  `app_sse_commands.go`).
- Filters stale replays by comparing the envelope's `occurred_at` against the
  session's `UpdatedAt` (`shouldIgnoreStatusReplay` / `shouldIgnoreSessionReplay`
  in `tui/internal/ui/live_event_context.go`) — **NOT** the spec's `replay: true`
  flag, because the emulator never sets that flag (chicken-and-egg with the
  emulator-sync open question). Known weakness: client/backend clock skew could
  misclassify events. Switching to the `replay` flag is an open candidate, not
  a decision.

---

## 7. Permission control protocol (§6.11, §4.7)

The wire flow: the backend blocks a destructive tool call, emits
`permission.requested` (payload = the flat PermissionRequest row:
`{id, session_id, tool_call: {tool_name, input}, summary, created_at,
status: "pending"}` — no `subsession_id`/`call_id`/`server_id`/`annotations`),
the client replies `POST /v1/permissions/{id}` with
`{"action": "allow"|"deny"|"allow_session"|"allow_workspace"}` (204, idempotent),
and `permission.resolved` `{permission_id, action, session_id, reason?}` follows.

clio's gate order (descriptive; a call is "destructive" when its lowercase name
contains `delete|remove|rm_|drop|destroy|exec|shell|write`):

| # | Stage | Row? | Event? |
|---|---|---|---|
| 1 | user `pre_tool` hook veto → deny | NO row | NO event |
| 2 | non-destructive → fast-allow (policies never consulted) | no | no |
| 3 | session mode `plan`/`architect` → auto-deny (`session_mode_readonly`) | `auto_denied` | `resolved` only |
| 4 | policy deny | `auto_denied` | `resolved` only |
| 5 | policy allow (any allow action) | `auto_approved` | `resolved` only |
| 6 | safe-shell diagnostic fast-allow | no | no |
| 7 | interactive: pending row, turn blocks up to **600 s** | `pending` | `requested`, then `resolved` on user reply |

**The auto/direct-resolve asymmetry (the join trap):** every auto resolution
(rows 3–5) and every direct destructive route (12+ `gact.*` synthetic tool
names via `x_clio_direct_delete_permissions` — e.g. `gact.session.delete`)
emits `permission.resolved` **without any matching `permission.requested`**. A
client keying resolved→requested accumulates unmatched ids forever — tolerate
them by design.

**Timeout is silent:** on the 600 s timeout the row's status becomes `timeout`,
the call is denied, and NO `permission.resolved` event is emitted. A late reply
is a silent no-op. Poll `GET /v1/permissions?status=pending` for truth.

**Session status never says so:** during a pending permission the session stays
`running` — `waiting_permission` is declared in the enum but NEVER emitted by
clio (§4.2). Pendency is observable only via `permission.requested` + the list.

**Sticky grants:** `allow_session`/`allow_workspace` derive a persisted allow
policy (`permission_policies.json`, survives restart), appended to
`/v1/policies` and attached to the resolved row as `.policy`. Policies are
consulted ONLY for destructive-classified calls; first match wins in list order.

Replayed `permission.requested` copies may show post-resolution `status`/`action`
(the payload is mutated by reference) — §7.3a.

---

## 8. Diff protocol (§6.10, §4.5)

A proposed file change arrives as a `file_diff` part (batch `message.part.added`;
there is NO `file.diff.proposed` event) with flat fields: `path, unified_diff,
new_content` (the whole-file replacement the apply path actually writes),
`status, edit_mode, lines_added, lines_removed`.

**The frozen-status trap:** the persisted Part's `status` is frozen at
`"pending"` — its value at proposal time. Apply/reject mutate only the §6.10
diff ROWS and emit `file.diff.applied` / `file.diff.rejected` /
`file.diff.write_failed` events; `GET /messages` never reflects apply state.
**`GET /v1/sessions/{id}/diffs` + `file.diff.*` events are the only truth for
apply state.** Do not render apply state from parts.

Diff rows (`{path, applied (derived bool), status: pending|applied|rejected|
apply_failed, unified_diff?, part_id?, message_id?}`) are **in-memory only** —
lost on backend restart while the parts survive. Apply semantics: only
`pending` rows are targeted (empty `paths` = all pending); applied/rejected/
`apply_failed` rows are silently skipped, so **a failed write cannot be retried
via `/diffs/apply`**. Writes are whole-file replacements, policy-gated,
auto-audited in `/v1/permissions` (reason `user_clicked_apply`, no prompt),
refused in `plan`/`architect` mode. Returns 200 even when nothing matched.

---

## 9. Error format (§6.0, §14) — compact

Every 4xx/5xx (except `GET /health`'s 503 body) wraps ErrorInfo:

```json
{"error": {"error": "not_found", "message": "...", "details": {},
           "recoverable": false, "retry_after_s": null}}
```

- **Discriminator key is `error`** (the §14 tag). v0.1 called it `code`; the
  emulator still emits `code` (verified live 2026-07-06). Clients read
  `error ?? code`. The conformance structured-error check accepts both.
- **404 tag inconsistency:** legacy clio session-lookup 404s emit
  `internal_error`; newer routes emit `not_found` (canonical). Tolerate both.
- `retry_after_s` is never emitted by clio today.
- Tier A HTTP tags: `not_found, validation_error, bad_request, conflict,
  permission_error, unsupported, not_implemented, agent_not_available,
  provider_configuring, arc_unavailable, compaction_unavailable,
  dependency_missing, upstream_unavailable, agent_unavailable, upstream_error,
  memory_update_failed, internal_error, request_error` (§14.2).
- Tier B turn-settlement tags (in `message.completed.error_info` /
  `message.error_info`): `provider_error, provider_timeout, finalize_error,
  empty_response, cancelled, permission_error, tool_error, routing_error,
  agent_error, config_error, rate_limited` (§14.2).
- `details.recovery_actions[]` is display-only — never branch on values.

---

## 10. Drift classes (§15.8) and the conformance suite

The `contract/conformance` module (Go, in `go.work`) is the yardstick. Beyond
capability-gated shape checks, `drift_checks.go` asserts the six drift classes
from the #232 reconciliation **that actually bit a client** — memorize these;
they are the recurring failure modes:

| # | Drift class | What bit a client | Asserted by |
|---|---|---|---|
| 1 | Capability↔route truth | `session_summary`/`attachments_upload` were advertised `true` with no route (pre-Phase-0 clio) | `checkCapabilityTruth` — probes 9 single-route flags; advertised `true` must not 404/501 |
| 2 | Last-Event-ID replay returns real events | Heartbeats used to evict history → resume returned nothing (clio #761) | `checkSSEDrift` — reconnect with `Last-Event-ID: 0` after a turn must yield ≥1 non-preamble, non-heartbeat event |
| 3 | Flat `message.created` | Clients reading `payload.message.id` vs the flat `payload.id` (crush was the last nested emitter — fixed in commit `c66b885f`, PR iowarp/gact-tui#248) | `checkSSEDrift` |
| 4 | `session.updated` carries the full Session | Partial payloads left client session state stale | `checkSSEDrift` |
| 5 | Rollback envelope keys | Clients reading `reverted_messages`, which never existed on the reconciled wire | `checkRollbackEnvelope` (legacy keys tolerated for pre-reconciliation backends) |
| 6 | `POST /compact` accepts `{focus}` | v0.1 sketched `{auto, instructions}` | `checkCompactFocus` (404/501 = route not offered = skip; 5xx readiness = pass) |

Execution paths:
- **CI:** `TestConformance_AgainstEmulator` (`contract/conformance/conformance_test.go`)
  boots a fresh emulator and runs the full suite — included in `make test`.
  Emulator-only: remember the self-relativity trap (dialect table) — the
  emulator advertising `session_summary: true` passes check #1 because ITS
  route exists.
- **Against any live backend:** `gact conformance --backend http://127.0.0.1:8100`
  (`tui/cli_diagnostics.go`; `--workspace`, `--skip Health,SSE,...` supported).
  This is the only way adapter drift gets caught — no adapter runs
  `conformance.Run` in its own tests as of 2026-07-06.
- Mutating checks (PATCH title, rollback, compact) run only when the suite
  created the session itself (`opts.SessionID == ""`).

---

## 11. Known gaps table (§15.7, §7.3b — documented as-is, do not "discover" these)

| Gap | Consequence for clients | SPEC |
|---|---|---|
| No `session.deleted` broadcast | A session deleted by another client is unobservable; list refetch is unreliable (workspace+archive filtered). PROPOSED fix (owner decision on iowarp/gact-tui#232): broadcast `{session_id, workspace_id}` — **not current behavior, do not depend on it** | §6.2, §7.3b |
| No concurrency guard on `POST /messages` | Posting while `running` starts a second concurrent turn; `prev_status` in the resulting `status_changed` is hardcoded `"idle"`. Clients must self-serialize sends | §6.3 |
| Pagination ignored everywhere | `GET /sessions` ignores `limit`/`before`/`parent_session_id` (so a subsession UI filtering on it sees ALL sessions); `GET /messages` ignores `before`/`limit`/`include_system`, `next_cursor` always null — full unbounded ledger every time | §6.2, §6.3, §15.2 |
| Fork inherits nothing | `mode`/`edit_mode`/`routing_mode`/`model`/`agent`/`metadata` reset to store defaults (`chat`/`diff`/`auto`, agent `main`); context files ARE copied; no SSE event | §6.2, §4.2 |
| `waiting_permission` never emitted | Session stays `running` during pending permissions (section 7) | §4.2 |
| Permission timeout is silent | No `permission.resolved` on timeout; late reply = silent no-op | §6.11 |
| `file_diff` part status frozen at `pending` | `GET /diffs` + `file.diff.*` are the only apply-state truth; rows are in-memory only (section 8) | §4.5, §6.10 |
| UserQuestion `expired` inert | Declared, never set; `expires_at` stored, unenforced; no expiry event | §6.23 |
| Legacy `internal_error` on 404/422 | Tolerate `internal_error` where `not_found`/`validation_error` is meant | §6.0, §14.2 |
| `turn.*` channel: zero consumers, provisional | Do not build on it until iowarp/gact-tui#232 resolves | §7.3c |
| Per-connection heartbeats | N attached clients see up to N heartbeats per 15 s. Harmless (transient) | §7.1 |

---

## 12. Probe the wire yourself (verified 2026-07-06, this machine)

Boot the emulator and watch a full turn. PowerShell (uses Windows' bundled
`curl.exe`; `--%` stops PowerShell from mangling arguments):

```powershell
# From the repo root D:\Libraries\Documents\projects\gact-tui
go build -o bin/emulator-probe.exe ./emulator/cmd/emulator-server
Start-Process -NoNewWindow bin/emulator-probe.exe -ArgumentList '-port','7791'
curl.exe -s http://127.0.0.1:7791/v1/capabilities
# Create a session (emulator REQUIRES workspace_id — clio would default it):
curl.exe -s -X POST http://127.0.0.1:7791/v1/sessions -H "Content-Type: application/json" --% -d "{\"workspace_id\":\"ws_default\",\"title\":\"probe\"}"
# Subscribe (put the returned sess_... id in): stream prints live
curl.exe -s -N http://127.0.0.1:7791/v1/sessions/<SID>/events
# In a second terminal, post a message (emulator rejects the `text` field — use parts):
curl.exe -s -X POST http://127.0.0.1:7791/v1/sessions/<SID>/messages -H "Content-Type: application/json" --% -d "{\"parts\":[{\"type\":\"text\",\"text\":\"hello\"}]}"
# Replay probe: reconnect with a resume point
curl.exe -s -N -H "Last-Event-ID: 5" http://127.0.0.1:7791/v1/sessions/<SID>/events
```

Bash (Git Bash) equivalent of the message post:

```sh
curl -s -X POST "http://127.0.0.1:7791/v1/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"parts":[{"type":"text","text":"hello"}]}'
```

Conformance against any backend:

```powershell
go build -o bin/gact-probe.exe ./tui
bin/gact-probe.exe conformance --backend http://127.0.0.1:7791
```

`make run-emulator` (PORT=7777 default) also works from Git Bash. When reading
capture files, use the Read tool on the raw SSE text — do not grep for expected
patterns only; unknown event types and shape drifts are exactly what pattern
filters miss.

---

## When NOT to use this skill

- **Running/operating** the emulator, TUI, clio, web, or desktop (ports,
  artifacts, cleanup) → **gact-run-and-operate**.
- **Changing** the wire (new endpoint/event/field) — that is spec-first, gated
  work → **gact-change-control**; design rationale and invariants →
  **gact-architecture-contract**.
- **Debugging** a live failure whose cause you don't know yet →
  **gact-debugging-playbook**; proving a wire hypothesis with captures/
  differentials → **gact-proof-and-analysis-toolkit**.
- **Rendering** what arrived on the wire (markdown, TUI components, web Live*
  engine) → **gact-bubbletea-reference** / **gact-web-rendering-reference**.
- **Cross-surface capability parity** work → **gact-interface-parity-campaign**.
- **Config axes** (env vars, emulator flags, TUI config.json) →
  **gact-config-and-flags**.
- **Test/evidence standards** (what green means, golden inventory) →
  **gact-validation-and-qa**.

---

## Provenance and maintenance

Primary sources: `contract/SPEC.md` (v0.2, 2,284 lines, reconciled 2026-07-01
against clio-agent `develop @ 3527143`), `contract/conformance/*.go`,
`emulator/internal/{server,scenario,events}`, `tui/internal/client/sse.go`,
`tui/internal/ui/live_*.go`. Live-wire rows were captured 2026-07-06 against an
emulator built from this repo's HEAD.

Re-verify volatile facts before relying on them:

```powershell
# SPEC still v0.2 / reconciliation note unchanged:
Get-Content contract/SPEC.md -TotalCount 20
# Emulator dialect (thinking_append / cost.updated / no snapshot):
Select-String -Path emulator/internal/scenario/scenario.go -Pattern 'thinking_append|cost.updated'
Select-String -Path emulator/internal/server/handlers_events.go -Pattern 'session.snapshot'   # expect no hits
# Emulator route list (global /v1/events, summarize, attachments still registered?):
Select-String -Path emulator/internal/server/routes.go -Pattern 'HandleFunc'
# Adapters still on contract_version 0.1?
Select-String -Path adapters/opencode/server.go,adapters/crush/server.go,adapters/goose/server.go,adapters/claudecode/server.go -Pattern 'ContractVersion'
# TUI still filtering replays by occurred_at (not the replay flag)?
Select-String -Path tui/internal/ui/live_event_context.go -Pattern 'occurred_at|replay'
# Drift-check inventory:
Select-String -Path contract/conformance/drift_checks.go -Pattern 'func check'
# Open questions still open? (emulator-sync decision, turn.* fate, session.deleted):
gh issue view 232 --repo iowarp/gact-tui
# Capability flag list (live):
curl.exe -s http://127.0.0.1:7791/v1/capabilities   # after booting the emulator
```

If clio has moved past `3527143` or SPEC.md's reconciliation note has a newer
date, re-verify sections 3–11 against the updated SPEC before trusting this
file's specifics.
