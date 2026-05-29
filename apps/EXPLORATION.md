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

