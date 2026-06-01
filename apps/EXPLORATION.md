# CLIO Desktop — full-surface exploration

Goal: drive the webapp like a real user against live clio + ALCF Sophia.
Map every feature to clio's semantic surface, judge against the TUI it's
inspired by. Find what's broken, what's missing, what's worse than the
TUI. Fix the easy bugs, log the hard ones.

Date: 2026-05-29
Backend: clio-agent-gact on 127.0.0.1:17801, CLIO_LM_PROVIDER=argonne,
ALCF Sophia (gpt-oss-120b)
Frontend: pure-web preview on http://localhost:4173, --disable-web-security
chromium (proxy for the Tauri shell, which uses gact_http natively)

## Method

Walk each surface as a user. Capture before/after screenshots. Record
findings inline. Three categories:

- **BROKEN** — the feature doesn't do what it claims, full stop
- **GAP** — the feature is wired but missing clio capabilities or TUI parity
- **UX** — the feature works but the UX is rough / inferior to the TUI

Format per finding:
```
[BROKEN | GAP | UX] (#issue-id) Title
    What happened: …
    Expected: …
    Fix idea: …
```

## Findings

### Connect screen

**[BROKEN] (E-1) Pure-web build can't connect to a local clio — CORS blocks every /v1/* fetch.**

What happened: opened http://localhost:4173 (the `pnpm preview` of the
ZIP we ship as `clio-web-v0.9.0.zip`), filled the Backend URL, clicked
Connect. Chromium dev console:

```
Access to fetch at 'http://127.0.0.1:17801/v1/capabilities' from
origin 'http://localhost:4173' has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested
resource.
```

The Tauri desktop build dodges this by routing through `gact_http`
(native fetch), but the pure-web build is a real product per
`apps/STATUS.md` (we ship the ZIP in the release matrix). It is
completely unusable today on any cross-origin URL — and "local clio
+ local web preview" is exactly cross-origin.

Expected: clio responds with `Access-Control-Allow-Origin: *` (or a
configurable allowlist) on the GACT v0.2 routes so the pure-web
build can do its job.

Fix idea: add `fastapi.middleware.cors.CORSMiddleware` to clio's
GACT app at startup, mirroring the same `/v1/*` scope. Localhost
clios should default to permissive; non-localhost should require an
explicit `CLIO_GACT_CORS_ORIGINS` env. This is one line in
`clio-agent/src/clio_agent/gact/app.py`. The Playwright audit suite
masks it because it rewrites response headers via `page.route()`;
real users don't.

Until that lands: every Playwright walkthrough has to launch chromium
with `--disable-web-security`, which is exactly the gap.

**Status:** fixed in clio-agent `app.py` (CORSMiddleware with
`CLIO_GACT_CORS_ORIGINS` override). Pure-web build now connects.

### Chat shell (post-connect)

**[BROKEN] (E-2) Composer textarea collapses to 28px wide.**

What happened: opened the chat after connect; placeholder text
"Start a new conversation — first message becomes the title"
rendered as one letter per line because the textarea bounding box
was 28×30 px instead of taking the available width.

Root cause: `composer__row` is a 3-column CSS grid
(`28px 1fr 36px` — attach button | input | send button). But the
JSX inside it conditionally renders ~3 extra siblings when
`onTranscribeVoice` is set (mic, mic-elapsed, voice-upload). Those
extra children push the input-wrap into an implicit auto-sized
column 4, which collapses to the size of the empty placeholder.

ChatScreen was always passing `onTranscribeVoice` regardless of
capability, so even a backend with `voice: false` (clio default)
triggered the breakage.

Expected: textarea fills the available width; voice buttons hide
when the backend doesn't advertise the capability.

Fix: wrapped the lead buttons in a `composer__row-lead` flex
container so the grid stays 3 cells regardless of how many lead
buttons render; gated `onTranscribeVoice` on
`props.backend.capabilities?.capabilities?.voice`.

**Status:** fixed. Composer is now 548px wide; voice/mic buttons
hidden for non-voice backends.

**[BROKEN] (E-3) Topbar model chip lies about the active LM.**

What happened: model chip showed `granite3.1-dense:8b` (Ollama's
preset suggested model) while clio was actually configured with
`openai/gpt-oss-120b` via ALCF Sophia. Inspector's Turn tab
showed the same wrong value as "model".

Root cause: `models()` was built from `/v1/providers` (the *available*
provider presets) and an effect auto-selected `models()[0]`, which
alphabetically happens to be Ollama's `granite3.1-dense:8b`. The
*active* LM lives at `/v1/providers/lm` and was never read.

Expected: chip shows whatever clio reports under `/v1/providers/lm`
unless the user has manually picked a model.

Fix: added a `lmConfig()` resource read; effect now resolves
`selectedModelId` to `${lm.provider}/${lm.model}` (synthesizing the
entry if the provider isn't in the preset list — e.g. argonne
isn't a `/v1/providers` row). `userPickedModel` flag stops the
override once the user opens the picker.

**Status:** fixed. Chip now reads `openai/gpt-oss-120b` against the
live ALCF setup.

**[BROKEN] (E-4) Composer backend chip says "no backend" right after Connect.**

What happened: after a successful Connect, the composer-footer
backend picker showed `no backend` with an idle pip even though the
backend was clearly active (SSE was open and turns ran).

Root cause: `App.tsx` connect handler called `registry.add(...)` but
never `registry.select(id)`. So `reg.current()` returned `undefined`
and BackendPicker fell back to the "no backend" placeholder. Every
fresh-connect session shipped with this bug.

Expected: the freshly-added backend should be the current one.

Fix: added `registry.select(id)` right after the add.

**Status:** fixed. Chip now reads `127.0.0.1:17801`.

**[BROKEN] (E-5) GET /sessions/{id}/messages returns newest-first; the UI renders the conversation backwards.**

What happened: opened a session that had been used for an earlier
"What is the capital of France?" turn. The transcript rendered
the assistant's "Paris" reply *above* the user's question. Both
had the same humanised "15m" timestamp but `created_at` showed
the user message ~5 s before the assistant message.

Root cause: clio's `/v1/sessions/{id}/messages` returns messages
newest-first. The Client passed that order through verbatim, and
the Transcript component renders in array order.

Expected: chronological order, oldest at top, newest at bottom —
the standard chat UX.

Fix: `Client.messages()` now `.sort((a, b) => createdA - createdB)`
defensively. Should also be fixed at clio's side, but the client
guard means the desktop is correct against any GACT backend that
might emit either order.

**Status:** fixed on the desktop (`apps/core/src/client/http.ts`).
Filed as clio backend follow-up.

**[BROKEN] (E-6) Chat topbar squeezes the session title to zero width.**

What happened: opened a session whose meta items together totalled
~516px (5 chips on a 724px chat column). The chat__crumbs flex item
got squeezed to 12px and the title disappeared. Visually the topbar
showed `/  2.61k tok end_turn …` — no session name at all.

Root cause: `chat__crumbs` had `flex: 1` (basis 0, shrink allowed) but
no min-width guarantee. The chat__meta grouping had no shrink budget
either. When meta + actions + padding exceeded the available width,
the crumbs basis-0 lost the shrink race.

Fix: `chat__crumbs` is now `flex: 1 0 140px` — reserves 140px of
guaranteed space for the title. Meta picked up `overflow: hidden`
and its items got `flex: 0 0 auto` so individual chips don't try to
break inside themselves.

**Status:** fixed. Title back to visible (67px in this layout).

**[BROKEN] (E-7) Per-message Delete button silently missing from every message.**

What happened: hovered an assistant message; the action row shows
copy / regen / speak / link / quote — no delete. `DELETE
/v1/sessions/{sid}/messages/{id}` is correctly implemented in
clio-agent and the desktop's Client, and ChatScreen.tsx wires
`onDeleteMessage` all the way through ChatLayout into the Transcript
shell. But Transcript never threaded the prop down to MessageView,
so the gating `<Show when={props.onDelete}>` inside MessageView
always missed and the button never rendered. Every user trying to
delete a message hit a dead end.

Fix: Transcript now forwards `onDelete={props.onDelete}` to the
MessageView like all the other action callbacks.

**Status:** fixed. msg-delete-{id} button appears in the action row.

### Chrome controls — verified against live clio + ALCF

End-to-end one minute walkthrough after the fixes above:

- Cmd+K palette opens with 62 items across 11 categories
  (meta/discovery/data/navigation/builtin/user/jump/perm/settings/action/view).
  Typing "doctor" filters to 3 rows; Enter on the top row navigates
  to the Doctor discovery page.
- Cmd+/ opens the keybind cheatsheet overlay.
- Cmd+F opens the transcript-search panel.
- Cmd+B toggles the SessionsColumn (320 → 0 → 320).
- Sessions archive toggle switches between active + archive lists.
- Inspector tabs render Turn / Frames / Schedules / Bindings against
  a real ALCF turn: `stop_reason: end_turn`, tokens `2.43k → 401`,
  2 context frames both `completed`, schedules tab exposes the cron
  composer, bindings tab pre-selects `Data Exploration/Search Agent`
  (the only blueprint clio ships).
- Doctor page renders integrations (api/sessions/agent/memory/lm)
  with statuses, capability-gap cards (voice + lsp unsupported),
  overall=`degraded` because of the LM token annotation.
- Discovery rails populate: Agents 27 cards, MCP 7 cards, Workspaces
  1 card, Commands 5 cards (builtin + user-installed), Memory shows
  search + events surfaces, Metrics shows session/token/cost tiles,
  Plugins shows registry form with empty hint.
- Per-message actions: 6 buttons render after the fix
  (copy/regen/speak/link/quote/delete).

### Per-message actions — verified end-to-end

Drove every action against the live `msg_asst_*` of the Markov-chain
turn:

- **copy** → clipboard got the assistant body text.
- **quote** → composer received `> A Markov chain is a stochastic …`
  (blockquote-prefixed snippet).
- **link** → clipboard got `clio://session/<sid>#<msg_id>` — clio
  permalink scheme.
- **delete** → DELETE /v1/sessions/{sid}/messages/{id} fired, server
  acked, the message disappeared from the transcript live.

### Phase-1/5 keyboard shortcuts vs intent

- `Ctrl+K` opens the command palette (62 items in 11 categories).
  Filter narrows correctly; Enter dispatches.
- `Ctrl+Shift+K` opens the catalog browser.
- `Ctrl+G` opens the compose modal.
- `Ctrl+L` opens the shared session modal.
- `Ctrl+/` opens the keybind cheatsheet.
- `Ctrl+F` opens the transcript search panel.
- `Ctrl+B` toggles the SessionsColumn (320 → 0).
- `Ctrl+S` downloads the session JSON (5.7 kB blob for a 2-turn session).
- `Ctrl+Shift+D` parks the active session in the detached registry
  with a "Walked away" toast.
- `/` on an empty composer opens the slash palette (preventDefault on
  the `/` keystroke so the textarea stays empty).

### Settings shell — every section rendered against live clio

All 16 nav entries open without error and surface real backend data:

| Section          | What renders against live clio |
|------------------|---------------------------------|
| Backends         | :17801 entry with `current` chip + cap flags + Use/Refresh/Remove |
| Workspaces       | ws_default rooted at C:\Users\jaime + Show repo map / Rename / Unregister |
| Models & providers | active LM = `argonne · openai/gpt-oss-120b` + Sophia URL + LM Studio preset |
| Agents           | Main Agent (tier 1) + specialists, routing summary |
| Commands         | 5 slash cards (/clear /cache-stats /dump-trace /optimize /convert-paper) |
| Prompts          | global + workspace sources with real paths |
| Agent blueprints | Data Exploration/Search Agent card + install JSON form |
| Expert packs     | empty hint + validate JSON form |
| MCP servers      | adios in_process with 3 tools + Reconnect action |
| Hooks            | empty hint + Add form (post-fix) |
| Policies         | "No policy returned" + JSON editor |
| Memory           | ARC stats — hit rate 62.5%, 5 hits / 3 misses, 1000 capacity, 4 conversations |
| Metrics          | 35 sessions, 47k/3.1k tokens, $0 cost, 33m uptime, 64 messages |
| Doctor           | integrations + capability gaps |
| Appearance       | theme picker + accent palette tokens |
| About            | CLIO Desktop v0.9.1, contract 0.2, clio-agent-gact 0.1.0, capability flag list |

### Slash command end-to-end

Opened the palette, typed `clear`. Two rows showed:
1. `/clear  Clear current transcript  meta`       — desktop-local "clear UI"
2. `/clear  Drop the in-memory log…   builtin`   — clio backend command

**[UX] (E-9) Duplicate `/clear` entries are visually identical.** Real
user can't tell which clears clio vs which clears the UI. Fix idea:
prefix the meta variant ("clear · view") or sort by source and group
under headers ("Local actions" / "Backend commands").

Picked the backend row → clio's `runCommand` actually executed,
turning into a real LM round-trip ("CLIO responded · 2612 tokens").
Confirms `runCommand` is wired end-to-end (E-1 of the previous
audit-batch — verified for real now).

### Defaults / probes

**[BROKEN-MINOR] (E-8) Splash probe and AddRemote default both used `localhost:7777`** while the Connect screen text and clio-agent's `start` command bind `:17800`. Net effect: a fresh
splash never finds any clio, falls into the "Looking for a backend
on localhost:7777…" stall, and the AddRemote dialog pre-fills a
broken URL. Fixed: all references normalized to `:17800`. (clio-agent-gact's argparse default is still `:8100`, which is its own
problem — operators don't normally run the bare CLI; they `clio start`.)

**[BROKEN] (E-10) Inspector → Schedules → Add 422'd because we sent `prompt` but clio reads `question`.**

What happened: filled cron + prompt + clicked Add. Toast: "Could not
add schedule · internal_error: missing required fields: cron +
question". Schedule never created.

Root cause: third wire-name mismatch this session, after
`agent_blueprints`/`blueprints` and `message.created.payload.message`
nesting. `Client.createSchedule` posted `{ cron, prompt, enabled? }`;
clio's POST `/v1/sessions/{id}/schedules` reads `body.get("question")`.

Fix: map `prompt → question` inside `Client.createSchedule`. Verified
end-to-end against live clio: `Every 15 minutes` preview renders,
server accepts, list reflects it.

## Per-feature verification matrix (live clio + ALCF Sophia)

Verified column = clicked/triggered the feature in the running webapp
and watched it complete against real backend state.

| Area              | Feature                                       | Verified |
|-------------------|-----------------------------------------------|---|
| Connect           | URL+token form → /v1/capabilities probe → chat | ✓ |
| Connect           | CORS allow on /v1/* from a foreign origin     | ✓ (E-1) |
| Chat shell        | Composer accepts long input, no collapse      | ✓ (E-2) |
| Chat shell        | Topbar title visible even with full meta row  | ✓ (E-6) |
| Chat shell        | Model chip reads the active LM (not preset 0) | ✓ (E-3) |
| Chat shell        | Backend picker labels the live URL            | ✓ (E-4) |
| Chat shell        | Message order chronological                   | ✓ (E-5) |
| Chat shell        | Multi-turn round-trip (user → assistant text) | ✓        |
| Composer          | `/` opens slash palette on empty input        | ✓        |
| Composer          | `@` opens at-mention picker w/ workspace files| ✓        |
| Composer          | Paste compression (5-line → `[pasted N…]`)    | ✓        |
| Composer          | Voice/mic buttons hidden when voice cap = false | ✓ (E-2) |
| Inspector         | Turn tab: stop_reason, tokens, cost           | ✓        |
| Inspector         | Frames tab: ctx_…/completed per turn          | ✓        |
| Inspector         | Schedules tab + cron humanizer preview        | ✓        |
| Inspector         | Schedules Add lands a row on the backend      | ✓ (E-10) |
| Inspector         | Bindings tab: blueprint + pack pickers        | ✓ (earlier fix) |
| Per-message       | copy → clipboard                              | ✓        |
| Per-message       | quote → composer with blockquote prefix       | ✓        |
| Per-message       | permalink → `clio://session/.../#msg_…`       | ✓        |
| Per-message       | delete → DELETE wire + transcript drops msg   | ✓ (E-7) |
| Palette           | Cmd+K opens 62 items                          | ✓        |
| Palette           | filter narrows + Enter navigates              | ✓        |
| Palette           | runCommand actually dispatches to clio        | ✓        |
| Palette           | duplicate `/clear` rows removed               | ✓ (E-9) |
| Catalog           | Cmd+Shift+K renders 27 agents inline          | ✓        |
| Modals            | Cmd+G compose, Cmd+L shared session           | ✓        |
| Keyboard          | Cmd+/ cheatsheet, Cmd+F search, Cmd+B columns | ✓        |
| Keyboard          | Cmd+S downloads session JSON                  | ✓        |
| Keyboard          | Ctrl+Shift+D walk-away → toast                | ✓        |
| Rails             | Doctor / Agents / MCP / Memory / Metrics / Plugins / Workspaces / Commands | ✓ |
| Settings          | all 16 sections render against live data      | ✓        |
| Settings          | active-LM badge reflects /v1/providers/lm     | ✓ (E-3) |
| Defaults          | Splash + AddRemote use :17800                 | ✓ (E-8) |

### Outstanding — needs a richer turn to verify

These surfaces are wired but require a tool-using or permission-asking
turn to drive. clio ships MCP servers + permission flow, but exercising
them needs a prompt that the LM actually decides to route through tools.

- Permission card flow (request/deny/grant scopes via SSE).
- Inspector Tools tab + tool_call.progress chip in topbar.
- Inspector Diffs tab + bulk apply/reject.
- Inspector Tasks tab + status cycling.
- Ask-user question card (user_question.created SSE).
- session.updated → autorename pill (transient, animates out in 4.5s).
- lm.provider.{changed,failed} SSE toasts.

## Wire-shape scan against every clio POST/PUT

Walking `Client.*` against every `body.get(...)` in clio's
`gact/app.py` surfaced four more mismatches besides E-10's schedule
`prompt` → `question`. All four would silently produce wrong-state on
the backend.

**[BROKEN] (E-11) fork sends `from_message_id`; clio reads `at_message_id`.**

`POST /v1/sessions/{id}/fork`. Wire reads `body.get("at_message_id")
or ""`. Desktop sends `from_message_id`. Net effect: every fork
branches from the tail of the session, never at the message the
user clicked. Click a 4-turn-old message to fork there → you get
a fork of *all* turns, including the 3 you wanted to drop.

Fix: map `from_message_id → at_message_id` at the Client boundary.

**[BROKEN] (E-12) share sends `expires_in_seconds`; clio reads `ttl_s`.**

`POST /v1/sessions/{id}/share`. Wire reads `body.get("ttl_s") or 0`,
treats 0 as "never expires". Desktop sends `expires_in_seconds`.
Net effect: every shared link is permanent — the user thinks they
set an expiry, but the share token never expires.

Fix: map `expires_in_seconds → ttl_s` at the Client boundary.

**[BROKEN] (E-13) createWorkspace sends `config`; clio's
`CreateWorkspaceRequest` field is `metadata`.**

Plus `name` is desktop-optional but clio-required (pydantic
`BaseModel` field without default → 422 if missing).

Fix: synth a default `name` from the last path segment when caller
omits it; map `config → metadata`.

**[BROKEN] (E-14) Session pin + archive both silently no-op against the wire.**

The desktop's `patchSession` sends `{ archived?, metadata? }` for
both archive toggle and pin-to-top. clio's `UpdateSessionRequest`
schema has neither field, and pydantic's default
`model_config` silently drops unknown keys. So:

  - Click "Pin to top" → optimistic UI flips; after a reload the
    pin is gone.
  - Toggle the SessionsColumn Archive view → query string
    `archived=true` is ignored by clio, the same 35 active sessions
    come back. The "archive bucket" is just a duplicate of the
    main list with a label change.

Both are clio-side feature gaps, not desktop bugs. Document them
here as "feature ghosts": UX surfaces wired into a backend that
doesn't carry the state.

Recommended next steps in clio:
  - Add `archived: bool` to `UpdateSessionRequest` + `Session`.
  - Add `metadata: dict` to `UpdateSessionRequest` (merge into
    session.metadata) so pin / fork-lineage / autorename hints
    persist.
  - Honor `?archived=true|false` in `GET /v1/sessions`.

Until clio ships these, the desktop should either hide the affected
controls or surface a "not yet supported by this backend" pill so
users don't think the click worked.

### SSE handler gap (E-19)

**[BROKEN] (E-19) Desktop subscribed to 11 SSE event types but had no reducer cases.**

clio emits ~30 distinct event types on the per-session SSE channel.
The desktop's `named` subscription list was 19 entries; the reduce
switch's `case` blocks covered 16. The 11-type gap silently dropped
every event of these kinds:

```
session.cleared
message.deleted
context.file.added
context.file.removed
file.diff.applied
file.diff.rejected
file.diff.write_failed
expert_handoff
subagent.started
subagent.completed
memory.search.completed
turn.retry_requested
```

Observable user-facing symptoms:

  - User triggers `/clear` → backend wipes the transcript, emits
    `session.cleared`, desktop keeps showing stale messages until
    a manual refetch.
  - Backend deletes a message (e.g. another client undid a turn) →
    desktop shows a ghost row.
  - Diff Apply/Reject from elsewhere → Inspector Diffs tab keeps
    showing the resolved diffs.
  - Context-file add/remove from a slash command → Inspector Context
    tab is frozen until session switch.
  - Sub-agent / expert-handoff signal → user gets no notification.
  - `turn.retry_requested` (orchestrator retrying after transient
    LM failure) → silent.

Fix: subscribe to the missing types and add reducer cases that
either mutate transcript state directly (`session.cleared`,
`message.deleted`) or fire callbacks (`onContextFilesChanged`,
`onDiffChanged`, `onMemoryChanged`) to refetch the affected
resources. Each side-channel event also surfaces a toast so the
user knows the state changed.

Wired through ChatScreen's three new `onContextFilesChanged`,
`onDiffChanged`, `onMemoryChanged` callbacks to the existing
`refetchContextFiles` / `refetchSessionDiffs` / memory drawer
hooks.

### Wire-shape audit pass 2 (E-20…E-24)

**[BROKEN] (E-20) `callMcpTool` client method was missing entirely.**

clio exposes `POST /v1/mcp/servers/{id}/call` (body `{tool, args,
session_id?}`) as the canonical way to drive an installed MCP
server from the UI. The desktop had no client method for it. Any
"use MCP server X" feature was therefore impossible to build —
the wire was unreachable.

Fix: add `Client.callMcpTool(serverId, {tool, args, sessionId?})`.
Passing `sessionId` attaches the call to the session context so
the tool_observer fires real `tool.call.*` SSE events, identical
to in-process tool calls. Without it the call still works but the
UI sees no progress.

**[BROKEN] (E-21) `renderPrompt` / `validatePrompt` missing.**

clio exposes `POST /v1/prompts/{id}/render` (body `{profile?,
session_id?, workspace_id?, context?}`) and `POST /v1/prompts/{id}
/validate` (body `{text?, profile?, session_id?, workspace_id?}`).
The desktop had only `GET /v1/prompts/{id}` for resolution + no
way to preview a prompt with arguments. The prompts editor's
"Preview" button currently dead-ends on a 404 (or worse, silently
shows the unrendered template).

Fix: add `Client.renderPrompt` and `Client.validatePrompt`.

**[BROKEN] (E-22) `patchContextFile` POSTed to a non-existent
PATCH route.**

The desktop's `Client.patchContextFile` issued `PATCH
/v1/sessions/{id}/context/files`. clio registers no PATCH for that
path. The mode-cycle button in the Inspector Context tab therefore
405'd: every click on read↔edit↔pin failed silently (the UI showed
a toast saying "Mode change failed" because the request bounced,
but the user couldn't tell why).

clio's POST endpoint for the same path is an upsert keyed by
`path`. Repurpose the client method to use POST — the body shape
is identical and the upsert semantics give us the mode swap for
free.

Fix: rewrite `patchContextFile` to issue POST instead of PATCH.

**[BROKEN] (E-23) `applySessionDiffs` discarded per-path write
errors.**

clio's `POST /v1/sessions/{id}/diffs/apply` returns
`{applied: string[], write_errors?: Record<string, string>}`
where `write_errors` carries per-path failures whose in-memory
diff status flipped to `applied` but the actual disk write blew
up (perm denied, disk full, file outside workspace root). The
desktop only counted `r.applied.length` and showed a green
success toast — a partial disk-write failure looked like a clean
success.

Fix: surface each `write_errors` entry as its own error toast so
the user knows which file didn't actually write to disk even
though clio considered the diff applied.

**[BROKEN] (E-24) `answerSessionQuestion` body shape missed `metadata`.**

clio's `AnswerUserQuestionRequest` accepts an optional `metadata`
map that survives into the answered question's `answer_metadata`
field and into the resumed turn's caller context. The desktop's
body type omitted it, so any ask-user resume that wanted to round-
trip metadata (e.g. UI source, locale, draft id) had no path.

Fix: add `metadata?: Record<string, unknown>` to the client's
body type. No reducer changes — the field is already in
clio's response.

### UX polish pass (E-25, E-26)

**[UX] (E-25) Speak button on assistant messages was unconditional.**

clio doesn't ship a `/v1/sessions/{id}/voice/synthesize` endpoint
yet (only `voice/transcribe`). The desktop rendered the Speak
button on every assistant message anyway, so every click fired
an error toast — a guaranteed "this feature is broken" UX. The
voice-input mic was already gated on `backend.capabilities.voice`
but the TTS output wasn't.

Fix: gate `onSpeak` on the same `voiceCapable` flag in ChatScreen
so backends without TTS hide the button cleanly.

**[UX] (E-26) Server-search jump didn't flash the matched message.**

The Cmd+Shift+F backend search panel's `onJump` scrolled the hit
into view but didn't apply the `.trx-msg--flash` animation that
the URL-hash permalink uses. On a long transcript with adjacent
rows containing similar text, the user couldn't tell which row
was the actual hit.

Fix: switch the lookup from `data-testid="msg-${id}"` to
`getElementById('msg-' + id)` (same id the permalink uses) and
add the same flash highlight. Both jump paths now key off the
same id and share the same visual feedback.

### Live-turn verification pass (E-27, E-28)

These surfaced only once clio completed real tool-using turns on
:17800 — the fixtures-and-capability-only passes couldn't reach them.

**[BROKEN] (E-27) Permission card never rendered over SSE.**

The live SSE reducer (`live.ts`) read `payload.permission`, but clio
emits `permission.requested` with the fields flat in the payload and
the tool identity nested under `tool_call.tool_name`:

```json
{ "id": "perm_…", "session_id": "sess_…",
  "tool_call": { "tool_name": "shell_bash", "input": { "command": "…" } } }
```

`setPendingPermission` was therefore never called against any real
backend — only the fixture path (which nests the whole request under
`payload.permission` with `tool_name` at top level) ever worked. So
task #35 ("permission decisions arrive over SSE") was untestable: the
card never appeared. The whole human-in-the-loop tool-approval flow
was dead end-to-end.

Fix: map clio's flat shape into `PermissionRequest`
(`tool_name = tool_call.tool_name`, `tool_call.input = tool_call.input`)
while still accepting the legacy nested fixture shape. Verified live: a
tool-using prompt → `permission.requested (shell_bash)` → card renders
with the tool name → a decision clears it via `permission.resolved`.

**[BROKEN] (E-28) Backend slash commands 404'd — none ever dispatched.**

clio's `/v1/commands` lists ids with a leading slash (`/cache-stats`),
but `POST /v1/sessions/{id}/commands/{cmd}` keys on the bare name
(`cache-stats`). `runCommand` posted the id verbatim, so
`encodeURIComponent("/cache-stats")` made the path `…/commands/%2Fcache-stats`
→ 404. Every palette-dispatched backend command silently failed.

Fix: strip a leading slash from the command id before encoding.
Verified live: `/cache-stats` → 200 with a `system_message` result.

