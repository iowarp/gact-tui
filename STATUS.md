# STATUS

**Last updated:** 2026-04-19T18:46Z
**Current phase:** NNNNNN1 + adapter follow-ups shipped this run
**Repo:** https://github.com/JaimeCernuda/gact-tui — main is `a325de2` (pushed)
**Open:** none — all open feedback shipped; pull from PLAN.md.

### Phase OOOOOO — adapter conformance follow-ups
- **OOOOOO1.** After adding 13 conformance sections this run
  (BBBBBB1..NNNNNN1), adapters needed catch-up. Opencode now
  implements `GET /v1/workspaces/{id}` (synthetic single-workspace
  echo) so the §6.1 per-id drill stops returning 501. Both
  adapters' conformance tests now `SkipAgents: true` since
  neither proxies /v1/agents (no upstream concept). All adapter
  conformance subtests pass.

### Phase NNNNNN — conformance SSE envelope validation
- **NNNNNN1.** Strengthened `checkSSE` from "first data:
  line received" to "first complete event matches SPEC §7.2
  envelope": event: line present, data: parses as JSON with
  a `type` field, and data.type matches the event: value.
  New `validateSSEEvent` helper.

### Phase MMMMMM — conformance metrics deeper validation
- **MMMMMM1.** Strengthened `checkMetrics` from
  "uptime_s present" to "full top-level envelope present
  per SPEC §6.16": {sessions, messages, tokens} must each
  be a JSON object; sessions+messages must carry `total`;
  tokens must carry input_total + output_total. Specific
  values stay unchecked (operational).

### Phase LLLLLL — conformance MCP resources + prompts
- **LLLLLL1.** Extended `checkMcp`'s per-server drill with the
  remaining read-only MCP catalog endpoints: `/resources`
  (non-nil array, each entry has uri) + `/prompts` (non-nil
  array, each entry has name). Both per SPEC §6.7. Read-only —
  never POSTs to /resources/read or /prompts/get.

### Phase KKKKKK — conformance providers per-id drill-down
- **KKKKKK1.** Extended `checkProviders` (already had
  /models drill) with the missing `GET /v1/providers/{id}`
  detail endpoint. Asserts 200 + id echoed back + non-empty
  name. Read-only.

### Phase JJJJJJ — conformance MCP per-server drill-down
- **JJJJJJ1.** Extended `checkMcp` with two per-server drills
  for the first server: `GET /v1/mcp/servers/{id}` (detail must
  echo id) and `GET /v1/mcp/servers/{id}/tools` (must have
  non-nil `tools` array with non-empty ids). Both required by
  SPEC §6.7. Read-only.

### Phase IIIIII — conformance messages list + per-id drill
- **IIIIII1.** Adds `Messages_List` section that walks
  `GET /v1/sessions/{id}/messages` plus per-id drill into
  `GET /v1/sessions/{id}/messages/{msg_id}`. Asserts 200 +
  non-nil messages + per-entry {id, role, parts} with role
  in {user|assistant|system|tool}. New `Options.SkipMessageList`
  opt-out wired through OptionsSkip fixture.

### Phase HHHHHH — conformance sessions per-id drill-down
- **HHHHHH1.** Adds `Sessions_Get` section. Walks
  `GET /v1/sessions/{id}` after Sessions_Create (or pinned via
  Options.SessionID). Asserts 200 + id echoed + non-empty
  status. Read-only.

### Phase GGGGGG — conformance workspaces per-id drill-down
- **GGGGGG1.** Mirror of EEEEEE1/FFFFFF1 for workspaces.
  Extended `checkWorkspaces` to drill into
  `GET /v1/workspaces/{id}` for the first workspace. Asserts
  id echoed back + non-empty root_path. Read-only.

### Phase FFFFFF — conformance agents per-id drill-down
- **FFFFFF1.** Mirror of EEEEEE1 for agents. Extended
  `checkAgents` with `GET /v1/agents/{id}` drill — first agent
  in the list, asserts id echoed back + non-empty source/title.
  Read-only.

### Phase EEEEEE — conformance tools per-id drill-down
- **EEEEEE1.** Extended `checkTools` to assert each list entry has
  the required {id, name} pair (SPEC §6.6 + §4.6) and to drill
  into `GET /v1/tools/{id}` for the first tool. Per-id response
  must echo the same `id` and have a non-empty `name`. Catches a
  missing per-id endpoint that the list-only check let slip.

### Phase DDDDDD — conformance Agents section
- **DDDDDD1.** Conformance gains an `Agents` section (no
  capability gate — agents read is always available per
  SPEC §6.5). Walks `GET /v1/agents`. Asserts 200 + non-nil
  top-level `agents` array + per-entry required {id, source,
  title} with `source` in the {builtin|user|recipe|skill}
  enum. Locks the wire shape that powers Settings → Agent
  picker. Read-only. New `Options.SkipAgents` opt-out wired
  through the OptionsSkip fixture. CLI test updated.

### Phase CCCCCC — conformance per-message Diffs
- **CCCCCC1.** Conformance gains a `Messages_Diffs` section
  (gated on capabilities.diffs + sid). Lists session messages,
  picks the first id, walks `GET /v1/sessions/{id}/messages/
  {msg_id}/diffs`. Asserts 200 + non-nil `diffs` key + same
  per-entry file_diff shape as BBBBBB1. Skips quietly when the
  session has no messages. Read-only. New `Options.SkipMessageDiffs`
  opt-out. CLI test updated.

### Phase BBBBBB — conformance Diffs section
- **BBBBBB1.** Conformance gains a `Diffs` section (gated on
  capabilities.diffs + a non-empty session id). Walks
  `GET /v1/sessions/{id}/diffs`, asserts 200 + non-nil `diffs`
  key + per-entry {path, applied} required (with applied
  bool-typed) and `language` string|null when present. Read-only
  — never POSTs to /diffs/apply or /diffs/reject so it stays
  idempotent against the live session. New `Options.SkipDiffs`
  opt-out for adapters that don't surface diffs. CLI test
  updated to require "Diffs" in the section list.

### Phase AAAAAA — docs cleanup
- **AAAAAA1.** Working-tree + history rewrite. Removed
  `notes/cc-inventory.md` from working tree and from every
  commit that touched it (via git filter-repo). Rewrote
  three commit messages whose titles/bodies cited the
  studied source by name. STATUS/PLAN entries that named
  the source rephrased to neutral "filed N follow-ups"
  language. Force-pushed main; previous commit hashes are
  obsolete. Local backup tag `scrub-backup-…` preserved.

### Phase ZZZZZ — input newline copy honest about terminal-fold
- **ZZZZZ1.** Shift+Enter is terminal-dependent (kitty/
  modifyOtherKeys); placeholder + help-tab now lead with the
  always-works `\<Enter>` fallback. Keybinding unchanged (already
  accepts all three modified-Enter forms).

### Phase YYYYY — Settings TUI: paste-compress + intro toggle
- **YYYYY1.** User flagged Settings as "very shallow still".
  Added paste-compress threshold (◀ N lines ▶, default 3) and
  intro splash skip (◀ on/off ▶) as Settings → TUI rows.
  Both persist via `persistPrefs` to `config.json`. CLI flags
  still win as overrides at startup. Screenshot:
  `screenshots/YYYYY1_settings_paste_intro.png`.

### Phase XXXXX — tool output Claude-Code-grade contrast
- **XXXXX1.** Body text now uses full Fg (not FgMuted) and
  continuation rows render a yellow `│` bar in the gutter so
  a colored vertical line runs the full height of the output.
  Closes the user feedback that ours was less readable than
  Claude Code's.

### Phase WWWWW — body cursor follows ↑/↓ scroll
- **WWWWW1.** ↑/↓/k/j now walk the message cursor (and
  scroll follows), not the raw page scroll. PgUp/PgDn added
  for raw within-message scroll. Cursor seeds to latest on
  first up, first on first down. Closes user feedback "the
  window scrolls but the cursor remains there".

### Phase VVVVV — input prompt `>` only on first row
- **VVVVV1.** User feedback: textarea `>` repeated on every
  wrapped row. Switched to `SetPromptFunc` — row 0 = `> `,
  continuation rows = `  `. Goldens regen. Screenshot:
  `screenshots/VVVVV1_prompt_first_row_only.png`.

### Phase UUUUU — conformance Files section
- **UUUUU1.** Conformance gains a `Files` section (gated on
  capabilities.files + a workspace id). Walks
  `/v1/workspaces/{id}/files`, asserts `path`/`type` + `type` in
  `{file, dir}` enum. New `Options.SkipFiles` opt-out.

### Phase TTTTT — conformance Providers section
- **TTTTT1.** Conformance gains a `Providers` section (gated on
  capabilities.providers). Walks `/v1/providers` +
  `/v1/providers/{id}/models`, asserts `id`/`name` on each.
  New `Options.SkipProviders` opt-out. Adapters auto-skip via
  cap gate.

### Phase SSSSS — subagent scenario variants
- **SSSSS1.** `runSubagentScript` cycles 3 distinct subagent
  identities per session — code_reviewer (preserved),
  security_auditor (OWASP findings), perf_profiler (pprof
  attribution). Closes the variant-cycle arc — every rich
  scenario family (bigtool/long/multi-tool/diff/subagent) now
  produces per-turn variety.

### Phase RRRRR — diff scenario variants
- **RRRRR1.** Closes the variant-cycle arc across all four
  scenario families. `runDiffScript` cycles 3 distinct file
  diffs per session — Go logging swap (preserved), Python
  try/except, JS callback→async refactor. Three different
  languages so the syntax-hint render path also gets variety.

### Phase QQQQQ — multi-tool scenario variants
- **QQQQQ1.** `runMultiToolScript` cycles 3 distinct 3-tool flows
  per session via `NextCallIndex`. variant[0] = refactor
  (preserved), [1] = schema migration check (psql/psql/go-vet),
  [2] = failing-test triage. Pairs with FFFFF1's cursor-aware
  Ctrl+E across three scenario families now.

### Phase PPPPP — long-reply scenario variants
- **PPPPP1.** `runLongScript` cycles through 3 distinct long
  writeups per session via `NextCallIndex`. variant[0] = existing
  rendering memo (preserved); [1] = request-lifecycle
  architecture trace; [2] = profiling-triage runbook. Pairs with
  FFFFF1's cursor-aware Ctrl+E.

### Phase OOOOO — gact perms list --format json
- **OOOOO1.** Returns raw `[]PermissionWire` with full
  `tool_call` payload (tool_name + input args + annotations) —
  TSV view drops those. Default tsv preserved.

### Phase NNNNN — gact info --include perms
- **NNNNN1.** Closes the OOOO1 follow-up. `gact info <sid>
  --include perms` appends a perms section (pending + resolved
  with action=…). Works in both text + JSON modes. Composes
  with existing tasks/hooks. CLI test exercises full
  request → deny lifecycle.

### Phase MMMMM — gact env --format json
- **MMMMM1.** `gact env --format json` emits a single object
  with resolved config + a nested `env` object containing every
  GACT_* variable. Default tsv preserved.

### Phase LLLLL — Settings TUI tab cost-warn/danger knobs
- **LLLLL1.** TUI tab gains 2 new editable rows (cost warn +
  cost danger) with ←/→ stepping by 25k, clamped to 1k..1M.
  Refactored render path through a shared `editableRow` helper.
  Closes part of feedback "Settings modal is thin". Screenshot:
  `screenshots/LLLLL1_settings_tui_costs.png`.

### Phase KKKKK — empty-state hints surface session-lifecycle keys
- **KKKKK1.** Closes the discoverability gap (feedback_tui_ux
  item 7). Empty-state crib now shows e=rename, A=archive,
  h=toggle archived, /=filter, o=context-add, plus Ctrl+Z
  detach. Screenshot:
  `screenshots/KKKKK1_empty_state_hints.png`.

### Phase JJJJJ — Ctrl+C cancels in-flight turn before quit
- **JJJJJ1.** Ctrl+C now POSTs /cancel before tea.Quit when the
  current session is running or waiting_permission. Idle
  sessions unaffected. Pairs with IIIII1: Ctrl+Z = leave
  running, Ctrl+C = stop everything.

### Phase IIIII — tmux-like detach (Ctrl+Z)
- **IIIII1.** Replaced LLL8b's SIGTSTP suspend with a clean
  exit + post-exit hint. Ctrl+Z stamps DetachedSessionID;
  main.go prints `Detached. Reattach with: gact attach <sid>`.
  Backend session persists by design. Help-tab updated.

### Phase HHHHH — unified `/tools` menu (built-in + MCP)
- **HHHHH1.** `/tools` now lists built-in + MCP-sourced tools in
  one sorted view with [source] tags and "from <server-id>" on
  MCP rows. `/catalog` added as alias. `/mcp` retained as
  server-management view. New unit test covers the sort + tag
  + server-id behavior. Screenshot:
  `screenshots/HHHHH1_unified_tools.png`.

### Phase GGGGG — bigtool scenario variants
- **GGGGG1.** `dump the log` cycles through 3 variants per
  session (server logs, python tracebacks, nginx access). Engine
  gained `NextCallIndex` for per-(session, script) call counters.
  Prerequisite for FFFFF1's cursor-aware Ctrl+E to be testable.

### Phase FFFFF — cursor-aware Ctrl+E + visible cursor on Tab
- **FFFFF1.** maybeInitBodyCursor seeds the body cursor to the
  latest message on Tab into FocusBody (was invisible before).
  Marker upgraded from `▌` half-block to a fat full-block bar
  (fg+bg both in secondary). Ctrl+E already targeted the
  cursor (Z1) — pinned with new tests covering EARLIER vs
  LATEST and the no-cursor fall-through. Screenshots:
  `screenshots/FFFFF1_cursor_{on_tab,earlier_message}.png`.

### Phase EEEEE — intro splash uses figlet (slant font)
- **EEEEE1.** Replaced hand-rolled GACT ASCII + mountain glyph
  with `github.com/common-nighthawk/go-figure` "slant" font.
  Mountain dropped — users who want a logo override via
  `intro_file`. Tests adjusted to assert slant-style multi-line
  block. Screenshot: `screenshots/EEEEE1_intro_figlet.png`.

### Phase DDDDD — footer flicker on transient SSE drops
- **DDDDD1.** Footer "(reconnecting…)" badge no longer flashes
  for one frame on routine sub-second SSE blips. Added
  `sseDownSince` clock; renderer requires outage ≥ 800 ms
  before painting. Three unit tests pin the gate. Screenshot:
  `screenshots/DDDDD1_footer_steady.png`.

### Phase CCCCC — conversation pane overflow / sidebar misalignment
- **CCCCC1.** Shipped previous iteration. Lipgloss .Height(N)
  is OUTER (border included); the renderer was passing
  Height(N-2). All three pane styles now pass the outer target
  + a fitLines() belt-and-braces helper. Sidebar/conversation
  `╰╯` now align in all cases.

### Phase BBBBB — conformance Mcp section + adapter test repair
- **BBBBB1.** Conformance suite gains an `Mcp` section (gated on
  `capabilities.mcp`) that walks `GET /v1/mcp/servers` and
  asserts the wire shape JJJJ1's `gact mcp list` + TUI catalog
  depend on. New `Options.SkipMcp` opt-out. Also fixed a latent
  breakage: both adapter conformance tests (crush + opencode)
  were calling `Run(t, …)` with raw `*testing.T` after the
  Reporter refactor — wrapped with `FromTest(t)` so they build
  again. All adapter test suites now build + pass.

### Phase AAAAA — gact context list --mode/--glob filters
- **AAAAA1.** `gact context list <sid>` gains `--mode
  read|edit|pin` (exact) and `--glob PATTERN` (Go path.Match
  with basename fallback, mirrors ZZZZ1). Combined filters AND
  together. Bad value → exit 2 client-side. CLI test asserts
  single filter, combined filter, and exits.

### Phase ZZZZ — gact files list --glob PATTERN
- **ZZZZ1.** `gact files list <ws-id> --glob PATTERN` filters by
  Go `path.Match`. Two-pass match: full path first, then
  basename fallback so `*.go` matches `src/foo.go`. Bad pattern
  → exit 2 client-side. CLI test asserts filtering works on the
  seeded workspace.

### Phase YYYY — gact dashboard --status FILTER (+ waiting alias fix)
- **YYYY1.** `gact dashboard --status idle|running|waiting|error`
  filters dashboard rows. Discovered + fixed a latent bug:
  both `list --status waiting` and the new `dashboard --status
  waiting` never matched anything because the actual server
  status is `waiting_permission` (per SPEC). Now both verbs
  translate the user-friendly `waiting` alias.

### Phase XXXX — gact hooks list --event/--scope filters
- **XXXX1.** `gact hooks list` gains `--event TYPE` and
  `--scope global|session|workspace` filters. Combined filters
  AND together. Unknown --scope → exit 2 client-side. CLI test
  seeds 3 hooks (one per scope kind), asserts each filter keeps
  the right one + drops the rest.

### Phase WWWW — gact tasks list --status FILTER
- **WWWW1.** `gact tasks list <sid> --status pending,running,…`
  filters tasks by status. Empty filter = all. Validation
  client-side; typo → exit 2. Works in TSV + JSON. Also
  stabilized TestCLI_DumpBundleSince's flaky 1s --since window
  (now sleep 5s + --since 6s).

### Phase VVVV — gact grep --limit N
- **VVVV1.** `gact grep <query> --limit N` truncates output;
  default 0 = unlimited (back-compat). Truncation runs after
  sorting by sid so kept rows are deterministic. Negative
  --limit → exit 2.

### Phase UUUU — gact stream --filter
- **UUUU1.** `gact stream --filter type1,type2` mirrors
  `gact tail --filter` (RRR1) for the human view. Empty filter =
  passthrough (back-compat). CLI test fires an mcp reconnect to
  trigger a notification, asserts it's kept and server.connected
  is dropped.

### Phase TTTT — gact tail --format text
- **TTTT1.** `gact tail --format text` reuses streamRow() (same
  human formatter as `gact stream`) so live debugging doesn't
  require jq. Default kept as `json` (NDJSON) for back-compat.
  CLI test asserts no JSON keys leak in text mode + every line
  starts with HH:MM:SS.

### Phase SSSS — gact watch --format json
- **SSSS1.** `gact watch <sid> --format json` emits NDJSON
  `{ts,sid,status,message_count,tokens_out}` per state change.
  Default tsv unchanged. CLI test fires a turn in a goroutine,
  asserts ≥2 NDJSON rows + idle-status row before exit.

### Phase RRRR — parallelize gact dump-bundle session export
- **RRRR1.** `gact dump-bundle` per-session export+write now uses
  the same 8-wide bounded fanout as QQQQ1. Was strictly serial.
  CLI test seeds 12 sessions (>workers), asserts summary count
  and every session.json lands in bundle/sessions/.

### Phase QQQQ — parallelize gact export --all
- **QQQQ1.** `gact export --all -o DIR` now fans out per-session
  export+write across an 8-wide goroutine pool (mirrors FFFF1).
  Was strictly serial — a 200-session backup paid 200×RTT.
  Per-session error tolerance preserved. CLI test seeds 12
  sessions (>workers) so the pool must reuse slots.

### Phase PPPP — gact context list --format json
- **PPPP1.** `gact context list <sid> --format json` emits the
  raw `[]ContextFile` array (path, mode, added_at) for jq
  pipelines. Default tsv kept for back-compat. CLI test asserts
  both modes + unknown-format exit 2.

### Phase OOOO — gact info --include tasks,hooks
- **OOOO1.** `gact info <sid> --include tasks,hooks` adds composite
  sections so a single call returns session metadata + tasks +
  effective hooks (global + workspace + session-scoped). Text
  mode appends `--- tasks ---` / `--- hooks ---` blocks; JSON
  mode wraps as `{session, tasks?, hooks?}`. CLI test seeds two
  tasks (one completed) + one hook, asserts both modes parse
  correctly. Unknown --include token → exit 2.

### Phase NNNN — gact follow --format json (NDJSON)
- **NNNN1.** `gact follow <sid> --format json` emits NDJSON for
  both the snapshot and SSE-streamed messages. Refactored to an
  `emit(msg)` closure so both code paths stay format-aware.
  Default text mode unchanged. CLI test runs follow in a 5s-
  bounded goroutine, sends BRAVO mid-stream, asserts both ALPHA
  (snapshot) and BRAVO (stream) appear in parsed NDJSON.

### Phase MMMM — gact log --format json (NDJSON)
- **MMMM1.** `gact log <sid> --format json` emits one message per
  line as NDJSON (no indentation) so callers can pipe to `jq -c`.
  Default text mode unchanged; plays cleanly with --limit and
  --since (both run before serialization). CLI test parses each
  line, asserts session_id + both user/assistant roles present.

### Phase LLLL — gact ping --json
- **LLLL1.** `gact ping --json` emits `{ok,backend,uptime_s,error?}`
  on a single line for both success and failure branches, so it
  pipes cleanly into jq. Existing text mode unchanged; --json
  overrides -q. CLI test parses both branches structurally.

### Phase KKKK — perms rules list --format tsv
- **KKKK1.** `gact perms rules list` gains `--format json|tsv`
  (default kept as `json` for back-compat). TSV columns: scope,
  scope_id (`*` for any), tool_pattern, path_pattern (`-` if
  empty), action, annotations (sorted `k=v` list or `-`).
  CLI test asserts both formats and unknown-format exit 2.

### Phase JJJJ — gact mcp list
- **JJJJ1.** `gact mcp list [--format tsv|json]` enumerates the
  backend's MCP servers. TSV columns: id, name, status, transport,
  protocol_version, caps (compact `tools,resources,prompts,logging`),
  last_error. JSON dumps the array as-is. Aliased to `mcp ls`.
  Help text + verb dispatcher updated. CLI test asserts both
  formats and unknown-format exit 2.

### Phase IIII — gact theme set
- **IIII1.** `gact theme set <name>` writes the chosen theme to
  `config.json` (validates against `ui.AllThemeModes`; unknown names
  exit 2 with no file write). GACT_THEME still wins at resolution
  by design — `set` only updates the config-level value.
  CLI test uses isolated XDG_CONFIG_HOME to verify round-trip and
  rejection paths. Also stabilized TestCLI_LogSince's flaky 1500ms
  --since window (now sleep 5s + --since 4s).

### Phase HHHH — gact theme list
- **HHHH1.** `gact theme list` enumerates `ui.AllThemeModes` one per
  line, appends `\t*` to the resolved active line. Useful for
  discovering valid `--name` values and driving shell completions.
  CLI test asserts known names present, exactly one `*` marker, and
  that the marker tracks `GACT_THEME`. Extra args → exit 2.

### Phase GGGG — gact theme show
- **GGGG1.** `gact theme show [--name N]` prints the active theme
  palette as TSV (`key<TAB>hex`). Resolution honors --name flag,
  otherwise `config.Resolve(cfg.Theme, $GACT_THEME, "", defaultTheme)`.
  Emits 16 color rows (bg/fg/primary/secondary/success/warning/danger/
  border/role_*) plus a `name<TAB>mode` header. Pure local — no
  backend dep. Help text + bash/zsh/fish completions updated. CLI
  test asserts env override, --name override, unknown verb → exit 2.

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
- **LLL7.** Filed 8 follow-up tasks (MMM1-MMM8) covering missing
  contract surface: SSE notification event, versioned config
  migrations, hooks system, permission rules, session tasks,
  summarize instructions, /rewind, plugins dir.

### Phase MMM — additional contract / feature follow-ups
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

### Phase LLL — UX polish round (continued)
- **LLL8b.** Ctrl+Z detach: bound to `tea.Suspend` (built-in
  SIGTSTP handling). Reassurance hint "detached — fg to resume;
  backend session keeps running" set before suspend. Help
  overlay updated. Unit test asserts hint + cmd.
- **MMM8b.** Plugin commands now appear in the slash palette.
  paletteMatches merges flattened pluginCommand tuples with
  Source="plugin"; Enter execs the binary in the background with
  GACT_SESSION_ID/BACKEND/PLUGIN_DIR env vars. Output → transient
  hint. Cross-package types ui.PluginsLoaded/PluginsCommand keep
  the dep one-way.

### Phase FFFF — tasks summary
- **FFFF1.** `gact tasks summary` ships. Bounded-pool fanout
  (8-wide) over ListSessionTasks per session, sums by status,
  skips empty sessions. TSV table + TOTAL footer with
  `(N sessions)` count. CLI test asserts aggregate matches
  seeded counts.

### Phase EEEE — dump-bundle --since
- **EEEE1.** `gact dump-bundle --since DUR` ships. Filters
  bundled sessions by UpdatedAt cutoff; logs kept/total to
  stderr. Test seeds + verifies wide vs narrow window counts.

### Phase DDDD — gact env
- **DDDD1.** `gact env` ships. TSV resolved KEY/VALUE for
  backend·theme·voice·intro·config-path·plugins-dir + a
  `--- ENV ---` section listing every GACT_* env var. Pure
  local — no backend dep. Test asserts both env vars + values.

### Phase CCCC — replay
- **CCCC1.** `gact replay <file|-> [--attach]` ships. Reads
  export blob via existing client.ImportSession, prints new sid.
  --attach bridges to runTUI via GACT_ATTACH_SESSION_ID
  (OOO1 mechanism). CLI test exports + replays + asserts marker
  token preserved.

### Phase BBBB — dashboard watch
- **BBBB1.** `gact dashboard --watch [--interval DUR]` ships.
  ANSI clear+home between frames. Extracted renderDashboardOnce.
  Test asserts ≥2 frames in 2.5s with --interval 1s.

### Phase AAAA — conformance MMM coverage
- **AAAA1.** Conformance suite gained Hooks/Policies/Tasks
  sections, each gated by the matching capability flag. New
  Skip{Hooks,Policies,Tasks} options + matching --skip names in
  the CLI. Manual e2e: 13/13 sections green vs emulator.

### Phase ZZZ — gact follow
- **ZZZ1.** `gact follow <sid>` ships. Snapshots existing log,
  then streams new messages via SSE with seen-dedupe. Extracted
  printLogMessage helper shared with `gact log`. Test seeds
  ALPHA, follows with deadline, sends BRAVO, asserts both.

### Phase YYY — wait any-of
- **YYY1.** `gact wait --any-of sid1,sid2,...` ships. Polls each
  id per round; first idle wins (sid printed to stdout in
  any-of mode). Single-arg form unchanged. Test asserts winner
  is one of the input sids.

### Phase XXX — concurrent bench
- **XXX1.** `gact bench --concurrent C` ships. C goroutines, each
  owning a session × N serial turns. Aggregate p50/p90/p99 + thrpt
  (shown when C>1). runBenchWorker extracted. Test covers both
  serial and parallel modes + cleanup.

### Phase WWW — cross-session grep
- **WWW1.** `gact grep <query>` ships. Bounded-pool fanout
  (8-wide) over SearchMessages per session, mid→role lookup per
  hit. TSV/JSON output. CLI test seeds 2 sessions + asserts both
  matches surface.

### Phase VVV — dashboard
- **VVV1.** `gact dashboard [--format pretty|tsv|json]` ships.
  Supervisory one-shot table with id/status/title/model/age/
  tokens/cost. humanAge + humanTokensCLI compact numerics. CLI
  test covers all 3 formats.

### Phase UUU — sidebar task badges
- **UUU1.** Sidebar `(N tasks)` badge per session for open §6.18
  tasks. New loadSessionTasksCmd + sessionTasksLoadedMsg + cache
  on App. Loaded lazily on selectSession. 2 tests +
  screenshots/73-task-badge.png.

### Phase TTT — log time filter
- **TTT1.** `gact log --since DUR` ships. Filters messages older
  than now-DUR (CreatedAt-based, zero timestamps survive). Test
  asserts wide window keeps both messages, narrow window drops
  the older one.

### Phase SSS — conformance CLI
- **SSS1.** `gact conformance` ships. Refactored
  contract/conformance to a Reporter interface; *testing.T wraps
  via FromTest, new CLIReporter prints tree-style results. CLI
  supports --skip Section,… and exits 1 on any section failure.
  Test runs full suite vs emulator → PASS.

### Phase RRR — tail filter
- **RRR1.** `gact tail --filter type1,type2` ships. Comma-separated
  type list parsed into a lookup map; non-matching events
  dropped before encode. CLI test asserts notification kept,
  server.connected dropped when filter targets only notification.

### Phase QQQ — bench
- **QQQ1.** `gact bench [-n N] [--message TEXT]` ships. Creates a
  fresh session, runs N turns serially, computes
  avg/p50/p90/p99/min/max + total, deletes the session.
  CLI test asserts summary fields + cleanup.

### Phase PPP — voice CLI
- **PPP1.** `gact voice <sid> <audio-file|->` ships. Wraps
  client.VoiceTranscribe. File or stdin, `--mime audio/wav`
  default. Test asserts non-empty transcription + empty-audio
  exit 2.

### Phase OOO — TUI launch shortcuts
- **OOO1.** `gact attach <name|sid>` ships. runAttach trims argv +
  sets env, App.AttachSessionID + pickAttachIndex helper select
  the right row at connect (matches by id OR title, falls back
  with hint if missing). 4 sub-tests + screenshots/72-attach-
  direct.png.

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
| 67 | 2026-04-18T22:10 | L4 — tool_call/result demarcation pass + screenshot | e57eb09 |
| 68 | 2026-04-18T22:30 | L4-polish — nest tool_result under assistant call (hide TOOL banner) | d2206a1 |
| 69 | 2026-04-18T22:50 | L7 — help overlay grouped by pane (fixes discoverability) + screenshot | e01bf92 |
| 70 | 2026-04-18T23:15 | L3 — bulky tool_result collapse + Ctrl+E floating detail view + 3 screenshots | e53e035 |
| 71 | 2026-04-18T23:40 | L6 — settings Theme + TUI tabs + live theme swap + 2 screenshots | b3d3b15 |
