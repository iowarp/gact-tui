# STATUS

**Last updated:** 2026-04-19T03:35Z
**Current phase:** MMM7/8 + NNN1 + JJJ1 shipped this iteration
**Repo:** https://github.com/JaimeCernuda/gact-tui — main is `d513c4e` and pushed
**Open:** LLL8b (TUI detach), MMM8b (TUI palette plugin wiring)

## This loop (Phases N + O)

### Phase N — second-round feedback follow-ups
- **N1.** Per-session input draft preservation (`swapInputDraftFor`).
- **N2.** Two-step /clear confirmation (pendingClearSessionID + toast).
- **N3.** `d` deletes last message (optimistic, target-latest pattern).
- **N4.** `/sessions` focuses sidebar + arms title filter.
- **N5.** Persisted collapse threshold via `config.json`
  (`Config.CollapseThreshold *int`, `config.Save`, `App.SaveConfig`).
- **N6.** Conformance suite gained Commands / Tools / Metrics sections
  with matching Skip flags.

### Phase X — CLI + backend surface
- **X1.** `gact tail [SID] [--workspace WS_ID]` streams SSE as JSON
  lines.
- **X2.** `gact ping` probes `/v1/health`; exit 0 healthy.

### Phase Z — cursor-aware everything
- **Z1.** `Ctrl+E` respects the Y1 cursor — expands the bulky
  part of the SELECTED message, falls back to newest-bulky.

### Phase LLL — UX polish round (user-flagged)
- **LLL2.** Catalog browser: Space toggles tool disabled state
  (persisted to Config.DisabledTools, dimmed render); Enter on an
  MCP server drills into a unified tools+resources+prompts subview
  with `[type]` prefixes; Esc/Backspace pops back to parent list.
  5 unit tests + screenshots/68-mcp-detail.png.
- **LLL3.** /skills now hits ListAgents filtered to source="skill"
  (per SPEC §6.5 line 807). Emulator seeds 2 skill agents
  (test_writer, release_notes). New catalogKindAgents kind for
  future browse routes. Screenshots 69 (skills) + 70 (agents).
- **LLL4.** Settings + catalog modals: full-width Primary-bg
  header bars (inverted pill), Bg-color row highlight on selected
  rows. Settings rowLine helper extracted. Screenshots refreshed.
- **LLL8a.** `gact tell --async` posts message and exits with
  sid<TAB>msg_id on stdout. Fix: bool flags excluded from `known`
  reorderFlagsFirst map (was gobbling next positional). CLI test
  covers both arg orderings + same-sid resume.
- **LLL7.** Survey of Claude Code source at /mnt/d/.../cc/src.
  Report at notes/cc-inventory.md with per-feature verdicts +
  8-item priority queue. Top adds filed as MMM1-MMM8 (SSE
  notification event, config migrations, hooks system,
  permission rules, session tasks, summarize instructions,
  /rewind, plugins dir).

### Phase MMM — adds from CC inventory
- **MMM1.** SSE `notification` event wired end-to-end. Emulator
  emits on MCP reconnect, TUI sets transientHint, `gact stream`
  prints `[level] title — body` row. CLI test catches it via tail.
- **MMM2.** Versioned config migrations framework (Migrate +
  ordered slice). Wired into LoadFrom; v1 stamps existing configs.
  3 unit tests.
- **MMM3.** Hooks system end-to-end (SPEC §6.17). Emulator stores
  + bus dispatcher + 3 endpoints; client wrappers; `gact hooks
  list/add/rm` CLI. Hook commands receive event JSON on stdin or
  via POST to URL. CLI test asserts e2e capture.
- **MMM4.** Permission policy auto-resolution (SPEC §6.11). Spec
  was already written but unimplemented — wired Policy type,
  matcher, GET/PUT /v1/policies, client ListPolicies/PutPolicies,
  `gact perms rules list/set/clear` CLI. CLI test installs deny
  rule + asserts auto-resolved/deny.
- **MMM5.** Session tasks (SPEC §6.18 added). gact.SessionTask
  type + 4 endpoints + capability flag + client wrappers +
  `gact tasks list/add/set/rm` CLI. CLI test exercises full
  lifecycle.
- **MMM6.** SPEC §6.2 summarize body extended with
  `instructions?: string`. Emulator echoes them, client
  signature updated, `gact summarize --instructions "..."` flag
  added. Test asserts round-trip.
- **MMM7.** SPEC §6.10 extended with `/rewind`. Emulator handler
  + client.RewindSession + `gact rewind <sid> <mid>
  [--include-target]` CLI. Found pre-existing scenario engine
  race (filed as NNN1).
- **MMM8.** Plugin loader (`tui/internal/plugins/`) +
  `gact plugins list/dir` CLI. Manifest at
  `~/.config/gact/plugins/<name>/plugin.json` declares slash
  commands. Bad manifests/commands skipped, errors surfaced via
  LoadVerbose. 5 tests. TUI palette wiring deferred.

### Phase JJJ — intro splash (user-flagged)
- **JJJ1.** ASCII splash with Triangle logo + GACT block-letters
  shipped. New StageIntro, viewIntro renderer, configurable via
  --intro-file / $GACT_INTRO_FILE / config.IntroFile (logo block
  + blank + name block). Skip with --no-intro / $GACT_NO_INTRO /
  intro_skip=true. Init guards connectCmd while in StageIntro.
  4 unit tests + screenshots/71-intro-splash.png.

### Phase NNN — emulator hardening
- **NNN1.** Scenario engine no longer panics when its session's
  messages are deleted mid-flight. Helpers `addPart` and
  `createAssistantMessage` now return placeholder non-nil values
  on error so the ~12 call sites that ignore the error can't
  nil-deref. Regression test deletes the assistant message
  mid-flight and verifies the session survives.
- **LLL1.** 13 stale screenshots refreshed via existing tapes
  (initial, collapse, compose, themes). Now reflect HHH1 + III1.
- **LLL5.** Sidebar height now matches conversation pane height —
  both bottom borders close on same row. Extracted
  `conversationPaneHeight` helper as single source of truth.
  UI goldens regenerated.
- **LLL6.** Footer hints clustered (action | nav | exit) with
  `·` and `│` separators. Cost rendered as a styled chip
  (chipBg=Bg, Secondary-bold $ + threshold-colored tokens).
  UI goldens regenerated.

### Phase III — tool call/result linkage
- **III1.** Tool calls and their results now interleave by CallID
  in the conversation pane. `pairToolResults` builds a per-message
  result map, tool messages whose payload is fully absorbed get
  skipped, unpaired results stay visible. Three unit tests +
  screenshots/67-tool-interleave.png.

### Phase KKK — name-based tell (user-flagged)
- **KKK1.** `gact tell <name> <msg>` — single idempotent verb.
  First call creates session titled <name>; subsequent calls
  resume. Resolver short-circuits on literal sess_<id>. Reply
  on stdout, "created session ..." notice on stderr (creation
  only). CLI test covers create→resume same-sid + empty-msg
  validation.

### Phase HHH — model indicator in header
- **HHH1.** TUI header appends `model: <id>  agent: <id>` after
  session label, before status badge. Drops on narrow widths.
  Two renderer tests + screenshots/66-header-model.png.

### Phase GGG — capabilities CLI
- **GGG1.** `gact capabilities` (alias `caps`) exposes the
  Connect-screen probe as a shell verb. Text mode prints contract
  version, backend identity, transports, auth, then ✓/· matrix of
  all 23 SPEC §3.3 capability flags. JSON dumps raw. CLI test
  asserts contract_version + three core flag rows.

### Phase FFF — list filters
- **FFF1.** `gact list` gained `--status`, `--archived`,
  `--parent`, `--limit`. Status/limit are client-side; the rest
  flow through SessionFilter. --status is validated, exit 2 on
  bogus values. CLI test asserts truncation, status-keep,
  status-empty, and validation paths.

### Phase EEE — MCP resource read
- **EEE1.** `gact mcp resource-read <srv-id> <uri>` (alias
  `mcp read`) wraps new `client.McpResourceRead`. Writes text
  chunks to stdout, base64-decodes data chunks for binary. CLI
  test reads seeded `file:///docs/welcome.md`.

### Phase DDD — agent detail + watch
- **DDD1.** `gact agent show <id>` (alias `agents show`) wraps new
  `client.GetAgent`. Mirrors `tool show`. Text mode lists metadata
  + system_prompt block; JSON mode dumps raw AgentDef.
- **DDD2.** `gact watch <sid> [--interval DUR] [--timeout DUR]`
  tails session transitions as TSV rows
  (`HH:MM:SS<TAB>status<TAB>msg_count<TAB>tokens_out`). Exits
  after activity + 2 idle ticks. CLI tests cover both verbs.

### Phase CCC — tool detail + MCP reconnect
- **CCC1.** `gact tool show <id>` (alias `tools show`) wraps GET
  /v1/tools/{id} via new `client.GetTool`. Text mode prints
  metadata + pretty-JSON schemas; JSON mode dumps raw Tool.
- **CCC2.** `gact mcp reconnect <srv-id>` POSTs reconnect via new
  `client.McpReconnect`. CLI tests cover both: tool show against
  `bash`, reconnect against `mcp_fake` (exit 0) and unknown id
  (non-zero).

### Phase BBB — MCP detail CLI
- **BBB1.** `gact mcp tools|resources|prompts <server-id>` exposes
  the three previously-unwrapped per-server endpoints. Added
  `client.McpServerTools/Resources/Prompts`. TSV columns tuned per
  type. JSON mode dumps raw slice. CLI test asserts ≥1 row each
  for `mcp_fake` and JSON shape.

### Phase AAA — repo map CLI
- **AAA1.** `gact repo-map <ws-id> [--format tree|json]` exposes
  the previously-unwrapped `/v1/workspaces/{id}/repo_map` endpoint.
  Added `client.WorkspaceRepoMap`. Tree mode uses tree(1)-style
  box-drawing + `· symbol` children; tokens-cost lands on stderr
  so stdout pipes cleanly. CLI test asserts main.go and Handler.

### Phase ZZ — workspace files CLI
- **ZZ1.** `gact files list <ws-id> [--format tsv|json]` wraps
  ListWorkspaceFiles. TSV columns: type, size, path.
- **ZZ2.** `gact files read <ws-id> <path>` writes raw bytes to
  stdout. Required new `client.ReadWorkspaceFile([]byte,error)`
  that bypasses the JSON decoder (response is octet-stream).
  CLI tests cover both verbs.

### Phase YY — undo CLI
- **YY1.** `gact undo <sid> [--count N]` POSTs
  `/v1/sessions/{id}/undo`. Added missing `client.UndoSession`
  wrapper returning reverted message ids. Stdout one mid per line,
  stderr `reverted N message(s)` summary. CLI test asserts mid
  count, summary, and log role-header drop.

### Phase XX — session info CLI
- **XX1.** `gact info <sid> [--format text|json]` wraps GetSession.
  Text output is one key:value per line (awk-friendly): id, title,
  status, workspace, parent, model, agent, message_count, tokens,
  cost, timestamps, summary. JSON mode dumps the raw Session
  struct. CLI test asserts title round-trip and status ∈
  {idle,running,waiting,error}.

### Phase WW — models CLI
- **WW1.** `gact models list [--provider PID] [--format tsv|json]`
  chains ListProviders + per-provider ListProviderModels into one
  command. TSV: provider_id·model_id·name·context_window. JSON
  embeds the full Model struct (capabilities, pricing). CLI test
  covers full enumeration, single-provider filter, and JSON shape.

### Phase VV — fork CLI
- **VV1.** `gact fork <parent-sid> [--at MID] [--title T]` POSTs a
  child session with parent_session_id (+ optional
  fork_at_message_id), inheriting the parent's workspace via a
  GetSession lookup. Prints the new id. CLI test forks and
  verifies the child shows up under ?parent_session_id=.

### Phase UU — workspaces CLI
- **UU1.** `gact workspaces list [--format tsv|json]` (aliases
  `workspace`, `ws`) wraps `/v1/workspaces` so scripts can grab a
  workspace id without launching the TUI. TSV: id·name·root_path.
  CLI test asserts seeded `ws_default` in both formats.

### Phase TT — search CLI
- **TT1.** `gact search <sid> <query> [--format tsv|json]` wires
  the §6.3 search endpoint into the shell. TSV output is
  `mid<TAB>role<TAB>snippet`; one ListMessages call up front
  resolves role per match. JSON mode pretty-prints raw match
  objects. CLI test seeds a unique token and asserts both modes.

### Phase SS — diff CLI
- **SS1.** `gact diff list/apply/reject` mirrors the TUI a/r body
  keys for shell automation. `list` walks ListMessages client-side
  (no backend list endpoint for diffs) and prints
  `path<TAB>pending|applied|rejected`. apply/reject reuse existing
  client methods; empty paths means "all currently pending". CLI
  test runs the full propose→list→apply→list cycle.

### Phase RR — permissions CLI
- **RR1.** `gact perms {list,allow,deny,allow-session,allow-workspace}`
  mirrors the TUI a/d/s/w keys for shell automation. CLI test
  triggers a permission scenario, finds the pending id, allows,
  verifies resolved.

### Phase QQ — pretty stream
- **QQ1.** `gact stream` is `gact tail` for humans — one-liner
  HH:MM:SS timeline with per-event-type summaries. CLI test.

### Phase PP — bug-report bundle
- **PP1.** `gact dump-bundle [-o DIR]` writes a single-directory
  bug-report snapshot (version + diag + metrics + every session
  export). One command instead of four.

### Phase NN — context CLI
- **NN1.** `gact context list/add/rm` manages session context files
  via the same endpoints as the sidebar `o` key.

### Phase OO — catalog CLI
- **OO1.** `gact catalog tools|agents|mcp|commands` — single CLI
  spanning all read-side catalog endpoints; TSV + JSON output.

### Phase MM — install + scripts dir
- **MM1.** `make install` (PREFIX/BINDIR overridable) +
  `make uninstall`. README quickstart updated.
- **MM2.** `scripts/completion.sh` shell-aware completion install
  helper.
- **+** `gact diag` now embeds the git revision + build time
  (shared `readVCSInfo` helper with `gact version`).

### Phase KK — one-shot scripting
- **KK1.** `gact quick <q|->` — create + ask + delete in one
  command. CLI test asserts session count unchanged after run.

### Phase LL — summary + completion
- **LL1.** `gact summarize <sid>` triggers backend summary; prints
  result. Completion scripts updated. CLI test.

### Phase JJ — observability
- **JJ1.** `gact metrics` text summary + `--format json` for
  scrapers. CLI test for both.

### Phase II — archive + completion
- **II1.** `gact archive <sid>` / `gact unarchive <sid>` flip
  session.archived. Round-trip CLI test.
- **II2.** `gact completion bash|zsh|fish` emits a shell completion
  script. CLI test for all three shells.

### Phase GG / HH — session lifecycle CLI
- **GG1.** `gact new [--title T] [--workspace WS_ID]` prints a fresh
  session id; pairs with `gact ask` for "create + ask" pipelines.
- **HH1.** `gact delete <sid>` cleans up scratch sessions.
- **HH2.** `gact rename <sid> <title>` PATCHes the session title.

### Phase EE — repo ergonomics
- **EE1.** Top-level `Makefile` with build/test/run/screenshots/help.

### Phase FF — q&a CLI
- **FF1.** `gact ask <sid> <q|->` — send + wait + print assistant
  reply text only (capture-friendly). CLI test.

### Phase CC — operator-tools fill-in
- **CC1.** `gact cancel <sid>`. CLI test.
- **CC2.** `gact run <sid> <text|->` combined send + wait. CLI test.

### Phase DD — docs + log
- **DD1.** README CLI subcommand table covering Phase T-CC.
- **DD2.** `gact log <sid>` dumps role-headered plain-text
  conversation; pairs with `gact run`. CLI test.

### Phase BB — scripting follow-ups
- **BB1.** `gact wait <sid>` polls status until idle. Pairs with
  `gact send` so shell pipelines can chain send → wait → list.

### Phase AA — scripting
- **AA1.** `gact send <sid> <text|->` posts a user message via
  CLI; stdin pipe supported through `-`. Full CLI test.

### Phase Y — body-focus cursor
- **Y1.** `n` / `N` move a per-message cursor in body focus; bold-
  green `▌` gutter marks the selection.
- **Y2.** `d` / `y` / `R` target the cursor when set (fall back to
  "latest" otherwise). Delete clamps cursor to new last-index.

### Phase W — session utilities
- **W1.** `/duplicate` clones current session's title/model/agent to
  a fresh session.

### Phase V — operator tools
- **V1.** `gact export --all -o DIR` bulk-exports every session as
  one JSON per session. CLI-level end-to-end test.
- **V2.** Header SSE health dot (green/amber/red) surfaces stream
  state at a glance. Screenshot 65.
- **V3.** `?search` jump marks the target message with a bold amber
  `▶` in the left gutter; clears on session switch.

### Phase T — terminal integration
- **T1.** OSC 2 window title reflects active session
  (`GACT — <title>`).
- **T2.** `gact list` subcommand — tab-separated session list for
  shell pipelines.
- **T3.** Emulator `--walk-files` flag serves real dir contents
  from each workspace's RootPath (opt-in; static demo list stays
  default).

### Phase U — tiny wins
- **U1.** `gact list --format json` machine-parseable output.
- **U2.** Window title appends `(running)` / `(waiting)` so tab
  switchers see what needs attention.

### Phase S — render polish
- **S1.** Body-focus `t` toggles per-message timestamps (faint-italic
  row under role headers; not persisted).
- **S2.** Ctrl+E now expands long assistant text in the paginated
  detail view, not just tool_result.

### Phase R — discoverability + diag
- **R1.** `gact diag` prints binary + contract version + runtime +
  config path + every config field + custom-theme status + GACT_* env
  vars for bug-report copy-paste.
- **R2.** Sidebar footer shows `N active · M archived`; order flips
  in the archived view so the primary number always matches the list.
- **R3.** `gact version` now surfaces git revision + `(dirty)` flag +
  commit time via `runtime/debug.ReadBuildInfo`.
- **R4.** `gact emit-config` prints a sample `config.json` with every
  field + defaults so users have a starting point to customise.

### Phase Q — polish round four
- **Q1.** README refreshed — theme gallery (screenshots 54-63), custom
  theme schema, Phase-M/N/O keymap updates, TUI implementation summary.
- **Q3.** Palette surfaces current state inline (`/clear · 4 messages`,
  `/theme · current: dracula`, `/cancel · status: running`).
  Screenshot 64.
- **Q4.** `/theme-export` serialises the active palette to
  `~/.config/gact/theme.json` — round-trip safe with LoadCustomTheme.

### Phase P — polish round three
- **P1.** Per-theme glamour StyleConfig (Document/Heading → Fg+Primary,
  Code → Warning on BgSubtle) — fixes the "assistant text almost
  invisible on solarized-light" readability issue.
- **P2.** Custom theme import from `~/.config/gact/theme.json` as
  `ModeCustom`. Screenshots 62/63.
- **P3.** Configurable cost-meter thresholds
  (`Theme.CostWarnTokens` / `CostDangerTokens`, config.json-persisted).
- **P4.** Collapse-hint upweights the `Ctrl+E` key pointer so users
  spot it at a glance.

### Phase O — themes (#8)
- **O1.** Dracula, Solarized (Dark + Light), Nord, Tokyo Night + fixed
  light (Gruvbox cream). Live preview on ↑/↓, persists via config.json,
  screenshots 54-59.
- **O2.** Glamour style picks per-palette (Dracula + Tokyo Night get
  their own glamour styles; light variants use glamour "light";
  everything else uses "dark"). `TestThemeRoundTrip` catches palette
  collisions on Bg+Fg identity.
- **O3.** `/theme` palette command opens Settings > Theme pre-selected
  on the current palette. `--list-themes` CLI flag prints every
  available name for discoverability before launching the TUI.

## This loop

All feedback filed as GitHub issues (#1-#7); all closed via `closes #N` in
commit messages. Every commit has tests + screenshots.

### Bugs (load-bearing, shipped first)
- **M1.** Footer clipped to viewport on long conversations — renderBody +
  clampLines, final-view clamp as belt-and-braces.
- **M2.** Shift+Enter / `\<Enter>` / Alt+Enter / Ctrl+J insert newline —
  textarea keymap rebinding + backslash-escape path.
- **M3.** Paste no longer fragments into multiple prompts — inPaste flag
  gating the Enter interceptor.
- **M8.** Slash commands actually execute — emulator's handleSessionCommand
  now wipes / cancels / emits assistant notes per command ID.

### Features from feedback
- **M4.** Compressed paste display `[pasted content #N: L lines]` with
  Ctrl+P expand. Enter auto-expands before sending.
- **M5.** Floating compose modal (Ctrl+G / Ctrl+Shift+P). Plain Enter inside
  inserts newline; Ctrl+S or Ctrl+Enter commits; Esc cancels.
- **M6.** @ file-reference fuzzy picker. Inserts `@path` + attaches file to
  session context (mode=read). Emulator file list expanded 3 → 17 entries
  for realistic fuzzy demos.
- **M7.** Scenarios help tab for post-first-message discoverability.
- **M9.** Tabbed help overlay (7 tabs after follow-up: Global / Sidebar /
  Conversation / Input / Permission / Scenarios / Commands; fits at 80x24).
- **M10.** Configurable tool-output collapse threshold (Settings > TUI,
  ◀/▶ stepper, default 5 per feedback).
- **L5.** Catalog-browser modal for /mcp /tools /skills; /agents routes
  into Settings > Agent.

### Polish (this round)
- **M11.** Input pane auto-grows with multi-line content (cap viewport/3).
- **M12.** @-picker fuzzy scoring with basename bonus + skip-match.
- **M13.** /new /rename /scenarios slash commands (jump straight to
  actions without leaving the palette).
- **M14.** Compose title shows line count; Ctrl+Enter alias for commit.
- **M15.** Transient hint auto-clears after 4s dwell (versioned so newer
  toasts don't get wiped by older ticks).
- **M16.** Toasts on /clear and /cancel for visible feedback.
- **M17.** /clear emits a zero cost.updated so the footer meter follows.

Screenshots 32-53 capture every new surface.

## TL;DR for morning-you

- **It works end-to-end.**
  ```
  cd emulator && go build -o ./emulator-server ./cmd/emulator-server
  cd ../tui   && go build -o ./gact .
  ./emulator/emulator-server --timing realistic &
  ./tui/gact
  ```
- **14 screenshots in `screenshots/`** show every state working: empty, sessions list, streaming, completed, permission banner, help, palette, palette filtered, permission allowed, in-TUI new-session flow, **markdown rendering** (13-), **textarea input** (14-).
- **Emulator: 21/21 Phase A endpoints**, race-clean, ≥75% coverage where it matters.
- **TUI: 12/12 Phase C tasks + Phase E polish** — palette, help overlay, permission action keys (a/d/s/w), cancel-run, sidebar new/delete (n/x), auto-reconnect on emulator restart, glamour markdown rendering, bubbles/textarea input.
- **Top-level README** has the quickstart + screenshot gallery + status table.
- 16 commits on main, all green.

## Done so far (chronological)

### Iteration 0 — handoff
- Surveys, contract, notes, skills, plan, scaffold, repo init.

### Iteration 1 — emulator A1-A4
- go.mod, server bootstrap, /v1/health, /v1/capabilities.

### Iteration 2 — emulator A5-A7
- in-memory store, workspaces CRUD, sessions CRUD + fork + cancel + export/import.

### Iteration 3 (this push, fast/manual) — A8-A12 + A21
- Messages endpoints (SPEC §6.3) — list / get / post 202 / delete / patch part / search.
- Event bus (in-process pub/sub with ring-buffer replay).
- SSE event streams (workspace + session scope, Last-Event-ID, heartbeat).
- Scenario engine — DefaultScript synthesises canonical SPEC §7.4 sequence
  (status→running, message+parts streaming, optional permission, completion).
- Permissions (SPEC §6.11).
- Cancellation (SPEC §6.2).

### Iteration 4 — emulator hardening
- Race detector found and **fixed a real bug** in events.Bus.Publish
  (close-vs-send window).
- End-to-end binary tests (cmd/emulator-server/e2e_test.go).
- Permissions store + handler tests.
- Workspace SSE filter test, Last-Event-ID resume test.
- AppendPart store test.
- Coverage: events 87.3 / scenario 82.2 / server 79.9 / store 90.3.

### Iteration 5 — emulator A13-A20
- Providers + models, tools, MCP server stubs, agents (write→501),
  files/context/repo_map, diffs (apply/reject/undo), commands, metrics.
- Catalog test file covers every endpoint.

### Iteration 6 — TUI C1-C9
- go.work + `tui/go.mod` + bubbletea/lipgloss/bubbles v2 wired.
- Typed client (`internal/client/client.go`) for every endpoint.
- SSE consumer (`sse.go`) with Last-Event-ID resume support.
- Client integration test that boots the emulator binary and exercises
  the full streaming + permission flow.
- Bubbletea app: connecting → ready → error stages, sidebar/body/input
  layout, role-coloured message rendering with thinking + tool_call +
  tool_result + file_diff + error parts, sticky-bottom scroll.
- AltScreen + bg/fg colour. **Bug fix mid-iteration:** session.status_changed
  was reading e.Payload["status"] but the SSE shape nests under
  `payload`, so status badge stayed "idle". Fixed.
- **Bug fix:** tool_call input wasn't rendering — added applyPartCompleted
  to parse accumulated raw_input JSON into Part.Input on completed.
- 4 screenshots (01-initial, 02-streaming, 03-completed, 04-permission)
  prove the flow.

### Iteration 7 — TUI C10b/C11/C12
- Permission action keys (a/d/s/w) calling RespondPermission.
- Slash command palette (`/` opens; type to filter; Enter to run).
- Help overlay (`?`).
- Cancel running scenario (Ctrl+x).
- Modal layering via simple line-grid `overlay()` compositor.
- Added `RunCommand` to client.
- 5 more screenshots (05-help, 06-palette, 07-palette-filter,
  08-permission-banner, 09-after-allow).

### Iteration 8 — README
- Top-level README with screenshot gallery, quickstart, key table,
  status table, project layout, testing, visual workflow link.

### Iteration 9 — Phase D goldens
- 9 view-state golden tests under `tui/internal/ui/testdata/`.
- Direct-state approach (bypasses tea.NewProgram) so deterministic.
- Volatile clock masked to `HH:MM:SSZ`.
- `-update` flag regenerates.

### Iteration 10 — Phase E polish
- Sidebar 'n' creates new session, 'x' deletes. Ctrl+n works anywhere.
- Ctrl+r refreshes capabilities + sessions.
- SSE auto-reconnect: 750ms debounce after sseClosedMsg, then reopen.
  Survives emulator restart without permanent error.
- Empty-state polish: sidebar shows 'n to create' hint; conversation
  pane shows sidebar crib + suggested prompts.
- Help overlay updated with Ctrl+n/Ctrl+r/n/x rows.
- 3 new screenshots (10-empty, 11-after-new, 12-streamed) verify the
  in-TUI new-session flow end-to-end.

### Iteration 11 — glamour markdown
- Assistant text parts go through glamour TermRenderer (cached per width).
  Bold, inline code (pink highlight), bullet lists all render properly.
- Scenario's final assistant message enriched with markdown so the
  rendering shows off in 13-markdown.png.

### Iteration 12 — bubbles/textarea + footer cleanup
- Replaced custom inputBuf with charm.land/bubbles/v2/textarea.
  Multi-line via Shift+Enter, paste, arrows, etc. all work properly.
- Removed cursorOn/blinkCmd — textarea has its own cursor.
- Removed second-precision UTC clock from footer — was forcing
  unnecessary re-renders.
- 14-textarea.png shows the cleaner input pane.

### Iteration 13 — C19 subagent flow
- Emulator: trigger words "split", "with help", "subagent" route
  through new `runSubagentScript` (subagent_script.go). Spawns a child
  session with parent_session_id + spawned_by_message_id, runs a brief
  scripted assistant turn in the subsession, emits subagent.started
  and subagent.completed events, attaches subagent_call/subagent_result
  parts to the parent message, then continues the parent's turn.
- TUI: render subagent_call (▼ marker, prompt, subsession id) and
  subagent_result (▲ marker, summary). Sidebar shows subsessions
  indented with `└` and dimmed-italic title. SSE handlers for
  subagent.started/.completed flag pendingSidebarRefresh, processed
  on the next sseEventMsg cycle to reload the sessions list.
- Bug fix: sessionsRefreshedMsg used to reset selected to 0 — now
  preserves the current session ID across refreshes.
- 15-subagent-parent shows parent view with both sub parts; 16-subagent-
  sidebar shows the subsession selected via the sidebar.
- Race-clean across both modules.

## In progress
- Phase D — golden tests for TUI states.

## Blockers
- None.

## Decisions made (not in SPEC)
- **stdlib net/http only** for emulator routing (no chi/gorilla).
- **Two modules in one repo** + `go.work` for sharing pkg/gact.
- **Single mutex per Store** instead of per-resource.
- **Strict request bodies** (DisallowUnknownFields). Vendor extensions
  go in metadata or under `/v1/ext/...`.
- **Derived session fields are store-managed** (MessageCount/Tokens/
  Cost reset on Create; AppendMessage increments).
- **Bus fan-out under read-lock** for the whole loop — eliminates
  send-on-closed-channel race with Cancel. Trade-off: Cancel is
  serialised behind active publishes (rare; trivial cost).
- **TUI input is a plain string buffer** for now (not bubbles/textarea).
  Sufficient for single-line; swap if multi-line composition matters.
- **Modal compositor is line-grid + space prefix.** Simple but doesn't
  preserve underlying ANSI past the modal column. Acceptable since
  modals are opaque on the inside.
- **Permission action keys take precedence over focus.** Prevents
  the user from typing 'a' into the input box while a scenario waits.

## Notes for next session

If you want to push further, the highest-value next steps:

1. Phase D — golden tests for empty/streaming/permission/palette/help.
   Template in `.claude/skills/tui-test.md`. ~30 min.
2. Phase E5 — connection resilience: when emulator dies and comes back,
   the TUI should reconnect SSE and re-fetch capabilities without crashing.
3. Phase F1 — write a Crush adapter so the TUI drives a real Crush
   backend. This validates the contract against an existing
   implementation. ~1 hour because Crush's protocol is similar in
   shape but not identical.

If you want to test it yourself:
```sh
cd emulator && go build -o ./emulator-server ./cmd/emulator-server
cd ../tui   && go build -o ./gact .
./emulator/emulator-server --port 7777 --timing realistic &
./tui/gact
# Type something. Try "delete the temp dir" to trigger permission.
```

## Iteration log
| # | Time (UTC) | Tasks | Commits |
|---|---|---|---|
| 0 | 2026-04-18T04:45 | Handoff scaffold | b4487f1 |
| 1 | 2026-04-18T04:50 | A1-A4 | f9b1fd8 ecab7e7 |
| 2 | 2026-04-18T05:08 | A5-A7 | 80036e7 e285f68 9e4fb37 |
| 3 | 2026-04-18T05:24 | A8-A12 + A21 | acf95be |
| 4 | 2026-04-18T05:30 | hardening (race + e2e + gaps) | e4d1a2f |
| 5 | 2026-04-18T05:36 | A13-A20 (catalog) | e33e576 |
| 6 | 2026-04-18T05:42 | TUI C1-C10 | 8cca3f5 |
| 7 | 2026-04-18T05:48 | TUI C10b+C11+C12 | d459a2e |
| 8 | 2026-04-18T05:50 | top-level README | f9566bf |
| 9 | 2026-04-18T05:53 | Phase D goldens (9 states) | ae2ca54 |
| 10 | 2026-04-18T05:55 | Phase E polish + reconnect + new-session | 8a1b80f |
| 11 | 2026-04-18T05:58 | glamour markdown for assistant text | a787b1a |
| 12 | 2026-04-18T06:01 | bubbles/textarea + footer cleanup | 8609e67 |
| 13 | 2026-04-18T06:08 | C19 subagent flow + sidebar indent | abd11cf |
| 14 | 2026-04-18T06:18 | C15 settings modal (model/agent picker) | af9da9b |
| 15 | 2026-04-18T06:25 | C16 context panel (CONTEXT sidebar section) | 6e041e8 |
| 16 | 2026-04-18T06:33 | C17 diff viewer apply/reject (a/r on body) | 0fd34bb |
| 17 | 2026-04-18T06:38 | C18 cost meter — emulator emits + footer renders | 6a9e902 |
| 18 | 2026-04-18T06:46 | E3 light theme + --theme flag | e1eacc4 |
| 19 | 2026-04-18T06:55 | E3b glamour theme; F2 config file | ef209ba c7a3556 |
| 20 | 2026-04-18T07:05 | UX QA fixes (sidebar scroll, header truncation, paste, empty callout) | abb6d01 |
| 21 | 2026-04-18T08:05 | E1 blocked; F3 export/import CLI + tests | 569d07d 4785052 |
| 22 | 2026-04-18T08:30 | Metrics modal (Ctrl+T) — wired to /v1/metrics | 65ee662 |
| 23 | 2026-04-18T08:50 | E1 unblocked; default model; cost charges all turns | 89176b4 739c41a a847d85 |
| 24 | 2026-04-18T09:15 | F1 OpenCode adapter scaffold + tests + README | 7dde94f |
| 25 | 2026-04-18T09:30 | F4 voice; PLAN core complete | 2095fc6 |
| 26 | 2026-04-18T09:42 | gact version; G6 cost test; Phase G defined | 32c4a3e |
| 27 | 2026-04-18T09:55 | G1+G3 — adapter list+post messages | ab6267d |
| 28 | 2026-04-18T10:08 | G2 — adapter SSE proxy with event translation | 2516904 |
| 29 | 2026-04-18T10:25 | G4 — Crush adapter scaffold (workspaces+sessions, mocked tests) | 34e1340 |
| 30 | 2026-04-18T10:38 | G5 — voice mic capture wrapper (--voice-cmd + scripts/voice-record.sh) | 0354113 |
| 31 | 2026-04-18T10:55 | G7 — sidebar g/G + PgUp/PgDn (Ctrl+u/d) for many-session lists | 502ef5e |
| 32 | 2026-04-18T11:18 | G8 — search UI in palette (`?<query>` Enter→submit, Enter→jump) | a5b5201 |
| 33 | 2026-04-18T11:35 | G10 — per-route p50/p95 latencies in /v1/metrics + TUI modal | 6ba8abb |
| 34 | 2026-04-18T11:50 | G9 — Ctrl+L hot-reloads theme + voice cmd from config.json | 79639a1 |
| 35 | 2026-04-18T12:10 | H1 — Crush adapter messages list (parts incl. unknown forward-compat) | 04d8c24 |
| 36 | 2026-04-18T12:35 | H2 — Crush adapter SSE proxy + per-session filter + event translation | db502c9 |
| 37 | 2026-04-18T12:55 | H3 — Crush adapter POST messages (parts → flat prompt + attachments) | 3ade8d4 |
| 38 | 2026-04-18T13:15 | I1 — GitHub Actions CI (test/vet/build matrix) + vet-found bug fixes | 866df27 |
| 39 | 2026-04-18T13:35 | fix: real race in scenario tests (event-payload vs store query); CI green | 3540251 |
| 40 | 2026-04-18T14:00 | I2 — adapter conformance suite (contract/conformance/) + CI wiring | f3bfe1a |
| 41 | 2026-04-18T14:20 | I3 — OpenCode + Crush adapters run conformance against mocked upstreams | 07f8db8 |
| 42 | 2026-04-18T14:50 | J1 — workspace switcher modal (Ctrl+W) + ANSI-truncate bug fix + screenshot | dbafeb5 |
| 43 | 2026-04-18T15:05 | J2 — SSE exponential backoff (250ms→30s + ±25% jitter + reset on event) | 9b1a5ec |
| 44 | 2026-04-18T15:20 | J3 — auto-retry connect + Ctrl+R instant retry from StageError | 3e717b0 |
| 45 | 2026-04-18T15:40 | J4 — SSE Last-Event-ID resume (track highest SeqID; reset on selectSession) | ee3c246 |
| 46 | 2026-04-18T15:55 | J5 — preserve in-flight message on post failure (restore text + hint) | 781ba40 |
| 47 | 2026-04-18T16:10 | J6 — auto-rename session from first user message (silent on PATCH fail) | e969d30 |
| 48 | 2026-04-18T16:25 | K1 — Crush adapter --upstream unix:/// socket transport + SSE-aware dialer | 2f3e5e2 |
| 49 | 2026-04-18T16:45 | K2 — manual session rename from sidebar (`e` → inline editor) + screenshot | 7218048 |
| 50 | 2026-04-18T17:00 | K3 — emulator --seed-workspaces flag (multi-ws demos without curl) | 9dfa3ff |
| 51 | 2026-04-18T17:20 | K4 — sidebar status dots + header spinner + session_id bug fix | 093ac35 |
| 52 | 2026-04-18T17:35 | K5 — two-step delete confirmation (arm/commit/cancel-on-any-key) | b2c94f1 |
| 53 | 2026-04-18T17:55 | K6 — per-session input history (↑/↓ recall, draft preserved) | f87378d |
| 54 | 2026-04-18T18:10 | K7 — emulator --seed-sessions flag (parallel to K3) | 70fed59 |
| 55 | 2026-04-18T18:25 | K8 — session archive via `A` (PATCH archived=true + sidebar removal) | 883a834 |
| 56 | 2026-04-18T18:45 | K9 — archived view toggle (`h`) + un-archive via `A` in that view | 20afd26 |
| 57 | 2026-04-18T19:00 | K10 — `y` copies last assistant message to clipboard (atotto) | 88c6253 |
| 58 | 2026-04-18T19:20 | K11 — sidebar `/` session title filter (nav skips hidden) | 18cb890 |
| 59 | 2026-04-18T19:40 | K12 — emulator --seed-messages flag (completes seeding trio) | f9c9389 |
| 60 | 2026-04-18T19:55 | K13 — body `R` retries last user message | cce02f3 |
| 61 | 2026-04-18T20:15 | K14 — context files add from TUI (`o` in sidebar) + screenshot | bb66e69 |
| 62 | 2026-04-18T20:30 | K15 — footer tokens: human-readable + threshold colours (100K/150K) | 7d3e64c |
| 63 | 2026-04-18T20:40 | K16 — SSE "(reconnecting…)" footer indicator during backoff | 94f7948 |
| 64 | 2026-04-18T20:50 | K17 — deterministic seeded session IDs + Phase L UX feedback queued | bec3466 |
| 65 | 2026-04-18T21:15 | L1 — richer scenario (long reply / big tool output / multi-tool) + crib | a7fe775 |
| 66 | 2026-04-18T21:45 | L2 — floating modal overlays (ANSI-aware splice + shared modalWidth) | 70d83bc |
| 67 | 2026-04-18T22:10 | L4 — Claude-Code-style tool_call/result demarcation + screenshot | e57eb09 |
| 68 | 2026-04-18T22:30 | L4-polish — nest tool_result under assistant call (hide TOOL banner) | d2206a1 |
| 69 | 2026-04-18T22:50 | L7 — help overlay grouped by pane (fixes discoverability) + screenshot | e01bf92 |
| 70 | 2026-04-18T23:15 | L3 — bulky tool_result collapse + Ctrl+E floating detail view + 3 screenshots | e53e035 |
| 71 | 2026-04-18T23:40 | L6 — settings Theme + TUI tabs + live theme swap + 2 screenshots | b3d3b15 |
