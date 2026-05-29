# Clio / TUI / Desktop capability gap audit

> **Status (2026-05-28):** all 10 priorities from the "Recommended priorities"
> section below are now closed on `feat/apps-harness` HEAD. Gap #1 (ask-user
> card) at `21aeb54`; #2 (MCP install + reconnect + uninstall) at `52ae7fb`;
> #3 (workspace `@`-picker) at `9fb71e7`; #4 (backend search via Cmd+Shift+F)
> at `0333687`; #5 (session import) at `515a4d1`; #6 (per-message delete)
> at `17aef58`; #7 (memory event log) at `0d4cb64`; #8 (detailed provider
> models) at `9ae651e`; #9 (paste compression) at `06983d1`; #10 (read-only
> hooks / policies / blueprints / expert-packs settings) at `fef378b`.
>
> **Medium-tier follow-up pass:** #7 theme editor (`319cbae`), #7 locale
> switcher (`aef0e2d`), #9 Ctrl+G compose modal (`3571d12`), #13 catalog
> browser (`d59d4e7`), cross-session memory search at `78c8464`, archive
> filter view at `c97d6f2`, autorename hint at `8bce7c5`.
> See `apps/CHANGELOG.md` for the running list.


Snapshot date: 2026-05-28. Sources:
- **Clio (the agent backend)** — `clio-agent` repo, `develop` @ `05ce786`. Authoritative file `src/clio_agent/gact/app.py`.
- **TUI** — `gact-tui` repo, `develop` branch, `tui/internal/client/client.go` + `tui/internal/ui/`.
- **Desktop** — `gact-tui` repo, `feat/apps-harness` HEAD, `apps/web/src/` (+ `apps/core/src/client/http.ts`).

## TL;DR

Clio's GACT v0.2 develop surface has **120 HTTP routes** across **21 endpoint families** and **28 SSE event types**, plus **39 capability flags** (25 v0.1 baseline, 5 v0.2 additions, 9 CLIO vendor extensions).

The TUI covers ~70 % of Clio's HTTP surface and 12 of 28 SSE events. The Desktop covers ~60 % of the HTTP surface and 17 of 28 SSE events (different mix than TUI — Desktop reduced more part-level events; TUI hits more session-level mutation routes). **Neither client uses agent-blueprints, expert-packs, hooks, policies, or any of the agent-callable memory tools.** The TUI dominates on file/MCP/voice/policy depth; the Desktop dominates on chrome polish, palette navigation, discovery search, and SSE auto-recovery.

Below is the three-way matrix, then four named gap lists:
1. **TUI features the Desktop should adopt** (highest leverage for v0.9.x catch-up)
2. **Desktop features the TUI is missing** (less actionable from our side but informative)
3. **Clio features neither client uses** (product roadmap candidates)
4. **Endpoints both clients call but with different depth**

---

## Three-way matrix

Legend: ● = full UI + RPC wired · ◐ = RPC wired but no UI · ○ = neither · n/a = doesn't apply

### Sessions

| Capability | Clio route | TUI | Desktop |
|---|---|---|---|
| List | `GET /v1/sessions` (filters: workspace_id, parent_session_id, archived) | ● uses all filters | ● uses workspace_id, no archived filter |
| Create | `POST /v1/sessions` | ● accepts agent, model, parent, fork-at | ● title + workspace only |
| Fork at message | `POST /v1/sessions/{id}/fork` | ◐ RPC wired, no UI picker | ● kebab menu + palette |
| Patch (title / archived / mode / model) | `PATCH /v1/sessions/{id}` | ● all fields | ● title, archived, model, perm mode |
| Delete | `DELETE /v1/sessions/{id}` | ● kebab + 2-step confirm | ● kebab + confirm |
| Cancel | `POST /v1/sessions/{id}/cancel` | ● Ctrl+X + /cancel | ● Esc + Composer Stop |
| Summarize | `POST /v1/sessions/{id}/summarize` | ● /summarize palette | ● Cmd+K `summarize session` |
| Compact | `POST /v1/sessions/{id}/compact` | ◐ /compact palette (501 stub note) | ● Cmd+K `compact session` |
| Undo | `POST /v1/sessions/{id}/undo` | ● /undo | ● Cmd+K `undo last turn` |
| Rewind | `POST /v1/sessions/{id}/rewind` | ◐ RPC wired, no UI | ◐ RPC wired, no UI |
| Export | `GET /v1/sessions/{id}/export` | ◐ RPC wired, no UI | ● kebab + Cmd+S |
| Import | `POST /v1/sessions/import` | ◐ RPC wired, no UI | ○ |
| Share link | `POST /v1/sessions/{id}/share` + `GET /v1/shared/{token}` | ○ | ● kebab → copies link |
| Context policy | `GET /v1/sessions/{id}/context/policy` | ○ | ○ |
| Pin to top (client-side) | `metadata.pinned` field | ◐ code checks `metadata[pinned]` but no toggle | ● localStorage-backed, kebab toggle, divider |
| Archive | `PATCH archived` + `?archived=true` filter | ● dedicated `h` toggle + filter | ● PATCH wired, no filter view |
| Running-only filter | client-side | ○ | ● checkbox |
| Status pulse on SSE bump | client-side | ○ | ● 1.8 s row pulse |

### Messages, parts, streaming

| Capability | Clio route / event | TUI | Desktop |
|---|---|---|---|
| List + pagination | `GET /v1/sessions/{id}/messages?before=&limit=&include_system=` | ● uses `before` cursor | ● no cursor (no need yet) |
| Post user message | `POST /v1/sessions/{id}/messages` | ● composer | ● composer |
| Delete single | `DELETE /v1/sessions/{sid}/messages/{id}` (+ legacy `/v1/messages/{id}`) | ● kebab → Delete | ○ |
| Retry attempt | `POST /v1/sessions/{sid}/messages/{message_id}/retry` (#342) | ○ | ○ |
| List attempts | `GET /v1/sessions/{sid}/attempts` (#342) | ○ | ○ |
| Server-side search | `GET /v1/sessions/{sid}/messages/search?q=` | ● Cmd+F hits backend | ● Cmd+F is client-side (RPC unused) |
| Cross-session search | `GET /v1/memory/search` (#351) | ○ | ○ |
| Streaming text | SSE `message.part.delta` | ● live | ● live + blinking cursor ▌ |
| Streaming cursor | client-side | ○ | ● ▌ on last in-flight text part |
| Autoscroll while at bottom | client-side | ● | ● + "N new" pill when scrolled up |
| Diff parts | SSE `message.part.added` type=`file_diff` | ● inline + Apply/Reject + per-message diffs | ● inline + DiffPane; click in Inspector tab |
| Thinking parts | SSE `message.part.added` type=`thinking` | ● collapsed by default | ● collapsed; word count summary |
| Tool calls | SSE `tool.call.{started,completed}`, plus dynamic `{tool}.completed/{tool}.denied` | ● inline + Inspector Tools tab | ● inline + Inspector Tools tab w/ I/O copy |
| Tool call progress | SSE `tool.call.progress` (PR #346 progress) | ○ | ● topbar `running · grep, bash` chip with `%` |
| Inline error pill | `error_info` on Message | ◐ error chip | ● red callout with `error.error` + Retry |
| Quote into composer | client-side | ◐ "Quote" hover button | ● Quote action drops `> ` blockquote |
| Regenerate | client-side resend of prior user text | ● /regen palette | ● per-message Regenerate button |

### Permissions

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List + status filter | `GET /v1/permissions?session_id=&status=` | ● | ● (only `pending`) |
| Respond | `POST /v1/permissions/{id}` | ● inline card | ● inline PermissionCard |
| Modes (`once / session / always_tool / always_server`) | scope param | ● all four | ● all four |
| Direct delete (`x_clio_direct_delete_permissions=True`) | `DELETE /v1/permissions/{id}` | ◐ | ○ |
| Permission mode chip + click-to-reset | client-side | ● topbar perm chip resets to ask | ● topbar perm chip (warn/err tone) resets to ask |
| Diffs needing review | `GET /v1/sessions/{id}/diffs`, `/messages/{message_id}/diffs` | ● both routes used | ◐ uses inline file_diff parts only |
| Apply/reject batch | `POST /v1/sessions/{id}/diffs/{apply,reject}` | ● per-path | ● per-hunk on DiffPane |

### Workspaces & files

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List | `GET /v1/workspaces` | ● Ctrl+W picker + sidebar | ● discovery + SessionsColumn switcher |
| Create | `POST /v1/workspaces` | ◐ RPC unwired; no form | ● `+ New workspace` form |
| Get / patch / delete | GET/PATCH/DELETE `/v1/workspaces/{id}` | ◐ list only | ◐ list + create only |
| File tree | `GET /v1/workspaces/{id}/files` | ● file picker modal | ○ |
| Read file | `GET /v1/workspaces/{id}/files/read?path=` | ● picker preview | ○ |
| Repo map | `GET /v1/workspaces/{id}/repo_map` | ● `/repo` shows tree | ○ |
| Runtime scope (#381) | `runtime_scope` on Session/Workspace | ○ | ○ |

### Providers / LM config

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List providers | `GET /v1/providers` | ● | ● discovery + Settings → Models |
| Provider auth (OAuth/api_key) | `POST /v1/providers/{id}/auth` | ● live "Authenticate" button | ● Auth button on provider card |
| List models per provider | `GET /v1/providers/{id}/models` | ● detailed variant | ◐ basic — uses `metadata.models` only |
| Active LM info | `GET /v1/providers/lm` | ● Settings → LM modal | ● Settings → Models card |
| Switch active LM | `PUT /v1/providers/lm` | ● first-connect modal + Settings | ● "Use as LM" button |
| Provider detail (single) | `GET /v1/providers/{id}` | ○ | ○ |

### MCP servers

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List servers | `GET /v1/mcp/servers` | ● discovery + per-server detail | ● discovery page |
| Get one | `GET /v1/mcp/servers/{id}` | ● detail tab | ○ |
| Install (stdio / sse / http) | `POST /v1/mcp/servers` | ● `mcp install` modal | ○ |
| Uninstall | `DELETE /v1/mcp/servers/{id}` | ● `mcp remove` picker | ○ |
| Reconnect | `POST /v1/mcp/servers/{id}/reconnect` | ● | ○ |
| List tools / resources / prompts per server | `GET /v1/mcp/servers/{id}/{tools,resources,prompts}` | ● per-server tabs | ◐ only counts shown |
| Read resource | `POST /v1/mcp/servers/{id}/resources/read` | ● | ○ |
| Call tool | `POST /v1/mcp/servers/{id}/call` | ◐ via agent | ○ |

### Prompts & expert packs

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List prompts | `GET /v1/prompts` | ○ (client knows of endpoint, no surface) | ● Prompts discovery page (+ Settings) |
| Get prompt | `GET /v1/prompts/{id:path}` | ○ | ● click prompt card → expand profile text |
| Render with vars | `POST /v1/prompts/{id}/render` | ○ | ○ |
| Validate | `POST /v1/prompts/{id}/validate` | ○ | ○ |
| Reload from disk | `POST /v1/prompts/reload` | ○ | ● button on Prompts page |
| Update custom prompt | `PUT /v1/prompts/{id}` | ○ | ○ |
| List expert packs (#344) | `GET /v1/expert-packs` | ○ | ○ |
| Validate expert pack | `POST /v1/expert-packs/validate` | ○ | ○ |
| Attach to session (#376/#377) | `POST /v1/sessions/{id}/expert-pack` | ○ | ○ |
| Get session pack | `GET /v1/sessions/{id}/expert-pack` | ○ | ○ |

### Agents & agent blueprints

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List | `GET /v1/agents` (+ tier filter) | ● Catalog Browser + Settings picker | ● discovery + Settings |
| Get | `GET /v1/agents/{id}` | ● detail | ◐ (list only) |
| Register | `POST /v1/agents` | ○ | ○ |
| Update | `PUT /v1/agents/{id}` | ○ | ○ |
| Delete | `DELETE /v1/agents/{id}` | ○ | ○ |
| Extract from session (#340) | `POST /v1/agents/extract` | ○ | ○ |
| List blueprints (#386/#387) | `GET /v1/agent-blueprints` | ○ | ○ |
| Validate / install / update / uninstall blueprint | `POST/.../DELETE /v1/agent-blueprints/...` | ○ | ○ |
| Activate blueprint MCP | `POST /v1/agent-blueprints/{bp}/mcp/{did}/enable` | ○ | ○ |
| Get/set session blueprint | `GET/POST /v1/sessions/{id}/agent-blueprint` | ○ | ○ |

### Commands

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List | `GET /v1/commands` | ● palette merge + discovery (`/v1/tools` too!) | ● palette merge + Tools discovery |
| Invoke | `POST /v1/sessions/{id}/commands/{cmd}` | ● local + plugin shortcuts | ◐ sent as message text (not the dedicated route) |
| User-defined (#340) | via `agent.extract` + `command.agent_invocable` policy | ◐ surfaced if backend emits | ◐ surfaced if backend emits |

### Catalog / tools (separate from /v1/commands)

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| `GET /v1/tools` system tools | | ● Tools page | ○ (Desktop "Tools" page uses /v1/commands instead) |
| `GET /v1/tools/{id}` | | ● detail | ○ |
| `GET /v1/catalog/tools` global inventory | | ○ | ○ |

### Memory

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| Stats | `GET /v1/memory/stats?session_id=` | ● topbar memory chip + inspector | ● Memory discovery page |
| Memory events log | `GET /v1/sessions/{id}/memory/events` | ● Memory inspector modal | ○ |
| Single event | `GET /v1/sessions/{id}/memory/events/{eid}` | ◐ RPC | ○ |
| Cross-session search (#351) | `GET /v1/memory/search` | ○ | ○ |
| Agent-callable memory tools (#379) | `POST /v1/sessions/{id}/memory/tools/{search-sessions,read-session-summary,read-context-frame}` | n/a (agent-only) | n/a (agent-only) |

### Context (per session)

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List context files | `GET /v1/sessions/{id}/context/files` | ● sidebar tab | ● Inspector Context tab |
| Add | `POST /v1/sessions/{id}/context/files` (modes: read/edit/pin) | ● `o` key + mode picker | ● Pin button on file_diff chips |
| Remove | `DELETE /v1/sessions/{id}/context/files` | ● kebab | ● hover X in Context tab |
| Context frames | `GET /v1/sessions/{id}/context/frames` + `/{frame_id}` | ○ | ○ |

### Tasks (per session)

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List | `GET /v1/sessions/{id}/tasks` | ● Inspector tab + badges in sidebar | ● Inspector Tasks tab |
| Create | `POST /v1/sessions/{id}/tasks` | ● | ◐ RPC wired, no UI |
| Patch | `PATCH /v1/tasks/{id}` | ● mark done | ◐ RPC wired |
| Delete | `DELETE /v1/tasks/{id}` | ● | ◐ RPC wired |

### Ask-user (#342 retry / #380 resume)

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List questions | `GET /v1/sessions/{id}/questions` | ○ | ◐ `Client.sessionQuestions()` wired, no UI |
| Create | `POST /v1/sessions/{id}/questions` | ○ | ○ |
| Answer | `POST /v1/sessions/{id}/questions/{qid}/answer` | ○ | ○ |
| Cancel | `POST /v1/sessions/{id}/questions/{qid}/cancel` | ○ | ○ |

### Schedules

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| List session schedules | `GET /v1/sessions/{id}/schedules` | ○ | ○ |
| Create | `POST /v1/sessions/{id}/schedules` | ○ | ○ |
| Delete | `DELETE /v1/schedules/{id}` | ○ | ○ |

### Policies & hooks

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| Get/put policies | `GET/PUT /v1/policies` | ◐ RPC wired, no UI | ○ |
| List hooks | `GET /v1/hooks` | ◐ RPC wired, no UI | ○ |
| Register hook | `POST /v1/hooks` | ◐ RPC wired, no UI | ○ |
| Delete hook | `DELETE /v1/hooks/{id}` | ◐ RPC wired, no UI | ○ |

### Voice

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| Transcribe | `POST /v1/sessions/{id}/voice/transcribe` | ● Ctrl+Y (user-config'd shell capture) | ○ |

### Admin / health

| Capability | Clio | TUI | Desktop |
|---|---|---|---|
| Health | `GET /v1/health` | ● Doctor modal | ● Doctor discovery page |
| Capabilities | `GET /v1/capabilities` | ● gates per-flag rendering | ● gates LeftRail entries |
| Capability gaps (#353) | `GET /v1/capability-gaps` | ◐ Inspector Health tab consumes | ● Doctor "Capability gaps" section |
| Metrics | `GET /v1/metrics` | ● raw modal | ● Metrics discovery page |

### SSE event coverage

| Event | Clio | TUI handles | Desktop handles |
|---|---|---|---|
| `server.connected` | ● | ○ (noop) | ○ (noop) |
| `server.heartbeat` | ● | ○ (noop) | ○ (noop) |
| `session.status_changed` | ● | ● status chip | ● row pulse + chip |
| `session.created` | ● | ● sidebar insert | ● sidebar insert |
| `session.updated` | ● | ● autorename + refresh | ● `updatedAt='just now'` + row pulse |
| `session.deleted` | ● | ● | ● |
| `session.cleared` | ● | ● drops messages, refetches | ○ |
| `session.compacted` | ● | ◐ | ○ |
| `session.summarized` | ● | ◐ | ○ |
| `session.undo` / `.rewind` | ● | ◐ refetch | ◐ refetch via `transcript.refetch()` |
| `message.created` | ● | ● | ● |
| `message.completed` | ● | ● tokens + cost | ● tokens + cost + tone-coloured toast |
| `message.deleted` | ● | ● | ○ |
| `message.part.added` | ● | ● | ● |
| `message.part.delta` | ● | ● cursor + delta | ● streaming cursor + delta |
| `message.part.completed` | ● | ● | ○ |
| `message.error` | ● | ● error pill | ● inline red pill + Retry |
| `permission.requested` | ● | ● card | ● PermissionCard |
| `permission.resolved` | ● | ● dismiss | ● dismiss |
| `cost.updated` | ● | ● $ chip | ● topbar cost chip |
| `tool.call.started` | ● | ● spinner | ● running-tools chip |
| `tool.call.progress` | ● | ○ | ● `tool · 47%` chip |
| `tool.call.completed` | ● | ● | ● |
| Dynamic `{tool}.completed` / `.denied` | ● | ● audit row | ○ |
| `subagent.started` / `.completed` | ● | ● sidebar refresh | ○ |
| `notification` | ● | ● transient hint | ● toast + Notification Center history |
| `user_question.*` (4) | ● | ○ | ○ |
| `turn.retry_requested` / `.retry_granted` | ● | ○ | ○ |
| `context.frame.created` / `.completed` | ● | ○ | ○ |
| `context.file.added` / `.removed` | ● | ● sidebar refetch | ◐ |
| `file.diff.{applied,rejected,write_failed}` | ● | ● Diff pane | ● DiffPane |
| `memory.search.completed` | ● | ◐ | ○ |
| `lm.provider.{changed,failed}` | ● | ● topbar + toast | ◐ toast on error |
| `mcp.server.status` | ● | ● discovery refresh | ◐ |
| `mcp.{tools,resources,prompts}.list_changed` | ● | ● discovery refetch | ○ |
| `mcp.resources.updated` | ● | ● | ○ |

**SSE summary:** TUI handles 27 / 28 published types meaningfully; Desktop handles 17 / 28 (no `subagent.*`, `context.frame.*`, `user_question.*`, `turn.retry_*`, `memory.search.completed`, `mcp.*.list_changed`, `mcp.resources.updated`, `session.cleared`, dynamic `{tool}.*`).

---

## 1. TUI features the Desktop should adopt

Ranked by user impact and implementation cost.

### High-leverage gaps (close before tagging v1.0)

1. **MCP install + remove + reconnect + call resource**. TUI's `mcp install` JSON-modal is the primary way a new user wires Slack / GitHub / etc. The Desktop's MCP page is read-only. Backend routes: `POST /v1/mcp/servers`, `DELETE /v1/mcp/servers/{id}`, `POST /v1/mcp/servers/{id}/reconnect`, `POST /v1/mcp/servers/{id}/resources/read`. *(client.go:655–685)*
2. **Workspace file browser + repo_map**. TUI lets users `@`-mention a workspace file from a fuzzy picker that hits `/v1/workspaces/{id}/files`. Desktop's `@`-picker today uses a hardcoded `DEFAULT_ITEMS` list. Routes: `GET /v1/workspaces/{id}/files`, `GET /v1/workspaces/{id}/files/read?path=`, `GET /v1/workspaces/{id}/repo_map`. *(client.go:610, 712, 722)*
3. **Backend message search**. Desktop's Cmd+F is client-side substring; TUI hits `GET /v1/sessions/{id}/messages/search?q=` and gets relevance-scored hits across long transcripts. Should swap when the active session has >300 messages. *(client.go:307)*
4. **Session import**. Desktop only exports. TUI has `POST /v1/sessions/import` wired (no UI). Easy add — file picker + POST. *(client.go:763)*
5. **Ask-user retry protocol UI (#342 / #380)**. Neither client has UI yet. Backend ships full surface (4 routes + 4 SSE events). When the orchestrator pauses for clarification, both clients drop the question on the floor. We have `Client.sessionQuestions()` wired on Desktop — needs a card.
6. **Voice transcribe** (`POST /v1/sessions/{id}/voice/transcribe`). TUI binds Ctrl+Y to a user-configurable shell capture. Desktop has no path. Tauri can wire `mic-recorder` plugin → bytes → multipart POST. *(client.go:861)*

### Medium-impact

7. **Per-color theme editor + locale switcher**. TUI persists `theme = {primary: "...", muted: "...", ...}` + en/es/ja in `~/.config/gact/config.json`. Desktop's Appearance page has only dark/light/auto pickers (light/auto are stubbed). *(config.go:25–62, app.go:settings.theme)*
8. **Paste compression**. TUI auto-collapses pastes ≥3 lines into `[pasted N lines]` placeholder with Ctrl+P expand. Reduces composer scroll on long log dumps.
9. **Compose modal** (Ctrl+G fullscreen textarea). For multi-paragraph prompt authoring without the chrome.
10. **Per-message delete** (`DELETE /v1/sessions/{sid}/messages/{id}`). TUI has a "Delete message" kebab item; Desktop doesn't.
11. **Plugins discovery from `~/.config/gact/plugins/`**. TUI execs third-party binaries on slash-command invocation. Could be a desktop power-user feature.
12. **Memory inspector modal** (`GET /v1/sessions/{id}/memory/events` + `/{event_id}`). TUI's `/memory` opens a real-time view of cache stats + event log. Desktop's Memory page just shows stats.
13. **Catalog browser** as a unified discovery shell. TUI has one component that handles agents / tools / mcp-servers / commands with a single search box. Desktop has separate pages — fine, but lacks "search across all categories" entry point.

### Low-impact / nice-to-have

14. **Detached registry**. TUI tracks sessions the user walked away from via Ctrl+Z and surfaces them on relaunch. Desktop's `clio.active-session.<url>` persistence covers single-session restore; no multi-session walked-away set.
15. **Autorename hint banner**. When backend renames a session via SSE `session.updated`, TUI shows a transient "agent: $id" hint.
16. **Archive filter view**. Desktop wires PATCH `archived` but never queries `?archived=true` to view the archive bucket.
17. **Custom intro splash** (config `intro_file = "<path>.ans"`). Power-user vanity.

---

## 2. Desktop features the TUI is missing

Listed for symmetry; less actionable from the desktop side.

1. **Notification Center** (bell icon, last 50 toasts, unseen badge).
2. **Cmd+K palette dynamic items** — session jumps, perm switches, settings deep-links (the TUI's slash palette is keyword-flat).
3. **Discovery search bars** on Agents / Tools / Prompts / MCP / Workspaces / Providers.
4. **Inspector tabs** (Turn / Tools / Diffs / Thinking / Tasks / Context / Health) with click-to-expand tool call I/O + Copy buttons.
5. **Prompts discovery page** with click-to-render default profile text (`GET /v1/prompts/{id}`).
6. **Per-prompt validation error chip** (`PromptDef.validation_errors`).
7. **Markdown tables** + GitHub task lists + autolinks + `==highlight==` + `~~strike~~` + horizontal rules.
8. **Streaming cursor (▌)** at the in-flight assistant tail.
9. **Code block hover Copy + language badge**.
10. **SSE auto-reconnect with explicit backoff ladder** and `sse · reconnecting in Ns` countdown in topbar.
11. **Pin-to-context from a file_diff chip** in the transcript.
12. **Quote action** that drops `> `-prefixed text into the composer.
13. **Reset all preferences** button in Settings (wipes `clio.*` localStorage).
14. **Workspace creation form** on the Workspaces discovery page.
15. **Splash error recovery** with Retry button + OS-aware install recipe.

---

## 3. Clio features neither client uses

The "product roadmap" set — backend ships these but nobody surfaces them.

### Agent blueprints & expert packs (PRs #344, #376, #386, #387)
- Blueprint CRUD: `GET/POST/PUT/DELETE /v1/agent-blueprints/[{bp}]`
- Blueprint validate + install + update + uninstall + MCP-enable
- Session blueprint binding: `GET/POST /v1/sessions/{id}/agent-blueprint`
- Expert pack CRUD: `GET /v1/expert-packs`, `/{pack_id:path}`, `POST /v1/expert-packs/validate`
- Session pack binding: `GET/POST /v1/sessions/{id}/expert-pack`

**Why it matters:** these are the runtime-customisation entry points for power users. A user installing a custom DSPy blueprint or swapping the planner prompt pack today has no UI in either client — they have to edit config files. Both clients should at minimum surface "current blueprint / pack" in Settings.

### Hooks (`/v1/hooks`)
Pre/post-message + pre/post-tool handler URIs. Neither client has UI. Power tool for users who want every CLIO turn to also POST to their own webhook (logging / Slack / etc.).

### Policies (`/v1/policies`)
Global + workspace policy: `mode: auto/manual/blocked` per `tools / commands / memory`. PR #378 adds the `command.agent_invocable` gate. Neither client renders the policy. Desktop's permission-mode chip is local-only; backend has a full policy engine that's currently invisible.

### Ask-user retry / resume (#342, #380)
4 routes + 4 SSE events. Both clients ignore. The orchestrator can ask a clarifying question mid-turn; if no client renders it, the turn just stalls. Highest-priority gap.

### Cross-session memory search (#351)
`GET /v1/memory/search` returns hits across every session in the workspace. Neither client surfaces. Useful as a top-level "search everything I've ever asked CLIO" command.

### Schedules
`GET/POST /v1/sessions/{id}/schedules`, `DELETE /v1/schedules/{id}`. Cron-style triggers per session. Neither client has UI.

### Sharing
Desktop wires share-link generation; neither client renders an inbound `GET /v1/shared/{token}` view (i.e. there's no "open shared session" route in either UI).

### Context frames
`GET /v1/sessions/{id}/context/frames` + `/{frame_id}`. The agent's time-series memory snapshots. SSE emits `context.frame.{created,completed}`. Neither client surfaces.

### Provider detail / per-provider models detailed
`GET /v1/providers/{id}` (single detail) and the "detailed" variant of `/v1/providers/{id}/models` with `Source` + `Error` fields. TUI uses detailed; Desktop uses the basic list.

### Capability gaps metadata
`GET /v1/capability-gaps` returns rows like `{voice: {status: "unsupported", category: "future_capability", description: "..."}}`. Desktop renders these on Doctor; TUI consumes them in Inspector → Health but doesn't surface the metadata fields explicitly.

### Provider-changed / failed events
`lm.provider.{changed,failed}`. TUI updates topbar + shows toast; Desktop only toasts on error.

---

## 4. Endpoints both clients call but with different depth

- `GET /v1/providers/{id}/models` — TUI uses the detailed variant (`Source` + `Error`), Desktop uses the basic version off `metadata.models`. Loses information about deprecated / failing models.
- `GET /v1/sessions/{id}/messages/search` — TUI calls the backend route; Desktop runs an in-page substring search. Same UX, very different scaling characteristics.
- `POST /v1/sessions/{id}/commands/{cmd}` — TUI calls this directly; Desktop sends the trigger as a user message and lets the backend's slash-parser fire it. Works, but loses any per-command argument schema.
- Diff workflow — TUI uses `GET /v1/sessions/{id}/diffs` + `/messages/{message_id}/diffs` as a discovery entry point; Desktop only reacts to `file_diff` parts as they arrive.
- `metadata.pinned` field — TUI's code checks it but doesn't render a toggle. Desktop maintains its own per-backend `clio.pinned.<url>` localStorage set. Cross-client coherence would require both moving onto the metadata field.
- Capability gates — TUI gates per-flag rendering on `caps.<flag>`. Desktop's LeftRail filters its entries the same way. They use different flag names in a couple of cases (TUI checks `caps.doctor`, Desktop checks `caps.integration_health`).

---

## Numbers

| Metric | Clio | TUI | Desktop |
|---|---|---|---|
| HTTP routes (exposed / consumed) | 120 / 120 | n/a / ~85 | n/a / ~70 |
| SSE event types meaningfully handled | 28 emitted | 27 | 17 |
| Capability flags advertised | 39 | gates ~20 | gates ~12 |
| Endpoint families with UI | 21 | 18 | 12 |
| Settings depth (config keys persisted) | n/a | 13 + per-color theme | 9 |
| Locale support | n/a | en / es / ja | en only |
| Voice path | route exists | wired | none |
| Hook / policy UI | engine exists | RPC only | none |

---

## Recommended priorities for the desktop

The order I'd ship these in v0.9.2 → v1.0:

1. **Ask-user question card** (#342/#380). Backend ships; both clients ignore; turns silently stall. Highest impact.
2. **MCP install / remove / reconnect modal**. Today the Desktop's MCP page is read-only and users have to edit config files to add a new MCP server.
3. **Workspace file `@`-picker** backed by `GET /v1/workspaces/{id}/files`. The current hardcoded list looks like a demo.
4. **Backend `messages/search`** when transcripts > N messages, fall back to client-side under.
5. **Session import** form (just file picker + POST).
6. **Voice button** in the composer (Tauri mic capture + multipart POST).
7. **Capability surface for hooks / policies / blueprints / expert packs** — at minimum read-only Settings sections so they're discoverable.
8. **Detailed provider models** view with deprecated / failing flags.
9. **Per-color theme editor** in Settings → Appearance (replaces the stubbed light/auto pickers).
10. **Paste-compression** in the composer.

Items 1, 2, 3, and 6 close real product holes (orchestrator can't ask, MCP install gated, @-pickers fake, voice missing). The rest are polish.
