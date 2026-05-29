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

