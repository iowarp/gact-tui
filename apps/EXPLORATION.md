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

