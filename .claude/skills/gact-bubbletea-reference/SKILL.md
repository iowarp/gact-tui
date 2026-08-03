---
name: gact-bubbletea-reference
description: Terminal-UI domain pack for the gact-tui TUI (tui/ module). Load this before writing or reviewing ANY Go code under tui/, when you see Bubbletea/lipgloss/bubbles/glamour imports, tea.Model/Update/View, teatest or golden-file test failures, VHS .tape files, "screenshot the TUI", SSE events not rendering, a new UI feature/component/modal, config.json fields, or compile errors mentioning charm.land or github.com/charmbracelet.
---

# gact-bubbletea-reference — the terminal-UI domain pack

Everything a session needs to write, test, and visually verify Bubbletea code in
`tui/` at this repo's standard. All paths are relative to the repo root
`D:/Libraries/Documents/projects/gact-tui` unless absolute. All version pins,
counts, and line numbers verified as of 2026-07-06 (re-verify commands at the
bottom).

Jargon used throughout:

- **Bubbletea** — the Elm-architecture Go TUI framework (`Init/Update/View` on a
  `Model`). **lipgloss** = styling, **bubbles** = ready-made components,
  **glamour** = markdown-to-ANSI, **VHS** = charmbracelet's terminal recorder
  that drives a binary from a `.tape` script and produces GIFs/PNGs.
- **Golden test** — a test that compares rendered output byte-wise against a
  committed `testdata/*.golden` file.
- **teatest** — charmbracelet's harness that runs a real `tea.Program` against
  in-memory buffers so you can type/send messages and assert on output.
- **SSE** — Server-Sent Events, the streaming half of the GACT wire contract.

## When NOT to use this skill

| You are actually doing | Load instead |
|---|---|
| Running the emulator / TUI / clio backends, ports, artifact cleanup | gact-run-and-operate |
| Changing wire-visible behavior (endpoints, event shapes, capabilities) | gact-wire-protocol-reference (spec-first rule) |
| Web or desktop rendering (smd renderer, Live* engine, brand system) | gact-web-rendering-reference |
| Deciding what counts as evidence / adding non-UI tests | gact-validation-and-qa |
| Adding a config flag end-to-end across surfaces | gact-config-and-flags |
| Triaging a bug whose cause is unknown | gact-debugging-playbook first |
| Classifying/gating/committing a change | gact-change-control |

---

## 1. Stack table — exact pins (from `tui/go.mod`, as of 2026-07-06)

| Library | Module path | Version | Role |
|---|---|---|---|
| Bubbletea | `charm.land/bubbletea/v2` | v2.0.6 | Elm-architecture runtime |
| Bubbles | `charm.land/bubbles/v2` | v2.1.0 | textarea, textinput, key, ... |
| Lipgloss | `charm.land/lipgloss/v2` | v2.0.3 | styling / single-block layout |
| Glamour | `charm.land/glamour/v2` | v2.0.0 | markdown → ANSI |
| teatest | `github.com/charmbracelet/x/exp/teatest/v2` | v2.0.0-20260413165052-6921c759c913 | program-level test harness |
| golden | `github.com/charmbracelet/x/exp/golden` | (indirect) | snapshot compare helper |
| ultraviolet | `github.com/charmbracelet/ultraviolet` | (indirect, via bubbletea) | constraint layout — **not currently imported by any tui/ code** (verified by grep); candidate tool only |

Go toolchain: `go 1.25.8` (tui/go.mod). Wire types come from the sibling
module `github.com/JaimeCernuda/gact-tui/emulator` (`emulator/pkg/gact`) via a
`replace` + `go.work` — the TUI does not build outside the workspace.

> **WARNING — import paths.** The four Charm libraries are imported as
> `charm.land/<name>/v2`, **NOT** `github.com/charmbracelet/<name>`. Upstream
> README/example code and most training-data snippets use the old GitHub
> paths and **will not compile here**. Additionally, in v2 `Model.View()`
> returns a `tea.View` **struct** (fields `Content`, `Cursor`, `AltScreen`,
> `MouseMode`, `ReportFocus`, `KeyboardEnhancements`, plus `BackgroundColor` /
> `ForegroundColor` / `WindowTitle` as used in `app_view.go`) — not a
> `string`. Only teatest and golden still live under
> `github.com/charmbracelet/x/exp/...`.

### Bubbletea v2 essentials (distilled from `notes/bubbletea.md`)

```go
type Model interface {
    Init() Cmd
    Update(Msg) (Model, Cmd)
    View() View // v2: struct, not string
}
```

- Program options for tests: `WithInput(io.Reader)`, `WithOutput(io.Writer)`,
  `WithWindowSize(w,h)`, `WithColorProfile(colorprofile.ANSI256)`,
  `WithEnvironment([]string{"TERM=xterm-256color"})`.
- `p.Send(msg)` is safe from goroutines — the canonical way to inject external
  events.
- `tea.Batch` = concurrent/unordered; `tea.Sequence` = ordered.
- `tea.Tick` / `tea.Every` fire **once**; re-enqueue in Update or the
  animation silently stops (this repo's ticker component does exactly that).
- Keys: `case tea.KeyPressMsg:` then `msg.String()` (`"enter"`, `"ctrl+c"`).
- Cmds must *return* a Msg; mutating model state inside a Cmd is a data race.
  Mutation happens only in Update.

---

## 2. App composition — how the TUI is actually wired

`tui/internal/ui` is ONE flat Go package (625 top-level `.go` files, as of
2026-07-06) plus three real sub-packages: `widget/` (scrollstate,
selectablelist, textinput — reusable stateful widgets with tests),
`textutil/`, and `locale/` (en/es/ja/el JSON). Issue iowarp/gact-tui#234
(open epic) tracks splitting the flat package; until it lands, follow the
file-cluster rules in section 3.

The composition pattern (all verified in source):

- **`app.go`** — `App` is the root `tea.Model`. It embeds shared state structs
  (`appConfigState`, `appFeedbackState`, `appInputState`, `appLifecycleState`,
  `appOverlayState`) and 43 named domain **components** (`session`, `agent`,
  `connection`, `execution`, `cmdPalette`, `conversation`, `interaction`,
  `modals`, `clipboard`, `inputComposer`, `catalog`, `sidebar`, `ticker`,
  `permission`, `memory`, `plugins`, `fileViewer`, ...).
- Each component is a struct holding an **`app *App` back-reference** so its
  methods reach shared services (client, theme, dimensions, other components)
  via `c.app`.
- **`app_constructor.go`** — `New`/`NewWithTheme` build the App;
  `wireComponents()` (line 100) assigns all 43 `.app` back-references.
- **`app_update.go`** — `App.Update` calls `a.wireComponents()` **defensively
  at the top of every Update** (line 19). Rationale in the comment: production
  goes through `New()`, but struct-literal test apps drive `Update()` directly,
  and SSE ingest reaches several components on the very first Update. It is
  idempotent and cheap. **If you add a component, register it in
  `wireComponents()` or its methods nil-panic on `c.app`.**
- **`app_update_dispatch.go`** — `dispatchUpdateMessage` is a giant typed-
  message switch routing each msg to the owning component's handler
  (`case sseBatchMsg: return a.connection.handleSSEBatch(m)`).
  `a.inputComposer.dispatch(msg)` gets first crack before the switch.
- **`app_view.go`** — `View()` switches on `a.stage`
  (`StageIntro` / `StageConnecting` / `StageError` / default = main screen),
  wraps the string in `tea.NewView`, sets `AltScreen` (unless
  `DisableAltScreen` — teatest needs it off), `MouseModeAllMotion` when
  `MouseEnabled`, `WindowTitle`, and records audit frames via
  `a.audit.RecordRendered`.
- **`app_commands.go`** — `Init()`: if `StageIntro`, only start the splash
  tick (marker JJJ1 — connect is deferred until the splash dismisses);
  otherwise `connectCmd` runs a 5-second-timeout `Capabilities` call and hits
  `/v1/workspaces` **only if** `caps.Capabilities.Workspaces` is true
  (marker CLIO-BBBBBBBBBB14 — clio advertises false and 501s).

### The non-negotiable: NEVER block in Update

All I/O goes inside a returned `tea.Cmd`. The load-bearing comment on
`startSSE` (`tui/internal/ui/app_sse_commands.go`) states it exactly:

> Connection setup (StreamEvents -> http.Client.Do) blocks until the server
> returns the SSE response headers - for a healthy backend that's <50 ms, but
> a wedged or slow-to-accept server can stall the Update loop for the full
> HTTP timeout. Wrap the whole open inside the returned tea.Cmd so the
> goroutine takes the hit, never the render thread.

Corollary from the pitfalls notes: don't route every msg to every child
(filter by type and focus), and don't mutate `App` fields from inside a Cmd.

---

## 3. Where new UI code goes

Cleanup-program ground rule #2 (CLAUDE.md): **no accretion** — new UI code
goes into the existing seam-named file clusters; do not create new god files
or grow unrelated code into existing ones. The clusters are filename prefixes
inside `tui/internal/ui/` (counts as of 2026-07-06):

| Prefix | Files | Domain |
|---|---|---|
| `interaction_*` | 58 | mouse hit-targets, clickable/scrollable zones |
| `catalog_*` | 57 | catalog-browser modal (`/mcp`, `/tools`, `/experts`, ...) |
| `render_*` | 37 | transcript/markdown/part rendering |
| `execution_*` | 35 | execution timeline ledger + projection |
| `lm_*` | 33 | LM provider config modal |
| `app_*` | 27 | root model: constructor, update, view, dispatch |
| `sidebar_*` | 22 | left sidebar modules |
| `conversation_*` | 21 | transcript state, viewport, selection |
| `agent_*` | 21 | agents hierarchy / blueprints |
| `file_*` | 19 | file viewer / picker |
| `command_*` | 18 | command palette (`command_palette_*`) |
| `settings_*` / `detail_*` | 16 each | settings modal / detail overlay |
| `session_*` | 15 | session list, actions, lifecycle |
| `workspace_*` | 14 | workspace selection |
| `live_*` | 13 | SSE event application (`live_events.go` is the entry) |
| `layout_*` | 12 | screen partitioning |
| `tool_*` / `context_*` | 11 each | tool rendering / context files |
| `doctor_*` / `clipboard_*` | 10 each | doctor modal / drag-to-copy |

(Smaller clusters exist: `presentation_*` 9, `mouse_*` 8, `chrome_*` 8,
`memory_*` 7, `runtime_*`, `permissions_*`, `metrics_*`, `help_*`, `retry_*`.)

Rules:

1. **Extend the matching cluster.** A new catalog pane goes in a new
   `catalog_<thing>.go`, not appended to an existing 1k-line file and never
   into a new `misc.go`/`helpers.go`.
2. **New reusable stateful widgets** go under `tui/internal/ui/widget/` (they
   have their own tests there).
3. **Letter-run marker comments are load-bearing.** Comments like `JJJ1`,
   `MMM2`, `VVVVV1`, `YYYYY1`, `LLLLLLLL1`, `NNNNNNNNN1`, `BBBBBBBB1`,
   `CLIO-BBBBBBBBBB14` (~60 across the package) are cross-references to the
   originating requests; iowarp/gact-tui#234 wants them *translated*, not
   deleted. Do not strip them when editing nearby code.
4. **`TODO`/`FIXME` grep is useless here** (exactly one hit, a test fixture).
   Debt lives in GitHub issues, not code comments — file an issue instead of
   adding a TODO.
5. CLI subcommands live as `cli_*.go` at the tui module root (63 files, plus
   33 `main_*_test.go` integration tests, as of 2026-07-06) — a known #234
   cleanup target; follow the existing pattern if you must touch them.

---

## 4. SSE → UI flow map

The full path from wire to pixels (every hop verified in source):

```
client.StreamEvents (tui/internal/client/sse.go)
  GET /v1/events or /v1/sessions/{id}/events
  Accept: text/event-stream, Last-Event-ID header, Timeout=0 client
  hand-rolled line parser → SSEEvent{ID, Type, Payload, Raw} on a 64-buffered chan
        │
startSSE (app_sse_commands.go)          ← tea.Cmd; NEVER opened on the render thread
        │ returns sseConnectedMsg{events, errs}
waitForSSE (app_sse_commands.go)        ← blocks on chan inside a tea.Cmd,
        │                                  drains up to maxSSEBatchEvents = 128
sseBatchMsg → dispatchUpdateMessage → connection.handleSSEBatch
        │
conversation.applySSEBatch → applySSE (live_events.go)
        ├─ execution.recordSSE (execution_sse.go)   → bounded per-session ledger
        └─ switch e.Type:
             message.created / message.part.added / .delta / .completed /
             message.completed (also promotes embedded tokens+cost_usd),
             session.status_changed, user_question.*, permission.*,
             semantic.event, tool.call.*, subagent.*, cost.updated,
             notification, session.cleared
```

Traps that have burned real sessions:

- **Envelope indirection.** The SSE `data:` JSON is
  `{type, occurred_at, payload}`. Handlers must read
  `e.Payload["payload"]`, not `e.Payload` directly. Getting it wrong compiles
  fine and silently no-ops (documented at the top of `live_events.go`).
- **Parser strictness (open gap, iowarp/gact-tui#234).** The client parser
  matches `"data: "` / `"event: "` / `"id: "` **with the space** and does not
  concatenate multi-line `data:` fields (`client/sse.go`, dispatch loop around
  lines 100–140). A spec-conforming backend emitting `data:foo` is silently
  dropped. Fixing this is spec-first work — see gact-wire-protocol-reference.
- **Reconnect lifecycle.** `handleSSEClosed` stamps `sseDownSince` on the
  first drop, backs off via `nextReconnectDelay()`/`sseBackoffAttempts`, and
  `handleReconnect` restarts only if the session is still current. The header
  `sseHealthDot` (app_view.go) shows green = live, amber = backoff, red =
  still connecting.
- **Execution ledger bounds (incident-tested).**
  `executionEventsBySession` is capped at `executionLedgerMaxEvents = 2000`,
  trimmed drop-oldest to `executionLedgerTrimTarget = 1500` (amortized O(1)),
  emitting a structured `execution.ledger.trimmed` audit event — per the
  no-silent-fallback ground rule. It is emptied on `session.cleared` and
  pruned **only** on backend-confirmed deletion. Refreshed session lists must
  NEVER drive pruning — they are workspace-scoped/archived-filtered views, and
  `lastSeenSeqIDBySession` suppresses SSE replay, so a wrong prune is
  irreversible in-process. This already burned once: commit
  `57496b29 fix(tui): bound the execution event ledger; prune only on explicit
  deletion (#244)` (fixes iowarp/gact-tui#231).
- **Rendering hot path is memoized.** `executionComponent` caches the
  projection by `(sessionID, len(events))` (valid because the ledger is
  append-only) and caches rendered turn blocks by message id + uint64
  signature so streaming re-renders only the active turn. If you change how
  events mutate the ledger, revisit both caches or you will render stale
  frames.

---

## 5. Golden / teatest discipline

Two distinct test styles exist in `tui/internal/ui` — know which you're in:

### A. View-golden tests (`app_view_test.go`) — the repo's own pattern

They **bypass `tea.NewProgram` entirely**: construct `*App` in a known state
(helper `newReadyApp`), set `a.width/a.height`, call `a.View().Content`, mask
volatile clock text (`stripVolatile` → `HH:MM:SSZ`), and compare against
`testdata/<TestName>.golden`. Comparison normalizes CRLF→LF and trims
trailing whitespace per line, so they pass on Windows.

- Goldens are **raw ANSI including truecolor SGR codes**
  (`ESC[48;2;15;15;20m...`). Nine `TestView_*.golden` files exist as of
  2026-07-06.
- The update flag is **`-update-views`** (defined in `app_view_test.go:18`) —
  NOT the upstream `-update`:

```powershell
# run (verified passing on this machine, 2026-07-06)
go test ./tui/internal/ui -run 'TestView_' -count=1
# refresh goldens after an INTENTIONAL visual change, then review the diff
go test ./tui/internal/ui -run 'TestView_' -update-views -count=1
```

- Determinism tricks used by the helper — copy them in new tests:
  `a.inputComposer.input.SetVirtualCursor(false)` (no blinking cursor),
  fixed sizes per test, `stripVolatile` for clocks, and hand-wiring state that
  the real app sets via messages (see the `N1` comment about
  `lastLoadedSessionID`).

### B. teatest end-to-end (`e2e_test.go`) and new program-level tests

`e2e_test.go` builds a real emulator binary, starts it on a random port, and
drives the real App through `teatest.NewTestModel(t, app,
teatest.WithInitialTermSize(140, 40))` with `app.DisableAltScreen = true`
(teatest's PTY capture needs alt-screen off).

For any new `tea.Program`-based golden test, pin ALL of these or it will pass
locally and fail in CI (from `notes/testing.md` / `notes/pitfalls.md`):

1. `WithWindowSize(w, h)` (or `teatest.WithInitialTermSize`)
2. `WithColorProfile(colorprofile.ANSI256)`
3. `WithEnvironment([]string{"TERM=xterm-256color"})`
4. `WithInput(&bytes.Buffer{})` / `WithOutput(&buf)`

Synchronize with `teatest.WaitFor(t, tm.Output(), predicate, ...)` — never
`time.Sleep`. `tm.FinalOutput` blocks until the program exits; send
`tea.Quit` if the model won't quit itself.

### Blast radius and evidence rules

- Goldens embed exact ANSI color codes ⇒ **any theme/style tweak breaks every
  golden that renders the styled element.** Isolate styling changes into
  dedicated PRs so the golden churn is reviewable.
- Golden tests catch layout and state transitions. They do NOT catch color
  rendering, font/width drift, or timing. **Green goldens never close a UI
  issue in this repo** — CLAUDE.md working rule 2 requires a fresh screenshot
  (section 6), and the owner's standing rule is to drive the real app and
  READ the rendered evidence with the Read tool, not grep it.

---

## 6. VHS tape authoring and screenshots (this-machine workflow)

Ground truth about tapes:

- Tapes live at the **tui module root**: 100 `*.tape` files as of 2026-07-06
  (`screenshot_*`, `verify_*`, `diag_*`, `demo_*`, ...).
- `make screenshots` renders **every** `*.tape` under `tui/` with
  `GACT_BACKEND=http://localhost:$(PORT)` (PORT defaults to 7777). A scratch
  tape you leave there WILL be picked up — name deliberately and delete
  scratch tapes when done.
- Curated results live in `screenshots/` (267 files as of 2026-07-06) with
  `screenshots/README.md` as the index. UI-touching work must add or refresh
  an entry there (CLAUDE.md).

Tape gotchas (from `notes/pitfalls.md`, each cost real iterations):

| Gotcha | Fix |
|---|---|
| `Wait /regex/` matches **only the last screen line** — on a bordered TUI that line is `╰─╯` and the wait times out | Use `Wait+Screen /regex/` (46 of the repo's tapes do) |
| Default `Wait` timeout is 15s; real backends can exceed it | `Wait+Screen@30s /regex/` |
| A tape that only takes a `Screenshot` still requires an `Output x.gif` line | Always keep the `Output` header |
| Tapes hardcode backend/port via `$GACT_BACKEND` and expect the binary on PATH | Export `GACT_BACKEND` and have the built binary reachable |

### Windows (this machine) — use the helper, not raw `vhs`

The repo's tapes are bash-authored (`Set Shell "bash"`, `/tmp/gact`,
`/home/jcernuda/tui/screenshots/...` paths). `scripts/vhs-windows.ps1`
rewrites them at runtime (shell→cmd, `/tmp/gact`→`gact`, screenshot paths→
`screenshots/`, `VAR=x cmd` prefixes→chained `set` commands) and pins
**ttyd 1.7.2** into `.tools/vhs-windows/` because VHS v0.10 hangs with the
WinGet ttyd 1.7.7 (documented in `screenshots/README.md`). It prepends
`tui/` to PATH, so the binary must exist as `tui/gact.exe` (gitignored).

```powershell
# 1. build the TUI binary where the helper expects it
cd D:\Libraries\Documents\projects\gact-tui\tui
go build -o gact.exe .

# 2. have a backend running (emulator on 7777 — see gact-run-and-operate)

# 3. render one tape (helper default timeout 180s; vhs must be on PATH:
#    winget install charmbracelet.vhs)
cd D:\Libraries\Documents\projects\gact-tui
.\scripts\vhs-windows.ps1 .\tui\screenshot_catalog.tape -Backend http://localhost:7777
```

Bash/Linux equivalent (what the Makefile and CI-side docs use):

```sh
cd tui && go build -o gact . && cd ..
PATH="$PWD/tui:$PATH" GACT_BACKEND=http://localhost:7777 vhs tui/screenshot_catalog.tape
```

### Close the loop: READ the screenshot

After VHS finishes, use the **Read tool on the PNG** — it renders inline.
Verify like a reviewer: border corners align, dividers span full width,
colors are the intended ones (not "some color"), padding consistent, no
double-width truncation. Do not declare a UI change done from a green test or
from the tape exiting 0 — the screenshot is the evidence.

---

## 7. Config idiom (`tui/internal/config`)

- Lookup order: `$GACT_CONFIG` → `$XDG_CONFIG_HOME/gact/config.json` →
  `$HOME/.config/gact/config.json`. Missing file = zero Config, no error.
- **Every field is pointer-typed** (`*string`, `*int`, `*bool`) to distinguish
  "absent from file" from "explicitly zero" — required for the layering
  `flag > env > file > fallback` implemented by `config.Resolve`. Adding a
  value-typed field breaks the layering; don't.
- **The Resolve default-value trap** (verbatim behavior of
  `config.Resolve(file *string, env, flag, fallback string)`): a flag whose
  value equals the fallback is treated as *not explicitly set* so env/file can
  still override — Go's flag package returns the default when a flag isn't
  passed and the two are indistinguishable. Consequence: a user *explicitly*
  passing `--theme dark` (the fallback) can be overridden by a config file.
  Known, accepted wart; don't "fix" it locally in one call site — that's a
  cross-surface behavior change (see gact-config-and-flags).
- Empty string at any layer means "not set".
- Migrations: `ConfigVersion` + `migrate.go` walk configs forward on Load,
  best-effort (a failing migration logs but doesn't block boot) — marker MMM2.
- The config package also owns two client-side registries: `detached.json`
  (Ctrl+Z detach records) and the agents registry (`gact agent deploy` /
  `gact connect <name>`).

New config knobs are a multi-surface decision — checklist in
gact-config-and-flags. UI code reads resolved values passed in from
`tui_runtime.go`, it does not re-read the file.

---

## 8. Charm library cheat sheet (distilled from `notes/`)

### lipgloss v2 (`notes/lipgloss.md`)

- `Style` is an **immutable builder** — every setter returns a copy;
  `s.Bold(true)` does not modify `s`.
- Box model: `Margin [ Border [ Padding [ Content ] ] ]`. **Padding counts
  toward `Width`**: `Width(40).Padding(0,2)` leaves 36 content cells.
- **Never `len()` a styled string.** Use `lipgloss.Width(s)` /
  `lipgloss.Height(s)` — ANSI- and CJK/emoji-aware.
- Colors: `"1"`–`"15"` (ANSI16), `"16"`–`"255"` (ANSI256), `"#RRGGBB"`
  (truecolor), auto-downsampled to terminal capability. Adaptive:
  `lipgloss.LightDark(dark)` + react to `tea.BackgroundColorMsg`.
- Layout helpers: `JoinVertical(pos, ...)`, `JoinHorizontal(pos, ...)`,
  `Place(w,h,hpos,vpos,content)`.
- Tabs silently become spaces (width 4; `TabWidth(n)` / `-1` to disable).
  `Inline(true)` strips `\n`.
- In this repo, colors come from the active `Theme` (see `app_view.go`,
  `sseHealthDot`) — never hardcode hex values in components.

### bubbles v2 (`notes/bubbles.md`)

| Component | Use for | Gotcha |
|---|---|---|
| `textarea` | chat input (this repo's composer) | normalizes `\r\n`→`\n`; default Enter inserts newline — this repo rebinds `InsertNewline` to shift+enter/alt+enter/ctrl+j so Enter sends (see `app_constructor.go`, marker VVVVV1 for the prompt-gutter trick) |
| `textinput` | single-line fields | virtual cursor default; `SetVirtualCursor(false)` for deterministic goldens |
| `viewport` | transcript/log scrollback | `SoftWrap` reflows on every View — bad for huge content |
| `list` | pickers/menus | items need `FilterValue() string` AND an `ItemDelegate` or the list renders blank |
| `spinner` | busy states | must return its `Tick` from Init/start or it freezes (this repo uses its own ticker component instead) |
| `help` | key hints | stateless; `Update` is a no-op, just call `View(keymap)` |

Focus pattern: parent tracks a focus enum (this repo: `FocusZone` =
`FocusSidebar/FocusBody/FocusRightSidebar/FocusInput`) and routes
`KeyPressMsg` only to the focused child.

### glamour v2 (markdown)

`render_markdown.go` caches `glamour.TermRenderer`s by `(themeKey, width)`
because renderer init is expensive, and derives a `StyleConfig` from the
active Theme (built-in named glamour styles ignored the palette — comment
marker P1). If you touch markdown rendering, go through `glamourRenderer`;
don't construct ad-hoc renderers per frame.

### ultraviolet layout (`notes/ultraviolet.md`) — candidate only

A Cassowary constraint solver for multi-pane splits
(`layout.Vertical(Len(3), Fill(1), Len(1)).Split(area).Assign(&hdr,&body,&ftr)`;
priority `Min > Max > Len > Percent > Ratio > Fill`; results are
`image.Rectangle` — `.Dx()/.Dy()`). It is an indirect dependency and **no
tui/ code imports it today** (verified 2026-07-06). Reach for it only if a
genuinely new 3+-pane constraint layout appears and plain
lipgloss `Join*` in the existing `layout_*` cluster can't express it —
and that is a design change, not a drive-by.

---

## 9. Pre-merge checklist for any `tui/` change

1. Code landed in the correct seam-named cluster (section 3); no new god
   file; letter-run markers preserved.
2. No blocking work in `Update`; new I/O wrapped in `tea.Cmd`; new components
   registered in `wireComponents()`.
3. `go build ./...` and `go test ./...` from repo root (go.work) — or
   `make test` for every module.
4. Goldens: intentional visual change → `-update-views`, review the golden
   diff like code, commit goldens.
5. Fresh screenshot via VHS (section 6), **Read the PNG**, and
   add/refresh the `screenshots/README.md` entry for UI-visible work.
6. No client-side semantics that belong on the server (dedup/filtering/
   merging of wire data) — GACT is a generic interface to many agents;
   one agent's semantics imposed in the TUI breaks the others. If the fix
   smells server-side, stop and see gact-architecture-contract /
   gact-wire-protocol-reference.
7. Failures surface structured reasons (no silent fallback) — follow the
   `execution.ledger.trimmed` audit-event pattern, not a silent default.

---

## Provenance and maintenance

Everything above was verified against the working tree on 2026-07-06
(branch `develop`). One-line re-verification commands (PowerShell unless
noted; Git Bash lines marked):

| Fact | Re-verify with |
|---|---|
| Charm version pins | `Select-String 'charm.land' tui/go.mod` |
| Go version | `Select-String '^go ' tui/go.mod` |
| ui file count (625) | `(Get-ChildItem tui/internal/ui/*.go).Count` |
| Cluster prefix counts | bash: `ls tui/internal/ui/*.go \| sed 's\|.*/\|\|; s/_.*//; s/\.go//' \| sort \| uniq -c \| sort -rn \| head -25` |
| Golden update flag | `Select-String 'update-views' tui/internal/ui/app_view_test.go` |
| Golden inventory (9 `TestView_*.golden`) | `Get-ChildItem tui/internal/ui/testdata/*.golden` |
| Golden tests pass | `go test ./tui/internal/ui -run 'TestView_' -count=1` |
| SSE batch cap (128) | `Select-String 'maxSSEBatchEvents' tui/internal/ui/app_sse_commands.go` |
| Ledger bounds (2000/1500) | `Select-String 'executionLedger' tui/internal/ui/execution.go` |
| SSE parser strictness | read `tui/internal/client/sse.go` dispatch loop (~lines 100–140) |
| wireComponents count/site | read `tui/internal/ui/app_constructor.go:100` |
| Tape count (100) | `(Get-ChildItem tui/*.tape).Count` |
| `Wait+Screen` adoption | bash: `grep -l 'Wait+Screen' tui/*.tape \| wc -l` |
| Windows VHS helper | read `scripts/vhs-windows.ps1`; ttyd pin + rewrites in `screenshots/README.md` "Windows VHS" |
| Screenshots inventory (267) | `(Get-ChildItem screenshots).Count` |
| cli/main-test counts (63/33) | `(Get-ChildItem tui/cli_*.go).Count` / `(Get-ChildItem tui/main_*_test.go).Count` |
| #234 status (open epic, ui split) | `gh issue view 234 --repo iowarp/gact-tui` |
| Ledger incident commit | `git show --stat 57496b29` |
| ultraviolet still unused | bash: `grep -rl ultraviolet tui --include='*.go'` (expect empty) |

If any of these drift, update the corresponding section rather than trusting
this file — counts and pins are snapshots, the patterns are the durable part.
