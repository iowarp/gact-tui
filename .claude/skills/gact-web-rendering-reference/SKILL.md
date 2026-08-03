---
name: gact-web-rendering-reference
description: >
  Load before touching anything under apps/ — the SolidJS web app (apps/web), the shared
  TypeScript client (apps/core), or the Tauri desktop shell (apps/desktop) — and before ANY
  transcript-rendering change on web, desktop, OR TUI (the rendering spec binds all three).
  Triggers: transcript render bugs ("boxes", "collapsed text", "raw **asterisks**", duplicate
  thoughts, scaffolding text in the conversation), markdown/streaming rendering, Live* SSE
  engine work, brand/white-label builds, locale, the desktop supervisor/sidecar/SSH/updater,
  web screenshots or render-demo evidence, keywords: RENDERING_SPEC, CANONICAL-CONVERSATION,
  smd, streaming-markdown, AssistantTurnView, LiveTranscript, dedupToolThought,
  clioScaffolding, @brand, GACT_BRAND, tauri, sse_bridge, earthscope-render-demo.
---

# GACT web/desktop rendering & apps/ domain reference

The web/desktop half of gact-tui lives in `apps/` (a pnpm workspace — **`pnpm` commands
fail from the repo root; always `cd apps` first**). This skill is the domain pack: the
binding rendering specs, the one-markdown-renderer rule, the Live* streaming engine, the
shared TS client, branding, locale, the Tauri desktop shell, and how evidence is produced
here. Everything below was verified against the repo on 2026-07-06 unless labeled otherwise.

**Definitions used throughout**
- **clio** — the canonical agent backend ([iowarp/clio-agent](https://github.com/iowarp/clio-agent)). In prose say "clio", not "the sidecar".
- **SSE** — Server-Sent Events, the streaming half of the GACT contract (REST + SSE).
- **Transcript** — the rendered conversation log (user turns, agent turns, tool calls/results).
- **Turn** — one LLM round of one agent: its reasoning text plus the single action it takes.
- **smd** — the `streaming-markdown` npm package (append-only incremental markdown parser).

## When NOT to use this skill

| You are doing… | Load instead |
|---|---|
| Terminal-TUI (Bubbletea) rendering, teatest, VHS tapes | gact-bubbletea-reference |
| Wire-protocol details: endpoints, envelope, turn lifecycle, capability flags | gact-wire-protocol-reference |
| Starting/stopping emulator, clio backends, web preview, ports, cleanup | gact-run-and-operate (also `.claude/skills/live-web-session.md`, `clio-web-deploy.md`) |
| Deciding what counts as proof / adding tests | gact-validation-and-qa |
| Classifying/gating a change, commit & PR conventions | gact-change-control |
| Debugging a live failure symptom-first | gact-debugging-playbook |
| Config axes across the whole project (TUI config.json, env vars, emulator flags) | gact-config-and-flags |
| Cross-surface capability-parity campaign work | gact-interface-parity-campaign |

---

## 1. The binding specs — read BEFORE any transcript change (web, desktop, AND TUI)

`apps/CLAUDE.md` (loaded into every session touching `apps/`) declares these the source
of truth for **any** change to the conversation transcript on web/desktop/TUI:

| Document | What it is |
|---|---|
| `apps/web/RENDERING_SPEC.md` | The rules. Distilled owner feedback; "Read this before EVERY change. Do not re-litigate anything here." |
| `apps/web/CANONICAL-CONVERSATION.md` | The **entire** approved EarthScope/Los Angeles run rendered out, grounded line-by-line in the real wire capture (`clean-earthscope-la.wire.sse`). This is the exact target. Where an older sketch in the spec differs, **the canonical document wins**. |
| `apps/CLIO-DEVTEAM-ISSUE-react-thought-ordering.md` | Stream gaps to fix **backend-side** (per-step thought + tool attribution missing from ordered parts) — NOT to paper over in the client. |

### The locked rules (summary — the spec itself is authoritative)

1. **Flat log. No boxes.** No bordered/backgrounded/rounded cards around messages, turns,
   or tool blocks. Indentation + a gutter marker only, like Claude Code's own output.
2. **`●` marks a TURN, never the agent name.** One `●` per real LLM round (a thought, a
   tool call, a delegation decision, an answer). Reasoning and the action it decides on
   are the **same** turn — never split them.
3. **Agent name = a colored header (`▎agent`), shown ONCE atop that agent's block**, and
   again only when the agent *resumes* after control left it.
4. **A delegation is one of the PARENT's turns** (`● → delegates to <child>`); the task
   sent is first-class (never muted) directly under it; the child's work indents **one
   level**; recursive to any depth; `⤶ returns to <parent>` closes the child block and
   the hand-back content is always shown.
5. **Tool result = `⎿` indented under its call, showing the REAL output** rendered by
   **content type** (image inline, diff with +/− coloring, CSV as a small table, JSON via
   backend summary + key fields, markdown as markdown) — never `N items · M fields`
   counts, never `ok` when data came back, never a tool-name special case (a generic GACT
   client carries zero backend vocabulary).
6. **Expand/collapse is for TRUNCATION ONLY.** Short results render inline in full with
   no toggle; only a long tail collapses (`▾/▸` + expand/collapse + `show raw`).
7. **Model text is always full, never collapsed.** Only tool output compacts.
8. **Depth = indentation** (+ light dots) — never bars, boxes, or cards.
9. **One base font size** for all transcript text; differentiate by weight/color only.
   Full width — no premature wrapping / `max-width` on text containers.
10. **No injected scaffolding in the transcript**: `(In progress—…)`, `(Routing to X …)`,
    `[...delegation output truncated...]`, `[exact retained evidence index]`, typed-
    workflow-state JSON blobs, `[[ ## field ## ]]` ChatAdapter markers — all stripped.
11. **Live == reload.** A reloaded session must render the same as the live stream did
    (byte parity is the stated hard requirement; see §4 status).

The TUI's content-type preview code is the named reference implementation for rule 5:
`tui/internal/ui/execution_observations.go` and `tui/internal/ui/render_previews.go`
(mirror it from web code; do **not** modify `tui/` from an apps/ task — apps/CLAUDE.md
rule 8 forbids upward scope creep).

### ⚠ Stale code-path prose inside RENDERING_SPEC.md

The spec's §0/§9 *process* notes name `ExecutionTree.tsx` / `executionProjection*.ts` as
"the REAL renderer" and call `AssistantTurnView` dead code. **That is outdated.** On
2026-07-01 the render paths were unified and the execution-projection cluster deleted:

- `09240c4c` refactor(web): unify all transcript rendering through one path
- `29e0c10d` refactor(web): delete the dead execution-projection + normalized clusters
- `e97b1cc2` refactor(web): delete the flat assistant-content render dispatch

`ExecutionTree.tsx` no longer exists. The spec's **structural/visual rules remain fully
binding**; only its file-name narrative predates the unification. Current path in §2.

---

## 2. The transcript render path today (one path, live AND reload)

As of 2026-07-06 there is exactly ONE transcript projection on the web:

```
SSE events / GET /messages
        │  (LiveTranscript engine — §4)
        ▼
apps/web/src/components/Transcript.tsx          (windowing >150 msgs via TranscriptVirtualization.ts)
        ▼
apps/web/src/components/TranscriptMessageView.tsx
        ▼
buildAssistantTurnModel()                        (apps/web/src/components/transcriptDelegationModel.ts)
   — projects a message's parts into ONE ordered append-only row log
   — applies stripClioScaffolding + dedupToolThought (temporary; §3.1)
        ▼
apps/web/src/components/AssistantTurnView.tsx    (renders ●/⎿/▎ rows per the spec)
        ▼
apps/web/src/components/Markdown.tsx             (the ONE markdown renderer; §3)
```

There is **no flat per-part fallback** anymore ("one builder, one view" — asserted in
code comments in `TranscriptMessageView.tsx` and `TranscriptParts.tsx`). Both live
streaming and reload render through this same path. Do not reintroduce a second
projection, a second view, or a "temporary" alternate path — that is the exact accretion
the 2026-07 cleanup program forbids.

---

## 3. Markdown: exactly ONE incremental renderer — hard rule

`apps/web/src/components/Markdown.tsx` is the single markdown renderer for the
transcript. It wraps **smd** (`streaming-markdown@^0.2.15`, in `apps/web/package.json`):
a true incremental parser that only **appends** DOM nodes as characters arrive — never
re-parsing prior content. Streaming and settled text render through the SAME path, so
there is no plain→formatted flip and no quadratic re-parse. It also surfaces smd's
buffered tail as a disposable text node so the freshest streamed characters are visible
immediately (commit `a07807da`), and `sanitizeEmphasis.ts` escapes intraword underscores
(`shell_bash`, `time_s`) so they can't cascade into `<em>`.

**History (why this is a hard rule):** commit `8e3e925b` "refactor(web): unify markdown
on one incremental smd renderer + strip leaked markers" (2026-07-01) replaced THREE
renderers — `InlineMarkdown*` (7-file cluster), the finalize-only `MemoMarkdown` (which
re-split every block on every token: O(n²)), and the plain-while-streaming
`StreamingMarkdown` (which flipped plain→formatted on finalize). Both failure modes were
shipped, diagnosed, and deliberately deleted.

**Accepted losses** (from the `8e3e925b` commit message — do not "fix" them by adding a
renderer): transcript fenced code renders as a plain `<pre><code>` with **no hljs syntax
highlighting and no copy button**. (`highlight.js` is still a dependency and still used
elsewhere, e.g. the diff pane / `hljs-lazy.ts` — the loss is scoped to transcript
markdown code blocks.)

**HARD RULE — never:**
- add a second markdown renderer (for "just the settled path", "just code blocks", …);
- drift back to a reparse-per-token streamer or a finalize-only parse;
- bolt per-token DOM rebuilding onto Markdown.tsx.

If markdown output is wrong, fix it inside the one renderer (or upstream in smd usage),
and prove it with a live mid-stream capture, not a settled-only screenshot.

---

## 3.1 Client dedup / prose filters — temporary, FROZEN (do not add, do not delete yet)

GACT is a **generic** interface to many agent backends. Dedup/filter/semantic logic that
compensates for one backend's stream quirks does not belong in a generic client — it
breaks other backends. The correct home is the server. Two compensations currently exist
in the web transcript path (verified 2026-07-06):

| Filter | Where | What it compensates |
|---|---|---|
| `dedupToolThought()` | `apps/web/src/components/transcriptDelegationModel.ts` | clio's tool_observer copies a ReAct step's `next_thought` onto `tool_call.thought` while the same text also streams as a text row → rendered twice (`●●` answer doubling). |
| `stripClioScaffolding()` | `apps/web/src/components/clioScaffolding.ts` | Backend-injected status chrome glued into prose: `(Routing to …)` parentheticals, `(In progress…)` placeholders, typed-workflow-state JSON blobs, retained-evidence markers, leaked `[[ ## field ## ]]` ChatAdapter markers. Format-based, never keyed on tool/backend names. |

A third, `dedupeRepeatedText`, was a **wrong-semantics dedup and is already gone from
apps/web** (no matches in the tree as of 2026-07-06; project memory records it as a
retired mistake — e.g. dspy `extract` ≈ last-loop text is *expected* backend behavior,
not a duplicate). Do not re-create it.

**Sequencing (docs/system-cleanup-2026-07.md, "Sequencing note"):** the server-side fix
is iowarp/clio-agent#767 (single-writer TurnTranscript — removes the duplication and
scaffolding at the source). **Status as of 2026-07-06: clio#767 is OPEN.** Therefore:

- **Do NOT add new client-side dedup/prose/semantic filters.** If the stream is wrong,
  file/fix it in clio (cf. `apps/CLIO-DEVTEAM-ISSUE-react-thought-ordering.md` — backend
  gaps get fixed backend-side, not papered over).
- **Do NOT delete `dedupToolThought` / `stripClioScaffolding` before clio#767 lands** —
  they also repair already-persisted sessions on reload. The removal WILL happen, server
  fix first. Track via iowarp/gact-tui#232, #233, #236 (all OPEN as of 2026-07-06).

---

## 4. The Live* streaming engine (apps/web/src)

`apps/web/src/live.ts` is now only a **barrel** (re-export surface); the engine is split
into focused `Live*.ts` modules at `apps/web/src/` (all verified present 2026-07-06):

| Module | Role |
|---|---|
| `LiveTranscript.ts` | Composition root: per-session SSE lifecycle (open/teardown on session switch), snapshot reconcile, reconnect; exports `createLiveTranscript`. |
| `LiveReducer.ts` | The event reducer (`reduce`) — SSE event → state transition. |
| `LiveTranscriptSnapshot.ts` / `LiveTranscriptReconcile.ts` | Fetch `GET /messages` snapshots and reconcile them into the live feed (`mergeMessages` from `@clio/core`). |
| `LiveTranscriptBrowserStream.ts` / `LiveTranscriptTauriStream.ts` | The two stream transports: browser `EventSource` vs the desktop Rust SSE bridge (§8). Same events either way. |
| `LiveTranscriptSession.ts`, `LiveTranscriptState.ts`, `LiveTranscriptModel.ts`, `LiveTranscriptConnection*.ts`, `LiveTranscriptEventHandler.ts` | Session start, signal store, state model, connection/reconnect listeners, event dispatch. |
| `LivePendingInteractions.ts` / `LivePendingInteractionsHandle.ts` | Pending permission + ask-user question lifecycle. |
| `LiveSessions.ts` / `LiveSessionsModel.ts` | Sidebar session list patching from session-touching events. |
| `LiveSemanticFeed.ts`, `LiveExecutionEvents.ts`, `LiveMessageEvents.ts`, `LiveMessageLifecycleEvents.ts`, `LiveToolEvents.ts`, `LiveRunningTools.ts`, `LiveNotifications.ts`, `LiveRefreshEvents.ts`, `LiveReconnect.ts`, `LiveStreamStats.ts`, `LiveConnectionConfig.ts`, `LiveSessionEvents.ts` | Focused event families: capped semantic feed, execution events, message/tool lifecycle, notifications, reconnect/backoff, stream stats. |

### The architecture target (the hardest cluster)

`STREAMING-DEMO-ISSUES.md` (root ledger, 2026-07-01) records the central rework, item
#10, explicitly marked **"Done WRONG — needs rework"**: routing the LIVE view through the
persisted path stopped a dup but **killed live streaming**. The corrected target:

> **live = normalized path (streams deltas), persisted = reload only, SEED the
> normalized path from `/messages` on join** — complete + no dup + streams.
> Plus the hard requirement: **live render == reload render** (byte parity).

This one rework subsumes: thinking-does-not-stream (A1), completion-aware filtering
(A2-live), live progressive markdown (#18 — the markdown piece IS done via smd, §3), and
live==reload parity (#20).

**Status as of 2026-07-06:**
- gact-tui#233 "[epic] TUI streaming & thinking-trace parity with web" — **OPEN**.
- PR #249 (**MERGED**) delivered #233 **phase 1 on the TUI side**: the dual transcript
  render retired, the **parts-only projection is THE transcript path** (same unification
  the web did), semantic allow-list synced to reconciled SPEC §7.6, thinking prose
  rendered inline as a `●` row (visible UX change, owner ack requested in the PR).
- The web-side normalized-authoritative + seed-on-join rework is **not marked complete
  anywhere in the repo** — treat it as open unless GitHub says otherwise; #233 phase 2
  sequencing is gated on #232 settling the authoritative streaming channel and on
  clio#767 (see docs/system-cleanup-2026-07.md).

**Wrong turns already burned (do not repeat):** persisted-authoritative live view (kills
streaming); O(n²) markdown streamer; finalize-only markdown; `dedupeRepeatedText`-style
semantic dedup; verifying "live" rendering from a reloaded session (a reload renders the
settled path — you must capture **mid-stream** to see live behavior).

---

## 5. apps/core — the shared TypeScript client (drift hazard)

`apps/core` (`@clio/core`, no DOM) has three parts under `apps/core/src/`:

- `wire/` — TS types for the GACT contract (`message_types.ts`, `events.ts`,
  `event_payloads.ts`, `capabilities_types.ts`, `session_types.ts`, …). Header says:
  "Authoritative source: contract/SPEC.md".
- `client/` — the REST + SSE client (~55 files: `session_messages_client.ts`, `sse.ts`,
  `transport.ts`, per-surface clients for agents/blueprints/mcp/workspaces/providers/…).
- `store/` — backend registry + transcript store (`backends.ts`, `transcript.ts`, …).

**These types are hand-written against the Go/clio reality — there is no codegen.** That
is a live drift hazard: commit `c66b885f` ("sync wire layers to the codified shapes —
crush flat message.created, TS enum/payload drifts", PR #248) is a recent example of
paying it down. Ending this class of drift (spec→types generation / CI conformance) is
epic gact-tui#232 — **OPEN as of 2026-07-06**, so until it lands: any wire-shape change
must be manually propagated to `apps/core/src/wire/` and proven by the core tests
(`apps/core/tests/wire_shapes.test.ts`, `live-clio.test.ts`, `sse.test.ts`, …), and
wire-visible changes start in `contract/SPEC.md` per the spec-first rule (see
gact-change-control).

---

## 6. Brand / white-label system

**Current mechanism (authoritative: `apps/branding/README.md` + `INTEGRATION.md`):**
brand is selected at **compile time by a CONFIG FILE — explicitly not an env var**.

- Tracked default: `apps/brand.config.json` → `{ "profile": "gact", "brandingRoot": "branding" }`.
- Local override (gitignored, **always wins**): `apps/brand.config.local.json`. An
  embedding project (clio-agent) points `brandingRoot` at its OWN repo's `branding/`
  dir — product brands (CLIO) are NOT shipped in gact-tui; only the neutral `gact`
  profile is (`apps/branding/gact/brand.json`: name "GACT", blue `#5b8def`, glyph "G",
  connect-mode backend).
- Resolver: `apps/branding/brand-config.mjs` (`resolveBrandConfig()`), consumed by
  `apps/web/vite.config.ts` and `apps/desktop/scripts/gen-brand-backend.mjs`
  (which takes `--config <path>`, no env vars).
- Injection: Vite virtual module `@brand` via `apps/web/vite-plugin-brand.ts` exposes a
  fully-resolved typed `brand` object (name, wordmark, tagline, markGlyph, logoSvg
  inlined, accent, themeTokens, starterPrompts, backendRepository, `backend` block).
  `vite.config.ts` also bakes the `<title>` + favicon at build time.
- `backend` block: describes a managed sidecar; a profile that **omits** it resolves to
  connect-mode — attach to a running backend on `attachPort` (default `17800`,
  runtime-overridable via `GACT_PORT` / `GACT_URL`), never offer an installer.
- Desktop Tauri-native config is a separate per-brand injection point: neutral overlay
  `apps/desktop/src-tauri/tauri.gact.conf.json` applied via `--config` (productName,
  identifier, title, icon); documented hook in `apps/desktop/src-tauri/tauri.brand.md`.
- The Go TUI does not read `brand.json` — it takes `GACT_BRAND_NAME` + `GACT_ADAPTER_*`
  from the launcher (per `apps/branding/NOTICE-brand-mechanism-changed.md`).

**Build commands** (script names verified in `apps/web/package.json`):

```powershell
cd apps/web
pnpm build          # neutral default via apps/brand.config.json
pnpm build:clio     # scripts/with-brand.mjs clio build — writes brand.config.local.json
pnpm build:gact     # same wrapper, neutral profile
pnpm dev:clio       # branded dev server
```

`scripts/with-brand.mjs <brand> <script>` writes `apps/brand.config.local.json` (and
prefers `../../clio-agent/branding/clio/brand.json` when that sibling checkout exists),
then also sets `GACT_BRAND` in the child env.

**⚠ The mechanism changed once — beware stale references to `GACT_BRAND` env selection.**
`apps/branding/NOTICE-brand-mechanism-changed.md` records the switch (it killed
`GACT_BRAND_SRC` and env-var selection). Still-stale as of 2026-07-06: the top
`apps/STATUS.md` entry ("brand injected at BUILD via `GACT_BRAND=<profile>`") and the
docstring at the head of `vite-plugin-brand.ts` — the build reads **only** the config
file (`vite.config.ts:13` calls `resolveBrandConfig()`; no env read). `GACT_BRAND`
survives only as a **test-harness selector**: `apps/web/playwright.config.ts` defaults
the visual suite's brand to `clio` and materializes the choice by writing the config file
(`tests/visual/write-brand-config.mjs`) before building. When in doubt,
`apps/branding/README.md` + `INTEGRATION.md` are current truth.

---

## 7. Locale

Verified in `apps/web/src/locale.ts`:

- Supported tags: `en`, `es`, `ja`, `el` (the TUI ships these dictionaries and persists
  the choice at `~/.config/gact/config.json` → `ui.locale`).
- The web mirrors that choice in `localStorage` under key **`clio.locale.v1`** and
  attaches it as `Accept-Language` on every client request — **no header at all when the
  locale is the default `en`** (matches TUI behavior).
- UI string translation is not yet wired on the web; the header exists so backend-driven
  copy can honor the preference later. Don't claim web i18n exists.

---

## 8. Desktop (Tauri) overview

`apps/desktop` = `@clio/desktop`, a Tauri 2 shell wrapping the same `@clio/web` bundle.
The Rust crate is `apps/desktop/src-tauri/src/` (40 files). Map:

| Cluster | Files | What it does |
|---|---|---|
| Supervisor | `supervisor.rs` + `supervisor_{attach,boot,boot_log,boot_log_open,installer,install_command,install_events,launcher,probe,shutdown,spawn,spawn_command,state,types}.rs` | Sidecar lifecycle: attach to a running clio on the conventional port, or spawn the bundled `clio-agent-gact` via the Go launcher; streamed install progress; probe; shutdown. On Windows shutdown tree-kills (`taskkill /T /F`) — a real orphaned-grandchild bug was found and fixed here (apps/STATUS.md W4), and boot-replacement reaping landed in `b2f93704` (#228, PR #242). |
| HTTP bridge | `gact_http.rs`, `gact_http_response.rs` (+ `gact_http_tests.rs`) | Routes WebView REST through Rust (sidesteps browser CORS). Known past bug: 204/null-body Response construction broke every desktop 204 endpoint. |
| SSE bridge | `sse_bridge.rs`, `sse_message.rs`, `sse_parse.rs`, `sse_registry.rs`, `sse_stream.rs` (+ `sse_stream_tests.rs`) | `gact_sse_open`/`gact_sse_close`: Rust reads the SSE stream and forwards events over a Tauri Channel. **`sse_parse.rs` is an independent, hand-written Rust SSE parser** — the repo's third SSE parser (Go `tui/internal/client/sse.go`, TS `apps/core/src/client/sse.ts`, Rust). Any SSE framing change must be checked in all three. Pure-web builds still use `EventSource`. The bridge forwards `data:` payloads without filtering on SSE event names (new named events flow through with zero Rust changes). |
| SSH remote backend | `ssh.rs`, `ssh_command.rs`, `ssh_keyring.rs`, `ssh_types.rs` (+ `ssh_tests.rs`) | `ssh -N -T -L` tunnel to a remote clio; probes `ssh -V` first; key passphrases go to the **OS keychain** via the `keyring` crate (native backends only — no in-memory fallback; keychain-unavailable ⇒ `KeychainWriteFailed`, surfaced). Service id `ai.iowarp.clio.desktop.ssh`; uninstall does NOT wipe entries. |
| Chrome | `tray.rs`, `menu.rs`, `menu_spec.rs` (+ `menu_spec_tests.rs`) | Tray + native File/Edit/View/Help menus (declarative MENU_SPEC; JS side `menu-actions.ts` has a cross-language contract test that reads `menu.rs`). |
| Updater | `lib.rs` registers `tauri_plugin_updater` + `tauri_plugin_process`; JS side `tauri_update.ts` (native check/install/relaunch, gated on `inTauri`) vs `updateCheck.ts` (pure-web "new build deployed → refresh" via `version.json`). | Two distinct update flows — don't conflate them. Note: `apps/SECURITY.md` lists auto-update under "deferred to v1.0"; the plugin IS registered in `lib.rs` as of 2026-07-06, so that list is partially stale — verify behavior before citing either way. |
| Brand backend gen | `brand_backend.rs` + `scripts/gen-brand-backend.mjs` | Generates the managed-backend descriptor from the brand profile (§6). |

Also present: `apps/desktop/sidecar-launcher/` — a **separate Go module** (the launcher
binary the supervisor spawns) that is NOT in `go.work` and is exercised by no workflow.

### Security posture (`apps/SECURITY.md` — read it before touching supervisor/auth code)

- **Bundled-sidecar flow:** binds `127.0.0.1` on an **ephemeral port**; a fresh 32-byte
  CSPRNG bearer token per launch is passed to clio via the **`CLIO_AUTH_TOKEN`** env
  (never persisted, never in the HTML); `/v1/capabilities` is probed with
  `Authorization: Bearer` for 30s before the main window opens; the frontend only learns
  URL+token via the `get_backend` Tauri command.
- **FINDING (2026-05-31), still relevant:** the **attach-first** path (probe `:17800`,
  attach with an **empty** token relying on clio's `trust_socket` localhost trust) plus
  clio historically emitting `Access-Control-Allow-Origin: *` = any web page in the
  user's normal browser could drive clio's tool surface (CSRF-to-code-execution class).
  Mitigation (c) is DONE (all desktop traffic incl. SSE routed through Rust); (a) bearer
  on attach and (b) scoped CORS remain open per SECURITY.md. Never recommend or extend
  the attach-first flow without restating this finding. (clio later shipped CORS
  default-deny — `CLIO_GACT_CORS_ORIGINS` — per apps/STATUS.md A5; pure-web against a
  remote clio needs that env set.)
- Remote-backend bearer tokens live in `localStorage` (`clio.backends.v1`) — the
  settings export deliberately excludes that key both ways.

### ⚠ CI hole: desktop Rust tests NEVER run in CI

Verified 2026-07-06: no workflow under `.github/workflows/` runs `cargo test` or clippy
(`apps.yml` only caches cargo and installs `tauri-driver` for a WebView E2E). The
`@clio/desktop` pnpm `test` script is only `node --test tests/smoke.test.mjs`, and its
`lint`/`typecheck` are echo no-ops. So `gact_http_tests.rs`, `sse_stream_tests.rs`,
`ssh_tests.rs`, `menu_spec_tests.rs` and the `sidecar-launcher` Go tests are **local-only
gates** — a green CI says nothing about the desktop Rust layer. Before any desktop
change, run them yourself:

```powershell
cd apps/desktop/src-tauri
cargo test --lib          # some tests take live-backend env (e.g. CLIO_GACT_URL); see test files
cd ../sidecar-launcher
go test ./...
```

(Command shape from apps/STATUS.md gate logs, e.g. "cargo --lib 21/21"; not executed in
this authoring session — Rust builds take minutes. `cargo test` env-gated live tests skip
without a backend.)

---

## 9. Evidence conventions (how rendering claims get proven here)

**Doctrine (owner-confirmed):** green tests never close a UI issue. Drive the real app;
capture the rendered output; then **READ the artifact with the Read tool** — do not
grep/python/regex-summarize it into context (pattern filters miss the errors you didn't
predict). If context size is a concern, send a subagent to read and summarize. This is
written into RENDERING_SPEC §0 ("READ raw, don't parse") and TODO.md's verification
doctrine, and it has a named casualty: mock/emulator screenshots "looked good" while the
real screen was broken, because the mock exercised a different code path — **verify
against real runs, never the emulator, for transcript-rendering claims.** Capture
**mid-stream** for live-path claims; a reloaded session only proves the settled path.

**The screenshot corpus:** `apps/web/screenshots/` (distinct from the TUI's root
`screenshots/`). Per apps/CLAUDE.md rule 4, any `apps/web/` change ends with refreshed
PNGs there via `pnpm --filter @clio/web test:visual` (Playwright builds + serves + shoots
the fixture routes; brand defaults to `clio`). The required-baseline filename list lives
in apps/CLAUDE.md ("Visual proof requirements") — filenames are stable; replace, never
rename/remove. Subdirs `audit/` and `0.8.4-audit/` hold live-proof captures.

**Render-demo harness** (script names verified in `apps/web/package.json`; run from
`apps/web`; needs a running clio + web server):

```powershell
cd apps/web
pnpm demo:earthscope-render    # scripts/earthscope-render-demo.mjs
pnpm demo:record               # scripts/record-web-demo.mjs (webm/mp4 + evidence)
pnpm probe:earthscope-sse      # scripts/probe-earthscope-sse.mjs
# also in scripts/: verify-transcript-render.mjs, audit-earthscope-sse.mjs, watch-session.mjs
```

Env knobs for the earthscope demo (read from the script source): `CLIO_WEB_URL`
(default `http://localhost:4173`), `CLIO_BACKEND_URL` (default `http://localhost:17800`),
`CLIO_EARTHSCOPE_BLUEPRINT` (default `earthscope-gnss-region`), `CLIO_EARTHSCOPE_OUT`,
`CLIO_EARTHSCOPE_HEADLESS=0` for headed. It PUTs `/v1/providers/lm` (claude_code/haiku)
unless `CLIO_EARTHSCOPE_CONFIGURE_PROVIDER=0`.

**Artifact vocabulary** (what the scripts write per capture point `<name>`):
- `<name>.png` — full-page screenshot
- `<name>.html` — full page HTML
- `<name>.transcript.html` — the `[data-testid="transcript"]` subtree
- `<name>.transcript-core.html` — same subtree with images/canvas/video stripped to
  placeholders — **this is the file you Read to verify rendering**
- `messages.json`, `provider.json`, `blueprints.json`, `summary.json`,
  `autoscroll.json` — API-side evidence

`*.dom-summary.json` names appear in older evidence trails (TODO.md, June demo runs) but
no current script under `apps/web` writes them — treat them as historical artifacts, not
a convention to reproduce.

**Pass condition for a transcript run** (from `.claude/skills/live-web-session.md`): run
the session THROUGH to the synthesis tail (main's `answer` part — where ~90% of render
bugs fire), then on the captured DOM: zero `[class*="broken"]` nodes and zero surviving
`[[ ##` markers, plus an eyeball Read of the `transcript-core.html` against
CANONICAL-CONVERSATION.md.

---

## 10. Stale-doc traps in apps/ (verified 2026-07-06)

| Claim you'll find | Reality |
|---|---|
| RENDERING_SPEC §0/§9: "ExecutionTree is the real renderer; AssistantTurnView is dead code" | Inverted since 2026-07-01 (`09240c4c`, `29e0c10d`): one path through `buildAssistantTurnModel` → `AssistantTurnView`; ExecutionTree deleted. The spec's RULES still bind. |
| apps/STATUS.md top entry: "brand injected at BUILD via `GACT_BRAND=<profile>`" | Mechanism changed: config file (`brand.config.json` / `brand.config.local.json`); `GACT_BRAND` is only a test-harness selector. See `apps/branding/NOTICE-brand-mechanism-changed.md`. |
| `vite-plugin-brand.ts` header: "chosen via the GACT_BRAND env var" | Same staleness; `vite.config.ts` reads `resolveBrandConfig()` only. |
| apps/SECURITY.md: "Auto-update … deferred to v1.0" | The updater plugin is registered in `lib.rs` and `tauri_update.ts` drives it; verify actual behavior before citing the deferred list. |
| apps/STATUS.md is "current state" | It is a long append-only ledger; entries below the top are historical runs (June 2026 and earlier). Durable status lives in GitHub issues/PRs. |
| apps/HARNESS.md: "git checkout feat/apps-harness" | Historical branch instruction from the original harness session; work happens on `develop` per the repo branch model (see gact-change-control). |

---

## Provenance and maintenance

Facts above were verified against the working tree and GitHub on **2026-07-06**.
Re-verification one-liners (PowerShell, from the repo root):

```powershell
# Binding specs still present + apps/CLAUDE.md still declares them binding
Get-Content apps/CLAUDE.md -TotalCount 20

# One markdown renderer / no second renderer crept in
Get-ChildItem apps/web/src/components -Filter *Markdown* -Name    # expect: Markdown.tsx (+ inline-markdown.css)

# One transcript path (no ExecutionTree resurrection)
Get-ChildItem apps/web/src/components -Filter Execution* -Name    # expect: nothing

# The frozen client filters still exist (until clio#767)
Select-String -Path apps/web/src/components/transcriptDelegationModel.ts -Pattern dedupToolThought | Select-Object -First 1
Test-Path apps/web/src/components/clioScaffolding.ts

# Issue/PR states that gate the dedup deletion + streaming rework
gh issue view 767 --repo iowarp/clio-agent --json state,title
gh issue view 232 --repo iowarp/gact-tui --json state,title
gh issue view 233 --repo iowarp/gact-tui --json state,title

# Brand mechanism (config file, not env)
Select-String -Path apps/web/vite.config.ts -Pattern resolveBrandConfig
Get-Content apps/brand.config.json

# Desktop Rust CI gap still open (expect: no `cargo test` hits)
Select-String -Path .github/workflows/*.yml -Pattern "cargo test"

# Demo/evidence script names
Select-String -Path apps/web/package.json -Pattern "demo:|test:visual"

# Live* module inventory
Get-ChildItem apps/web/src -Filter Live*.ts -Name

# smd dependency pin
Select-String -Path apps/web/package.json -Pattern streaming-markdown
```

If any of these disagree with the text above, trust the repo and update this skill.
