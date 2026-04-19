# PLAN — ordered task queue

Pick the **first unchecked item**. When done: check it, commit, push, move to the next. If blocked on a task, mark it `[BLOCKED: reason]`, append a follow-up task at the bottom, and pick the next unblocked item.

When picking, consider deps: emulator must exist before TUI can really test. Tasks marked `(parallel)` can be done before the prior one completes.

## Phase DDDDD — footer flicker on transient SSE drops

- [x] **DDDDD1.** "(reconnecting…)" badge in the footer no longer flashes for one frame on routine sub-second SSE blips. Added an `sseDownSince` clock (set when `sseBackoffAttempts` goes 0→positive, cleared on `sseEventMsg`); renderFooter now requires `time.Since(sseDownSince) >= 800ms` before painting the badge. Real outages still surface within a second; the typical 250 ms reconnect cycle stays silent. Three new unit tests pin the gate (visible past gate, hidden during sub-gate blip, hidden when down-clock is zero) plus the existing healthy/backoff cases. Screenshot: `screenshots/DDDDD1_footer_steady.png`.

## Phase CCCCC — conversation pane overflow / sidebar misalignment

- [x] **CCCCC1.** Shipped previous iteration. Lipgloss .Height(N) is OUTER (border included); the renderer was passing Height(N-2) treating it as inner content, leaving each bordered pane 2 rows short. Sidebar `╰╯` floated up while conversation `╰╯` stayed at full bodyH, breaking the bottom alignment. Fixed by passing the outer target straight to .Height on all three pane styles + a `fitLines()` belt-and-braces helper. Golden snapshots regenerated. Screenshots: `screenshots/CCCCC1_overflow_{before,after}_fix.png`.

## Phase BBBBB — conformance: Mcp section + adapter test repair

- [x] **BBBBB1.** Conformance suite gains an `Mcp` section (gated on `capabilities.mcp`) that walks `GET /v1/mcp/servers`: asserts 200, top-level `servers` array shape, and each server has the required `id`/`name`/`transport`/`status` fields with status in the enum (connecting|ready|error|disconnected). Locks the wire shape that JJJJ1's `gact mcp list` and the TUI catalog both depend on. New `Options.SkipMcp` opt-out preserves back-compat. Discovered + fixed a latent breakage along the way: both adapter conformance tests (crush + opencode) were calling `conformance.Run(t, ...)` with raw `*testing.T`, which broke when the suite was refactored to `Reporter`. Wrapped both calls with `conformance.FromTest(t)`. Confirmed the new section runs against the emulator (`gact conformance` shows `▶ Mcp ✓ Mcp PASS`) and TestCLI_Conformance now requires the new section name.

## Phase AAAAA — gact context list --mode/--glob filters

- [x] **AAAAA1.** `gact context list <sid>` gains two filters: `--mode read|edit|pin` (exact) and `--glob PATTERN` (Go path.Match with basename fallback, mirrors ZZZZ1). Both empty by default = no filter (back-compat). Combined filters AND together. Bad --mode or --glob → exit 2 client-side without hitting the backend. JSON returns `[]` not `null` after filtering. CLI test seeds 3 entries (read/pin/edit; .go and .md), asserts each filter narrows correctly + the combined case + bad-value exits.

## Phase ZZZZ — gact files list --glob PATTERN

- [x] **ZZZZ1.** `gact files list <ws-id> --glob PATTERN` filters workspace listings by Go `path.Match` pattern. Empty = no filter (back-compat). Two-pass match: full path first, then basename fallback so `*.go` matches `src/foo.go` (otherwise `*` wouldn't cross `/`). Bad pattern → exit 2 client-side without hitting the backend. JSON returns `[]` not `null` after filtering. CLI test seeds the default workspace, asserts `*.go` keeps Go files but drops `README.md`/`go.mod`, basename fallback works for `main.go`, and bad pattern exits 2.

## Phase YYYY — gact dashboard --status FILTER (+ list/dashboard waiting alias fix)

- [x] **YYYY1.** `gact dashboard --status idle|running|waiting|error` filters dashboard rows by status (single value or comma-separated set). Empty filter = all (back-compat). Fast-fail validation on typo (exit 2). Discovered + fixed a latent bug while implementing: `gact list --status waiting` and the new `gact dashboard --status waiting` never matched anything because the actual server status is `waiting_permission` (per SPEC). Now both verbs translate the user-friendly `waiting` alias to `waiting_permission`. CLI test seeds an idle session + a waiting one (via the `delete` permission scenario), asserts the filter keeps the waiting row + drops the idle one, then resolves perms and asserts both reappear under `--status idle`. Comma-list and unknown-status (exit 2) cases also covered.

## Phase XXXX — gact hooks list --event/--scope filters

- [x] **XXXX1.** `gact hooks list` gains two filters: `--event TYPE` (exact match; `*` matches the universal-hook entry) and `--scope global|session|workspace`. Both empty by default = no filter (back-compat). Combined filters AND together. Unknown --scope → exit 2 client-side. JSON mode returns `[]` not `null` after filtering. CLI test seeds three hooks (one in each scope kind), asserts each filter keeps the right one and drops the rest, plus a combined filter case.

## Phase WWWW — gact tasks list --status FILTER

- [x] **WWWW1.** `gact tasks list <sid> --status pending,running,…` filters tasks by status (single value or comma-separated set). Empty filter = all (back-compat). Validation runs client-side so a typo errors fast (exit 2) instead of returning a silently-empty set. Works in both TSV and JSON modes (JSON returns `[]` not `null` after filtering). CLI test seeds 3 tasks with different statuses, asserts single-value filter, comma-list filter, JSON shape after filter, and unknown status → exit 2.

## Phase VVVV — gact grep --limit N

- [x] **VVVV1.** `gact grep <query> --limit N` truncates the cross-session search output. Default 0 = unlimited (back-compat). Truncation runs AFTER sorting by sid so the kept rows are still the lexicographically-smallest sids (deterministic). Negative --limit → exit 2. CLI test seeds 4 sessions with the same marker, asserts no-limit returns ≥4 rows and `--limit 2` returns exactly 2.

## Phase UUUU — gact stream --filter (mirrors tail's RRR1)

- [x] **UUUU1.** `gact stream --filter type1,type2` drops events whose type isn't in the keep set, mirroring `gact tail --filter` (RRR1). Useful for live human debugging when message.part.delta floods drown out the interesting events. Empty filter = passthrough (back-compat). CLI test runs stream in --filter notification mode bounded by sleep+kill, fires an mcp reconnect to trigger a notification, asserts the notification row appears while server.connected does not.

## Phase TTTT — gact tail --format text

- [x] **TTTT1.** `gact tail --format text` reuses `streamRow()` (the same human-readable formatter `gact stream` uses) so live debugging doesn't require piping NDJSON through `jq`. Default kept as `json` (NDJSON) for back-compat with existing tooling. CLI test runs tail in --format text bounded by sleep+kill, asserts no JSON keys leak through, the `server.connected` row appears, and every line starts with an `HH:MM:SS` time field. Unknown format → exit 2.

## Phase SSSS — gact watch --format json (NDJSON state changes)

- [x] **SSSS1.** `gact watch <sid> --format json` emits one NDJSON record per state change: `{ts,sid,status,message_count,tokens_out}`. Default tsv unchanged. Same trigger logic (status flip OR msg/token-count delta). Idle-streak exit semantics preserved. CLI test fires a turn in a goroutine, runs watch in --format json, asserts ≥2 NDJSON rows, every line parses, sid is consistent, and an idle-status row appears before the run terminates. Unknown format → exit 2.

## Phase RRRR — parallelize gact dump-bundle session export

- [x] **RRRR1.** `gact dump-bundle` now uses the same 8-wide bounded fanout as `gact export --all` (QQQQ1) for the per-session export+write loop. Was strictly serial — bug-report bundles for instances with many sessions paid sessions×RTT in latency. The version.txt / diag.txt / metrics.json paths are untouched (single-shot, not in the hot path). Per-session error tolerance preserved (failures logged but don't abort). CLI test seeds 12 sessions (>workers) and asserts the summary count + every session.json lands.

## Phase QQQQ — parallelize gact export --all

- [x] **QQQQ1.** `gact export --all -o DIR` now fans out per-session export+write across a bounded worker pool (8-wide, mirroring FFFF1's tasks-summary fanout). Previous behavior was strictly serial — a 200-session backup paid 200×RTT in latency. The pool size is fixed: 8 saturates a LAN backend without DoSing it. Per-session error tolerance preserved (one bad session doesn't trash the run; failed count goes to stderr summary). CLI test seeds 12 sessions (>workers) so the pool must reuse slots, asserts every session.json lands and the summary shows `12 ok, 0 failed`.

## Phase PPPP — gact context list --format json

- [x] **PPPP1.** `gact context list <sid> --format json` emits the raw `[]gact.ContextFile` array for jq pipelines (path, mode, added_at). Default tsv kept for back-compat. Empty list serializes as `[]` not `null`. CLI test seeds two files, asserts json parses to 2 items with correct mode mapping, default tsv unchanged, unknown format → exit 2.

## Phase OOOO — gact info --include tasks,hooks

- [x] **OOOO1.** `gact info <sid> --include tasks,hooks` adds composite sections to the existing single-session info dump. In text mode, appends `--- tasks ---` and `--- hooks ---` blocks (TSV rows or `(none)`). In JSON mode, the response is wrapped: `{session, tasks?, hooks?}`. Hook scoping rule: keep session-scoped hooks for this session, plus global (`session=""` and `workspace=""`) and workspace-scoped hooks matching `s.workspace_id` (since those fire for this session). Unknown --include token → exit 2. Bare `gact info` unchanged. CLI test seeds two tasks (one completed) + one session-scoped hook, asserts both modes contain expected rows + JSON parses to {session,tasks,hooks} with correct counts.

## Phase NNNN — gact follow --format json (NDJSON)

- [x] **NNNN1.** `gact follow <sid> --format json` emits NDJSON for both the initial snapshot and streamed messages, so `gact follow $sid --format json | jq -c .` works as a poor-man's event tap. Default text mode unchanged. Refactored the message printing into an `emit(msg)` closure so snapshot + SSE-completed paths stay format-aware. CLI test runs follow in a goroutine bounded by `runGactWithDuration(5s)`, sends a second message mid-stream, asserts both ALPHA (snapshot) + BRAVO (stream) appear in NDJSON parts and every line parses as a Message.

## Phase MMMM — gact log --format json (NDJSON)

- [x] **MMMM1.** `gact log <sid> --format json` emits one message per line as NDJSON (no indentation, line-delimited) so callers can pipe to `jq -c` and friends. Default text mode unchanged. Plays well with the existing `--limit` / `--since` filters since both run before serialization. CLI test sends a user message + waits for assistant reply, then asserts `--format json` produces ≥2 lines that each parse to a Message-shaped object containing the right session_id and both user + assistant roles. Unknown format → exit 2.

## Phase LLLL — gact ping --json

- [x] **LLLL1.** `gact ping --json` emits a single-line JSON object on both branches: `{"ok":true,"backend":URL,"uptime_s":N}` on success, `{"ok":false,"backend":URL,"error":STR}` (with `uptime_s` if backend was reached but unhealthy) on failure. Existing text behavior unchanged when --json is absent. Existing -q still suppresses the success/unhealthy text but is overridden by --json (--json always emits one line). CLI test parses both branches with `encoding/json` to assert structured shape, not just substrings.

## Phase KKKK — perms rules list --format tsv

- [x] **KKKK1.** `gact perms rules list` gains `--format json|tsv` (default kept as `json` for back-compat with existing scripting callers; `--format tsv` is the new opt-in human view). TSV columns: scope, scope_id (`*` for any), tool_pattern, path_pattern (`-` if empty), action, annotations (sorted `k=v` list or `-`). CLI test seeds two policies, asserts both rows in TSV, default JSON shape preserved, unknown format → exit 2.

## Phase JJJJ — gact mcp list

- [x] **JJJJ1.** `gact mcp list [--format tsv|json]` enumerates the backend's connected MCP servers via `GET /v1/mcp/servers`. TSV columns: id, name, status, transport, protocol_version, capabilities (compact `tools,resources,prompts,logging`), last_error. JSON mode dumps the array as-is. Aliased to `mcp ls`. Help text + verb dispatcher updated. CLI test seeds the `default` emulator scenario (one fake-mcp), asserts both formats and that unknown format exits 2.

## Phase IIII — gact theme set

- [x] **IIII1.** `gact theme set <name>` writes the chosen theme to `config.json` (validates against `ui.AllThemeModes`, rejects unknown names with exit 2 and no file write). GACT_THEME still wins at resolution, by design — `set` only updates the config-level value. CLI test uses isolated `XDG_CONFIG_HOME` to assert: happy-path writes the file, `theme list` then marks the new value active, unknown names exit 2 without mutating the file, and missing arg exits 2.

## Phase HHHH — gact theme list

- [x] **HHHH1.** `gact theme list` enumerates `ui.AllThemeModes`, prints `<name>\n` per palette, and appends `\t*` to the resolved active line. Useful for discovering valid `--name` values + driving shell completions. Help text updated. CLI test asserts known names appear, exactly one `*` marker, and that the marker tracks `GACT_THEME`.

## Phase GGGG — gact theme show

- [x] **GGGG1.** `gact theme show [--name N]` prints the resolved theme palette as TSV (`key\thex`). Resolution honors --name flag, falls back to `config.Resolve(cfg.Theme, $GACT_THEME, "", defaultTheme)`. Emits `name<TAB>mode` row + 16 color rows (bg, fg, primary, secondary, success, warning, danger, border, role_*). Pure local — no backend dep. Help text + completion entries (bash/zsh/fish) updated. CLI test asserts env override, --name override, unknown verb exits 2.

## Phase III — tool-call/result linkage (user-flagged)

- [x] **III1.** Tool calls and tool results now interleave: `pairToolResults(msgs)` walks the message slice, builds `inlineResults[i]={call_id→result_part}` for each assistant that emitted tool_calls, and marks the absorbed tool messages so they don't render standalone. `renderPartsForRoleWithResults` emits each call's matching result immediately after the call header. Unpaired results stay visible (never silently dropped). Collapse-affordance `[N more lines · Ctrl+E to expand]` was already in place at render.go:365-378. Three unit tests + screenshot 67.

## Phase NNN — emulator hardening (found during MMM7)

- [x] **NNN1.** Emulator scenario engine no longer panics when messages are deleted mid-flight. Made `addPart` and `createAssistantMessage` nil-safe — they return placeholder `&gact.Part{}` / `&gact.Message{}` with empty IDs on error rather than nil. Subsequent calls to UpdateMessagePart/AppendPart/etc. return ErrNotFound (which the scenario already discards), so the script gracefully degrades to no-op instead of crashing the server. Regression test `TestDefaultScriptSurvivesMessageDelete` deletes the assistant message mid-flight and verifies the session survives.

## Phase FFFF — tasks summary

- [x] **FFFF1.** `gact tasks summary [--workspace WS_ID]` ships. Bounded-pool fanout (8-wide) over ListSessionTasks per session, sums by status. Skips sessions with no tasks. Prints TSV table + TOTAL footer with `(N sessions)` count. CLI test seeds two sessions, asserts both rows + correct TOTAL aggregate.

## Phase EEEE — dump-bundle --since

- [x] **EEEE1.** `gact dump-bundle --since DUR` filters bundled sessions by UpdatedAt cutoff. Logs `kept N/M sessions` to stderr. Sessions with zero UpdatedAt always survive (defensive against backends that don't stamp). CLI test seeds two sessions, verifies wide window keeps both and narrow window keeps only the recently-touched one.

## Phase DDDD — gact env

- [x] **DDDD1.** `gact env` ships. TSV `KEY<TAB>VALUE` for backend/theme/voice/intro/config-path/plugins-dir, then a `--- ENV ---` section listing every GACT_* env var. Pure local — no backend dep. Test asserts both env vars + their resolved values appear.

## Phase CCCC — replay

- [x] **CCCC1.** `gact replay <export-file|->` ships. Reads + decodes via existing client.ImportSession, prints new sid + "created session ... with N messages" notice. `--attach` flag bridges into the TUI via GACT_ATTACH_SESSION_ID + runTUI (OOO1 mechanism). CLI test exports a session, replays, asserts the imported log contains the original marker token.

## Phase BBBB — dashboard watch

- [x] **BBBB1.** `gact dashboard --watch [--interval DUR]` ships. Extracted renderDashboardOnce so --watch can call it on each tick. ANSI `\033[2J\033[H` clear+home between frames; banner with backend URL + interval + "Ctrl+C to exit". Tests: 2.5s run with --interval 1s asserts ≥2 clear sequences + seeded session in output.

## Phase AAAA — conformance for MMM endpoints

- [x] **AAAA1.** conformance suite gained Hooks (§6.17), Policies (§6.11), Tasks (§6.18) sections. Each is gated by `capabilities.{hooks,permissions,session_tasks}` so adapters that wire only a subset get auto-skipped. New SkipHooks/SkipPolicies/SkipTasks options + matching --skip names in `gact conformance`. Each section runs GET + write + delete to exercise the round-trip. Manual e2e: full suite passes against emulator with all 3 new sections green.

## Phase ZZZ — gact follow

- [x] **ZZZ1.** `gact follow <sid>` ships. Snapshots existing messages (chronological), then subscribes to SSE for the session and renders any new completed messages until Ctrl+C. `seen` map dedupes against SSE replay. Extracted printLogMessage helper so log + follow share one render path. CLI test seeds + waits ALPHA, starts follow with deadline, sends BRAVO, asserts both surface in the captured output.

## Phase YYY — wait any-of

- [x] **YYY1.** `gact wait --any-of sid1,sid2,...` ships. Polls each id per round; first idle wins. In --any-of mode the winning sid prints to stdout so chained scripts can branch on it. Single-arg form unchanged. Test fires two async tells, asserts winner ∈ the input set.

## Phase XXX — concurrent bench

- [x] **XXX1.** `gact bench --concurrent C` ships. Refactored runBench into a worker pool: C goroutines each own a session and run N turns serially. Aggregate stats across all C×N samples + a `thrpt` line (turns/s) shown only when concurrent>1. Default C=1 = old serial behaviour. Test extended to cover both modes + asserts thrpt hidden in serial mode.

## Phase WWW — cross-session grep

- [x] **WWW1.** `gact grep <query>` ships. Cross-session SearchMessages with a 8-wide goroutine pool. Each session's matches fetch a ListMessages call to map mid→role. Sorted by sid for stable output. TSV format `sid<TAB>title<TAB>mid<TAB>role<TAB>snippet`; JSON dumps the hit slice. CLI test seeds two sessions with a unique token + asserts both surface.

## Phase VVV — dashboard

- [x] **VVV1.** `gact dashboard` ships. Three formats: pretty (column-aligned ASCII, no box chars so `column` etc. work on it), tsv (grep-friendly), json (raw session structs for jq). Columns: id, status, title, model, age, tokens-in/out (compact: 1.2K/M), cost. Helpers humanAge + humanTokensCLI compact the numeric columns. CLI test exercises all three formats.

## Phase UUU — sidebar task badges

- [x] **UUU1.** Sidebar rows show `(N tasks)` badge (warning color, italic) when the session has open §6.18 tasks. Counts only pending+running statuses. Loaded lazily via new loadSessionTasksCmd in selectSession; cached in App.taskCountBySession. Title truncation accounts for badge width so layout doesn't overflow. 2 unit tests + screenshots/73-task-badge.png.

## Phase TTT — log time filter

- [x] **TTT1.** `gact log --since DUR` ships. After ListMessages returns, drops messages with CreatedAt older than now-DUR. Empty/0 = passthrough. CLI test sends AAA, sleeps 2s, sends BBB, asserts --since 1h keeps both, --since 1500ms keeps only BBB.

## Phase SSS — conformance CLI (deferred)

- [x] **SSS1.** `gact conformance` ships. Refactored `contract/conformance` to a `Reporter` interface (Helper/Run/Errorf/Fatal/Fatalf) — testing.T wraps via `FromTest`, CLIReporter implements it for command-line use. NewCLIReporter prints `▶`/`✓`/`✗` per section + tracks Failed; FailedSections() returns leaf failures. CLI accepts `--skip Section,…` to disable sections. Exit 0 = pass, 1 = fail, 2 = bad usage. CLI test runs full suite vs emulator and asserts PASS in stderr.

## Phase RRR — tail filter

- [x] **RRR1.** `gact tail --filter` ships. Comma-separated type list parsed once into a lookup map; events whose type isn't in the set get dropped before encode. Empty/unset = passthrough. CLI test asserts notification is kept and server.connected is filtered out when filter targets only "notification".

## Phase QQQ — bench

- [x] **QQQ1.** `gact bench [-n N] [--message TEXT] [--workspace] [--timeout]` ships. Creates a fresh session, runs N turns serially, polls each send→idle for per-turn duration, computes p50/p90/p99/avg/min/max/total, deletes the session, prints a summary table. CLI test asserts the table fields appear and the session is cleaned up (post-bench list count == pre).

## Phase PPP — voice CLI

- [x] **PPP1.** `gact voice <sid> <audio-file|->` ships. Wraps `client.VoiceTranscribe`. Reads file or stdin, defaults `--mime audio/wav`, prints recognised text on stdout. CLI test feeds a deterministic file + asserts non-empty transcription, plus exit-2 on empty audio.

## Phase OOO — TUI launch shortcuts

- [x] **OOO1.** `gact attach <name|sid>` ships. New runAttach dispatcher sets GACT_ATTACH_SESSION_ID env, strips its own argv, and re-enters runTUI. App.AttachSessionID + new pickAttachIndex helper select the right row on connectedMsg (matches by id OR title). Missing id falls back to row 0 with a transient hint. CLI test (TestPickAttachIndex) covers no-attach default, match-by-id, match-by-title, missing+fallback. Screenshot 72.

## Phase MMM — adds from Claude Code inventory (LLL7)

- [x] **MMM8b.** Plugins now surface in the slash palette. App carries `[]pluginCommand` (flattened from `plugins.Plugin × Command`); paletteMatches merges them in with `Source="plugin"`; Enter on a plugin command short-circuits the runCommandCmd path and execs the plugin binary in the background. Output (or failure) lands as a transient hint. Plugin scripts get `GACT_SESSION_ID`, `GACT_BACKEND`, `GACT_PLUGIN_DIR` env vars. Cross-package types `ui.PluginsLoaded`/`PluginsCommand` mirror plugins.* to keep the dep one-way. Test asserts merge + filter + lookup.


- [x] **MMM1.** SPEC already had `notification` event type at §7.3 line 680; wired it end-to-end. Emulator: `handleMcpReconnect` now publishes `{level: "info", title: "MCP server reconnected", body: server_id}`. TUI: `applySSE` case `notification` sets `transientHint = "<level>: <title> — <body>"`. CLI: `gact stream` prints `[<level>] <title> — <body>` row. CLI test asserts the workspace tail catches the event when reconnect fires.
- [x] **MMM2.** `Config.ConfigVersion *int` field + `internal/config/migrate.go` with `CurrentConfigVersion=1` and an ordered `migrations` slice. `Migrate(cfg)` walks forward from the user's current version. v1 just stamps the field on pre-MMM2 configs. Wired into LoadFrom — every `config.Load()` call now returns a migrated config. 3 unit tests cover pre-versioned full-run, already-current no-op, and partial-run with a swapped fake migrations list.
- [x] **MMM3.** Hooks shipped end-to-end: SPEC §6.17 added + `capabilities.hooks` flag + `gact.Hook` type + emulator hooks store + bus dispatcher + GET/POST/DELETE `/v1/hooks` + client.{List,Create,Delete}Hook + `gact hooks list/add/rm` CLI. Hook commands receive event JSON on stdin; URL targets get a POST. CLI test wires up a script-hook on `notification`, triggers a reconnect, asserts the script captured the event JSON, and removes it.
- [x] **MMM4.** SPEC §6.11 already had `Policy` type + `/v1/policies` endpoints (lines 490-505); wired them end-to-end. Emulator: `Permissions.SetPolicies/Policies/matchPolicies` + auto-resolve in `Create`. Tiny `*`/`**` glob matcher walks tool_name_pattern + path_pattern. Client: `ListPolicies`, `PutPolicies`. CLI: `gact perms rules list/set/clear` (set takes a `{policies:[…]}` JSON file or stdin). CLI test installs a deny rule, triggers a permission scenario, asserts the request landed `resolved/deny` automatically.
- [x] **MMM5.** SPEC §6.18 added (Tasks). `gact.SessionTask` type + `capabilities.session_tasks` flag. Emulator: in-memory `tasksStore` keyed by id with sessionID indexing; 4 routes (GET/POST/PATCH/DELETE). Client: ListSessionTasks, CreateSessionTask, PatchTask, DeleteTask. CLI: `gact tasks list/add/set/rm`. CLI test exercises full lifecycle (add → list shows pending → set running → list reflects → rm → empty).
- [x] **MMM6.** SPEC §6.2 summarize body extended with `instructions?: string`. Emulator echoes the instructions into the placeholder summary so callers can verify the field round-tripped. Client.SummarizeSession signature gains `instructions string`. CLI `gact summarize --instructions "…"`. Existing TestCLI_Summarize extended to assert the round-trip.
- [x] **MMM7.** SPEC §6.10 extended with `POST /v1/sessions/{id}/rewind` (`{to_message_id, include_target?}` → `{deleted_messages: [...]}`). Emulator finds the target in the message list, deletes everything newer, optionally drops the target. Client.RewindSession + `gact rewind <sid> <mid> [--include-target]` CLI. Test exercises both default and --include-target paths after waiting for idle (avoids pre-existing scenario-engine race noted as NNN1).
- [x] **MMM8.** Plugin loader shipped: `tui/internal/plugins/` with manifest schema (`{name, version?, description?, commands: [{id, title?, description?, command, args?}]}`). `Load(dir)` + `LoadVerbose(dir)` (latter returns per-manifest errors). XDG-aware `DefaultDir()`. Bad manifests are skipped, bad individual commands within a good manifest are also skipped (validation: id must start with `/`, command must be non-empty). `gact plugins list/dir [--dir DIR]` CLI wired up. 4 unit tests + 1 CLI integration test. NB: TUI palette wiring (auto-load plugins into the slash menu and exec on enter) is a future task — this iteration ships the loader + CLI surface only.

## Phase LLL — UX polish round (user-flagged 2026-04-18)

- [x] **LLL1.** 13 screenshots refreshed via existing tapes (screenshot, screenshot_collapse, screenshot_compose, screenshot_themes). Now reflect HHH1 header (model/agent) and III1 interleaved tool rendering.
- [x] **LLL2.** Catalog browser gained two TUI features: (a) Tools — `Space` toggles a tool's disabled state; disabled tools render dim+italic with `(disabled)` tag; persisted to `Config.DisabledTools`. (b) MCP — `Enter` on a server row drills into a unified tools+resources+prompts subview (`[tool]`/`[res]`/`[prompt]` prefixes) backed by the existing client.McpServerTools/Resources/Prompts methods; `Esc`/`Backspace` pops back to the server list. Per-kind hint line. 5 unit tests + screenshots/68-mcp-detail.png.
- [x] **LLL3.** /skills now hits ListAgents and filters source="skill" (per SPEC §6.5: skills are agents). Seeded two skill-source agents in the emulator (`test_writer`, `release_notes`) so /skills has real data. /agents continues to route to Settings>Agent which shows all 4 (2 builtin + 2 skill). New catalogKindAgents kind added for future browse-only routes. Screenshots 69 (skills) + 70 (agents in Settings).
- [x] **LLL4.** Settings + catalog browser modals got real header bars (full-width Primary bg, inverted text) instead of plain bold-foreground titles. Selected rows now get a Bg-color background strip behind the entire row in addition to the existing `▌` marker, so selection is visible at a glance even with peripheral vision. Settings rowLine helper extracted (collapses model/agent/theme tab repetition). Screenshots 68/69/70 refreshed.
- [x] **LLL5.** Sidebar height now matches the conversation pane height (was full bodyH including input), so both bottom borders close on the same row. Extracted `conversationPaneHeight()` helper used by both `viewMainBase` (sizes sidebar) and `renderBody` (sizes msg pane). UI goldens regenerated.
- [x] **LLL6.** Footer now groups hints into 3 clusters (action | nav | exit) with `·` between hints and `│` between clusters. Cost rendered as a styled chip with chipBg=Bg, $ amount in Secondary bold + tokens in dynamic-color (warning/danger by context-window threshold). UI goldens regenerated. Visible in screenshots/01-initial.png.
- [x] **LLL7.** Survey of CC's `src/` (101 slash commands, 85 React hooks, 11 migrations, plugins, skills, vim, voice, remote bridge). Report at `notes/cc-inventory.md` with per-feature add/maybe/skip verdicts and 8-item priority queue. Top-3 adds: SSE `notification` event type, versioned config migrations, hooks system. Filed as `MMM` follow-ups in PLAN.
- [x] **LLL8a.** `gact tell --async` posts the message and exits immediately, printing `sid<TAB>msg_id` to stdout. Combine with `gact watch <sid>` or `gact log <sid>` to pick up the reply later. Same find-or-create-by-name semantics as the sync path. CLI test asserts both orderings (positional-then-flag, flag-then-positional) work and that resume keeps the same sid.
- [x] **LLL8b.** Ctrl+Z now binds to `tea.Suspend` (bubbletea/v2 has built-in SIGTSTP handling — no syscall needed). Sets a transientHint "detached — `fg` to resume; backend session keeps running" so the user has reassurance on resume. Help overlay updated. CLI test asserts the hint and a non-nil cmd.

## Phase JJJ — intro/splash screen (user-flagged)

- [x] **JJJ1.** ASCII splash shipped. New `StageIntro` shown before connect (Init guards connectCmd while in StageIntro). `viewIntro` renders Triangle logo + GACT block-letters + "press any key to continue". Custom splash via `--intro-file PATH`, `GACT_INTRO_FILE`, or `intro_file` config (format: logo block, blank line, name block). Bypassed by `--no-intro` flag, `GACT_NO_INTRO` env, or `intro_skip: true` config. Any non-Ctrl+C key dismisses → connect. 4 unit tests + screenshots/71-intro-splash.png. NB: deferred the "if no model/agent: open Settings>Model" routing — both fields default to anthropic/claude-opus-4-7 in createSessionCmd today, so nothing's "unset"; revisit when those defaults move into Settings.

## Phase KKK — name-based tell (user-flagged)

- [x] **KKK1.** `gact tell <name> <msg>` — single verb, idempotent. First call creates a session whose title is `<name>` (anthropic/claude-opus-4-7 + default agent). Subsequent calls with the same name resolve to the existing session and append. `<name>` may be a literal `sess_<id>` (resolver short-circuits). Prints assistant reply to stdout; "created session …" notice goes to stderr only on creation. CLI test covers create→resume→both turns landing in same sid.

## Phase HHH — model indicator in header

- [x] **HHH1.** Header now appends `model: <model_id>  agent: <agent_id>` after the session label and before the status badge. Drops cleanly on narrow widths via the existing avail logic. Two renderer tests cover the wide-window happy path and the narrow-window fallback. Screenshot at `screenshots/66-header-model.png`.

## Phase GGG — capabilities CLI

- [x] **GGG1.** `gact capabilities` (alias `caps`) wraps existing `client.Capabilities`. Text mode prints contract version, backend identity, transports, auth, then a `✓`/`·` matrix of all 23 SPEC §3.3 flags. Extensions follow. JSON dumps raw `gact.Capabilities`. CLI test asserts contract_version line, three core flag rows in text, and JSON shape.

## Phase FFF — list filters

- [x] **FFF1.** `gact list` gained `--status STATUS`, `--archived`, `--parent SID`, `--limit N`. Status/limit applied client-side (server has no query params); workspace+archived+parent flow through SessionFilter. Validates --status against the known set with exit 2. CLI test seeds 2 sessions, asserts --limit 1 truncates, --status idle keeps idle rows, --status running yields empty, and bogus status fails 2.

## Phase EEE — MCP resource read

- [x] **EEE1.** `gact mcp resource-read <srv-id> <uri>` (alias `mcp read`) wraps new `client.McpResourceRead`. Walks returned `contents` slice and writes each chunk's `text` to stdout (or base64-decodes `data` for binary). CLI test reads seeded `file:///docs/welcome.md` and asserts `demo content` lands.

## Phase DDD — agent detail + watch

- [x] **DDD1.** `gact agent show <id>` (alias `agents show`) wraps new `client.GetAgent`. Text mode lists id, source, title, description, default_model, tools, parameters, then system_prompt block. JSON mode dumps raw AgentDef. CLI test asserts seeded `default` agent renders correctly.
- [x] **DDD2.** `gact watch <sid> [--interval DUR] [--timeout DUR]` polls GetSession and emits TSV row `HH:MM:SS<TAB>status<TAB>msg_count<TAB>tokens_out` whenever status/messages/tokens change. Exits cleanly after seeing activity + 2 idle ticks (timeout otherwise). Activity = any non-idle status OR any change in counts after the first poll — this lets the loop terminate on fast emulator turns that skip running state. CLI test backgrounds a send, asserts ≥2 rows + 4-col TSV.

## Phase CCC — tool detail + MCP reconnect

- [x] **CCC1.** `gact tool show <id>` (alias `tools show`) — wraps `/v1/tools/{id}` via new `client.GetTool`. Text mode prints id, source, server, name, title, description, permission_default, plus pretty-JSON for input/output schemas; JSON mode dumps the raw `gact.Tool`. CLI test asserts seeded `bash` round-trips with name, description, and schema.
- [x] **CCC2.** `gact mcp reconnect <srv-id>` — POSTs `/v1/mcp/servers/{id}/reconnect` via new `client.McpReconnect`. Exit 0 on success. CLI test asserts `mcp_fake` reconnects (exit 0) and an unknown id fails (non-zero).

## Phase BBB — MCP detail CLI

- [x] **BBB1.** `gact mcp tools|resources|prompts <server-id>` wraps the three previously-unexposed `/v1/mcp/servers/{id}/...` GET endpoints. Added `client.McpServerTools/Resources/Prompts`. TSV columns are tuned per type: tool=id·name, resource=uri·mime·name, prompt=name·title. JSON mode dumps the raw slice. CLI test asserts each verb returns ≥1 row for the seeded `mcp_fake` and JSON mode has the right shape.

## Phase AAA — repo map CLI

- [x] **AAA1.** `gact repo-map <ws-id> [--format tree|json]` — wraps `/v1/workspaces/{id}/repo_map`. Added `client.WorkspaceRepoMap` returning `RepoMapResponse{Tree, Tokens}`. Tree mode renders nested paths with `├──`/`└──` glyphs and hangs symbol outlines as `· name` children. JSON dumps the raw response. Token cost goes to stderr so stdout stays clean for `tee`. CLI test asserts main.go and Handler appear and JSON shape lands.

## Phase ZZ — workspace files CLI

- [x] **ZZ1.** `gact files list <ws-id> [--format tsv|json]` — wraps `/v1/workspaces/{id}/files` (existing client.ListWorkspaceFiles). TSV columns: type, size, path. JSON dumps the raw FileEntry slice. CLI test asserts seeded `main.go` shows up.
- [x] **ZZ2.** `gact files read <ws-id> <path>` — wraps `/v1/workspaces/{id}/files/read?path=...`. Added `client.ReadWorkspaceFile([]byte, error)` since none existed (response is octet-stream, not JSON). Bytes go straight to stdout for shell piping. CLI test reads `main.go` and asserts `package main` appears.

## Phase YY — undo CLI

- [x] **YY1.** `gact undo <sid> [--count N]` — POSTs `/v1/sessions/{id}/undo`. Added `client.UndoSession(ctx, id, count)` (no wrapper existed) returning the reverted message ids. Stdout: one mid per line. Stderr: `reverted N message(s)` summary. CLI test sends + waits for a turn, undoes 1, asserts the reverted-ids list has length 1, the stderr summary lands, and the log's role-header count drops by exactly 1.

## Phase XX — session info CLI

- [x] **XX1.** `gact info <sid> [--format text|json]` — wraps GetSession with a key:value text output (one field per line, awk-friendly) plus raw JSON dump for jq pipelines. Surfaces id, title, status, workspace, parent, model, agent, message_count, tokens, cost, created/updated/archived, summary. CLI test asserts title round-trip and status in known set.

## Phase WW — models CLI

- [x] **WW1.** `gact models list [--provider PID] [--format tsv|json]` — chains ListProviders + per-provider ListProviderModels in one command. TSV columns: provider_id, model_id, name, context_window. `--provider` skips the providers round-trip and lists only that provider's models. CLI test asserts all three seeded providers (anthropic, openai, local) appear, that `--provider anthropic` filters correctly, and that JSON output exposes `provider_id`+`model_id`.

## Phase VV — fork CLI

- [x] **VV1.** `gact fork <parent-sid> [--at MID] [--title T]` — POSTs a new session with `parent_session_id` (and optionally `fork_at_message_id`), inheriting the parent's workspace via a GetSession lookup. Prints the new id to stdout. CLI test forks an existing session and asserts the child surfaces under `?parent_session_id=`.

## Phase UU — workspaces CLI

- [x] **UU1.** `gact workspaces list [--format tsv|json]` — wraps `/v1/workspaces` so scripts can discover workspace ids without booting the TUI. TSV columns: id, name, root_path. Aliases: `workspace`, `ws`. CLI test asserts the seeded `ws_default` shows up in both TSV and JSON.

## Phase TT — search CLI

- [x] **TT1.** `gact search <sid> <query>` — uses GET `/v1/sessions/{id}/messages/search` (client.SearchMessages). TSV output is `mid<TAB>role<TAB>snippet`; one ListMessages up front resolves role per message. `--format json` pretty-prints the raw match objects. CLI test seeds a unique token and asserts mid+role+snippet land in both TSV and JSON output.

## Phase A — Emulator skeleton

- [x] **A1.** `emulator/go.mod`, package layout. **Decided:** stdlib `net/http` only (Go 1.22+ method-prefixed mux), `github.com/google/uuid` for IDs. Module `github.com/JaimeCernuda/gact-tui/emulator`. Layout: `cmd/emulator-server/`, `internal/server/`, `pkg/gact/`.
- [x] **A2.** Server bootstrap: `cmd/emulator-server/main.go` with `--port`, `--scenario` flags. `go run ./cmd/emulator-server` boots, listens, gracefully shuts down on SIGTERM.
- [x] **A3.** `GET /v1/health` returns `{healthy: true, uptime_s: <int>}` (per SPEC §3.4).
- [x] **A4.** `GET /v1/capabilities` returns the capability bundle (per SPEC §3.3). Hard-coded; reflects what the emulator implements (workspaces/sessions/subagents/MCP/files/diffs/permissions/providers/commands/metrics/branching/export/cost/thinking/search = true; LSP/voice/scheduled/sharing/edit_modes/plan_mode/agent_write/skills_extraction = false in v0.1).
- [x] **A5.** Internal storage layer: in-memory state for workspaces, sessions, messages, parts. **Decided:** sync.RWMutex per-Store (single mutex, simpler than per-resource), maps keyed by ID, secondary index `messagesBySession`. Cascade delete (workspace→sessions→messages). System messages filtered by default in ListMessages. Cursor pagination via `Before` (last seen msg ID).
- [x] **A6.** Workspaces endpoints (SPEC §6.1): GET list, POST create, GET one, PATCH, DELETE. Seeded `ws_default` at `/tmp/gact-emulator-workspace`. Auto-name from basename if not supplied. DisallowUnknownFields for strict request validation.
- [x] **A7.** Sessions endpoints (SPEC §6.2): list (filter workspace_id, parent_session_id, archived), create (with optional fork-at-message), get, patch (title, archived, agent, model, status, metadata), delete, fork (copies messages from parent), cancel (resets status to idle — event emission deferred to A10/A11), summarize (placeholder summary — real summary via A11 scenario), export (chronological), import (resets IDs). **Fix:** store.CreateSession now resets MessageCount/Tokens/CostUSD — derived fields managed by store, not callers.
- [x] **A8.** Messages endpoints (SPEC §6.3): list cursor-paginated, get, POST 202, DELETE, PATCH part, search (substring + snippet).
- [x] **A9.** SSE event stream: per-client filter, ring-buffer replay via Last-Event-ID, heartbeat 15s.
- [x] **A10.** Event bus: in-process pub/sub with monotonic SeqID, ring buffer, slow-subscriber drops counted, race-clean fan-out.
- [x] **A11.** Scenario engine: per-session goroutine + cancel; DefaultScript synthesizes thinking + intro + tool_call + tool_result + finish, optionally with permission flow on dangerous keywords.
- [x] **A12.** Permissions: list (pending filter), get, respond (allow/deny/allow_session/allow_workspace). Per-request resolveCh wakes the scenario.
- [x] **A13.** Providers + models: anthropic / openai / local with realistic models + pricing.
- [x] **A14.** Tools: bash/read_file/edit_file/web_search + 2 mcp-sourced tools, all with input_schema and ToolAnnotations.
- [x] **A15.** MCP: one fake server (`mcp_fake`) — list/get/reconnect/tools/resources/templates/read/subscribe/prompts/prompts.get.
- [x] **A16.** Agents: default + code_reviewer (read). Write API + extract → 501 per `agent_write=false`.
- [x] **A17.** Files / context / repo_map: per-session context-files set + workspace files demo + repo_map demo tree.
- [x] **A18.** Diffs: aggregate file_diff parts across messages, apply/reject mark Applied flag, undo deletes last N messages.
- [x] **A19.** Commands: /clear /cancel /model /agent /add /drop /diff /undo /help /summarize (mcp_prompt).
- [x] **A20.** Metrics: tokens, sessions+by_status, messages+by_role, cost+by_provider.
- [x] **A21.** Cancellation: handleCancelSession invokes engine.Cancel + emits status_changed (verified by E2E test).

## Phase B — Emulator tests (DONE)

- [x] **B1.** Table-driven endpoint tests across handlers_*_test.go files.
- [x] **B2.** SSE integration via `cmd/emulator-server/e2e_test.go::TestE2E_FullScenarioFlow`.
- [x] **B3.** Permission flow E2E in `TestE2E_PermissionFlow`.
- [x] **B4.** Cancel mid-stream covered by `TestE2E_CancelInflight`.
- [x] **B5.** Coverage ≥ target: events 87.3%, scenario 82.2%, server 79.9%, store 90.3%.

## Phase C — TUI scaffold

- [x] **C1.** `tui/go.mod`. Module `github.com/JaimeCernuda/gact-tui/tui`. Bubbletea v2, lipgloss v2, bubbles v2. `gact` binary builds (~11.5MB).
- [x] **C2.** `tui/internal/client/` — typed Go HTTP+SSE client. Covers capabilities, sessions, messages, events, agents, tools, providers, commands, permissions, metrics. Integration test boots emulator binary and exercises the wire.
- [x] **C3.** SSE consumer: tea.Cmd loop pattern. waitForSSE re-enqueues itself on every event. Reconnect on `sseClosedMsg`.
- [x] **C4.** Root model + layout: header / sidebar+body / footer via lipgloss.JoinVertical/Horizontal. AltScreen + Bg/Fg colours.
- [x] **C5.** Sidebar with sessions list, ▌ marker on selected, status colour-italic underneath.
- [x] **C6.** Body conversation pane: role-coloured headers (USER/ASSISTANT/TOOL/SYSTEM), thinking/text/tool_call/tool_result/file_diff/error rendering, scroll-clip with sticky-bottom.
- [x] **C7.** Input pane: simple text buffer + Enter-to-send (textarea bubble can replace later). Cursor blink.
- [x] **C8.** Footer: focus zone, key hints (Tab pane, Enter send, ?help, ctrl+c quit), UTC clock.
- [x] **C9.** Streaming: message.created → part.added → part.delta (text_append, thinking_append, input_json_append) → part.completed (parses tool_call input). Verified end-to-end via 02-streaming + 03-completed screenshots.
- [x] **C10.** Permission dialog: yellow warning banner above conversation when permission.requested arrives. Verified via 04-permission screenshot. (Action submit keys still TODO — see C10b.)
- [x] **C10b.** Permission action keys (a/d/s/w → POST /v1/permissions/{id}).
- [x] **C11.** Slash palette ('/' on empty input opens it; fuzzy filter; Enter dispatches POST /v1/sessions/{id}/commands/{cmd_id}).
- [x] **C12.** Help overlay ('?' toggles).
- [x] **C13.** WindowSizeMsg propagated through layout.
- [x] **C14.** Connect screen: capabilities probe on startup; error stage on failure; capabilities-aware UI (e.g. would hide panels if capability=false).
- [x] **C15.** Settings panel — Ctrl+s opens modal with Model/Agent tabs; lists from /v1/providers + /v1/agents; Enter applies via PATCH /v1/sessions/{id}. Theme switching deferred to E3.
- [x] **C16.** File context panel — sidebar CONTEXT section lists files for current session with mode badges (E/R/P colored). Loaded on session select via GET /v1/sessions/{id}/context/files. Add/remove via REST is wired in client (AddContextFile/RemoveContextFile) but not yet exposed via UI keys.
- [x] **C17.** Diff viewer: a/r keys on body focus apply/reject all pending diffs via /v1/sessions/{id}/diffs/{apply,reject}. Diff part shows status badge: '(applied)' / '(rejected)' / inline hint when pending. Emulator scenario triggered by 'diff' / 'edit' / 'patch' / 'propose' keywords.
- [x] **C18.** Cost meter — emulator now emits `cost.updated` after every assistant turn (synthetic 1500-in/600-out at Sonnet rates ≈ $0.0135/turn) and rolls into the session aggregate; TUI consumes the event, updates the in-memory session, renders `$X.XXXX (N in / N out)` right-aligned in the footer.
- [x] **C19.** Subagent indication: scenario spawns a subagent on "split"/"with help"/"subagent" triggers; emits subagent.started/completed events; parent carries subagent_call/result parts; TUI renders both with ▼/▲ markers; sidebar shows subsessions indented with `└`. Verified via 15-subagent-parent + 16-subagent-sidebar screenshots.

## Phase D — TUI tests + visual verification

- [x] **D1-D5.** Golden snapshots for ConnectingStage, ErrorStage, ReadyEmpty, ReadyWithSessions, StreamingConversation, PermissionBanner, HelpOverlay, PaletteOpen, PaletteFiltered (9 states under `tui/internal/ui/testdata/`).
- [x] **D6-D10.** Visual screenshots — exceeded scope: 14 PNGs in `screenshots/` covering every visible state including markdown rendering and textarea input.

## Phase E — Polish & integration

- [x] **E1.** TUI teatest e2e — unblocked by adding `App.DisableAltScreen` (test-only knob). 3 tests in tui/internal/ui/e2e_test.go cover happy path (Ctrl+N → type → wait for ASSISTANT/read_file/TOOL render), permission flow (delete → permission banner → 'a' allow → completion), and overlays (? help, / palette). Took 2.84s race-clean.
- [x] **E2.** README.md at repo root.
- [x] **E3.** Theming — LightTheme() + ThemeForMode() + ParseThemeMode(); main.go honors `--theme=light|dark` flag (and `GACT_THEME` env). Glamour markdown style still hardcoded dark — visible mismatch on light bg (follow-up).
- [x] **E3b.** Glamour style follows TUI theme — Theme.glamourStyle() picks 'light' when bg luminance is bright, 'dark' otherwise; renderMarkdown takes style as param; cache key now includes (style, width).
- [x] **E4.** Keyboard hint discoverability — footer + help overlay.
- [x] **E5.** Connection resilience — sseClosedMsg → reconnect tick.
- [x] **E6.** Empty-state polish — sidebar n-to-create + body crib.
- [x] **E7.** Multi-pane focus — Tab cycles, focus indicated by `BorderForeground(Primary)` on the active pane.

## Phase F — Stretch (only if Phase A–E complete)

- [x] **F1.** OpenCode adapter v0.1 — new `adapters/opencode/` module exposes GACT v0.1 endpoints, proxies to an OpenCode upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/sessions`, `/v1/sessions/{id}` with shape translation (OpenCode ms timestamps → time.Time, slug/projectID/directory preserved as `x_opencode_*` metadata). Unimplemented endpoints return 501. Tests use httptest to mock OpenCode upstream — no real OpenCode needed. README documents remaining endpoints + their OpenCode mappings as a follow-up roadmap.
- [x] **F2.** Configuration file — JSON at `$XDG_CONFIG_HOME/gact/config.json` (or `~/.config/gact/`); resolution precedence file < env < flag < fallback. Decided JSON over TOML to keep TUI dep-free.
- [x] **F3.** Export/import subcommands — `gact export <sid> [-o file]`, `gact import <file|->`. Flag reordering so users can write `gact export SID -o file`. Honors GACT_BACKEND env. Round-trip verified manually against the emulator.
- [x] **F4.** Voice transcribe wire-up — emulator implements POST /v1/sessions/{id}/voice/transcribe (canned transcript by body length, with `?text=` query override for tests). TUI client.VoiceTranscribe + Ctrl+Y key inserts the recognised text at the textarea cursor. Real mic capture is platform-specific shell-out — out of scope for the TUI core; documented as user-supplied wrapper script.
- [x] **F5.** Markdown rendering in messages via glamour — implemented for assistant text (iteration 11).

## Phase G — Open follow-ups

- [x] **G1.** OpenCode adapter messages list — `GET /v1/sessions/{id}/messages` translates OpenCode's `GET /session/{id}/message`. Forwards limit + before query params. Translates parts: text, reasoning→thinking, tool→tool_call, file→image. Unknown types pass through as `x_opencode_<type>` per SPEC §8.3 forward-compat. Cost/tokens/finish propagated.
- [x] **G2.** OpenCode adapter SSE — proxy `/event` with shape translation. session.idle → session.status_changed, session.error → message.error, message.updated → message.created, message.part.updated/.delta passed through with shape conversion, permission.asked/.replied → permission.requested/.resolved. Unknown OpenCode event types pass through as `x.opencode.<type>` per SPEC §8.4. Per-session filter via /v1/sessions/{id}/events drops crosstalk. Heartbeat every 15s. Full handler at handlers_events.go; 7 translation tests.
- [x] **G3.** OpenCode adapter POST message — `POST /v1/sessions/{id}/messages` translates GACT parts → OpenCode parts (text + tool_call) and forwards to OpenCode's `POST /session/{id}/prompt_async`. Returns synthetic 202 with placeholder message_id (real ID will arrive via SSE — wired in G2).
- [x] **G4.** Crush adapter scaffold — new `adapters/crush/` module exposes GACT v0.1 endpoints, proxies a Crush HTTP upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/workspaces/{id}`, `/v1/sessions?workspace_id=`, `/v1/sessions/{id}` — flattens Crush's nested `/v1/workspaces/{wsID}/sessions` URL into GACT's flat shape via query param + `--default-workspace` flag. Crush's Unix-second timestamps parsed; yolo/debug surfaced as `metadata.x_crush_*`; prompt/completion tokens map to GACT input/output. Mocked-upstream tests; no real Crush needed. Messages/SSE/POST/permissions/LSP/MCP + Unix socket transport documented as follow-ups.
- [x] **G5.** Voice mic capture — `--voice-cmd` (env: `GACT_VOICE_CMD`, config: `voice_command`) shells out to a user-supplied recorder on Ctrl+Y. Reference wrapper at `scripts/voice-record.sh` covers arecord/sox/ffmpeg with a 6 s default duration. Contract: cmd writes audio/wav to stdout and exits 0; non-zero with stderr surfaces to the user as an error stage. 30 s runtime cap + 16 MiB audio cap protect the TUI from a runaway recorder. Unit tests cover empty cmd (placeholder) / success / non-zero exit / empty audio.
- [x] **G6.** Cost meter test — `TestCostAccumulatesAcrossTurns` runs 3 user turns through the default scenario and asserts session.CostUSD = 0.081 (3 × 2 × $0.0135) and tokens.input/output match (9000 / 3600). Catches regressions in completeMessage cost charging.
- [x] **G7.** Sidebar viewport — j/k already auto-scroll past the visible window; added g/G for first/last and PgUp/PgDn (also Ctrl+u/Ctrl+d) for paged jumps. `sidebarPageSize()` mirrors the renderSidebar arithmetic so the page step always equals what the user actually sees. Help overlay updated; new tests cover g/G, PgUp/PgDn, clamps at the ends, and that g at index 0 emits no Cmd (no spurious SSE reload).
- [x] **G8.** Search UI — slash palette switches to message-search mode when the filter starts with `?`. First Enter submits the query, results replace the matches list with msg id + snippet, second Enter jumps the conversation viewport to the hit. Backspace invalidates loaded results so the user re-fires after editing. Search errors are swallowed (no full-screen error stage). Help overlay documents `/?…`. New `client.SearchMessages` + 6 unit tests cover the mode switch, submit, jump, invalidation, empty-query no-op, and error swallowing.
- [x] **G9.** Reload-on-config-change — Ctrl+L re-reads `$XDG_CONFIG_HOME/gact/config.json` and hot-applies theme + voice command without restart. Backend changes are flagged in the toast ("backend changed — restart to apply") rather than applied live, since rebinding the URL would force-reconnect SSE/refetch caps/drop the loaded session — too disruptive for an in-flight conversation. Result is shown as a transient hint above the input pane (auto-clears on next non-Ctrl+L key). 5 unit tests cover fire path, error surfacing, nil-hook no-op, hint clearing, and Ctrl+L→Ctrl+L overwrite. fsnotify-style auto-watch deferred — manual reload covers the 80% case (operator tweaking colors).
- [x] **G10.** Telemetry sampling — `latencyTracker` keeps a 1024-sample ring buffer per route pattern; timing middleware wraps the mux and records `time.Since(start)` keyed by `r.Pattern` (Go 1.22+ sets this during routing). SSE/`/events` patterns are skipped (their durations measure connection lifetime, not RPC latency). `/v1/metrics` now includes `latencies: { "GET /v1/foo": { count, p50_ms, p95_ms, max_ms } }`. TUI metrics modal renders the top-6 routes by p95 so operators see the slowest endpoints first. 5 unit tests cover percentile correctness, SSE skip, empty-pattern skip, ring-buffer overwrite, and the e2e shape via /v1/metrics.

## Phase H — Crush adapter feature parity (mirrors G1–G3 for the Crush upstream)

- [x] **H1.** Crush adapter messages list — `GET /v1/sessions/{id}/messages?workspace_id=` proxies Crush's `GET /v1/workspaces/{wsID}/sessions/{sid}/messages`. Crush's wrapped `{type, data}` parts translate as: text/reasoning/tool_call/tool_result pass through with shape conversion, `finish` becomes `Message.StopReason` (not a part), `image_url`/`binary` map to image/document with the URL or base64 source preserved, unknown types fall through as `x_crush_<type>` with `metadata.x_crush_raw` per SPEC §8.3. Tool-call `input` strings are JSON-decoded best-effort; malformed input is preserved verbatim under `metadata.x_crush_raw_input` so nothing is silently dropped. 9 unit tests + 1 e2e test against a httptest mock cover every branch.
- [x] **H2.** Crush adapter SSE — `/v1/sessions/{id}/events?workspace_id=` and `/v1/events?workspace_id=` proxy Crush's workspace-scoped SSE. Crush wraps every event as `{type, payload:{type, payload}}` (outer = payload type, inner = lifecycle); we translate to GACT shape: session.created/updated/status_changed/deleted (status_changed when the resource carries a non-empty status field), message.created/updated/deleted, permission.requested/resolved (with allow/deny derived from granted/denied). Unknown payload types pass through as `x.crush.<type>` per SPEC §8.4. Per-session filter drops crosstalk by checking each event's resource session_id (or `id` for session-lifecycle events). Reuses fresh `http.Client{Timeout: 0}` since SSE is long-lived; heartbeat every 15 s. 11 unit tests + 2 e2e tests against an httptest fakeCrushSSE; race-clean (used real httptest server with body reader rather than NewRecorder, which isn't safe for concurrent read+write).
- [x] **H3.** Crush adapter POST message — `POST /v1/sessions/{id}/messages?workspace_id=` translates GACT parts to Crush's flat `{session_id, prompt, attachments}` AgentMessage and forwards to `POST /v1/workspaces/{wsID}/agent`. Crush has no parts concept on input (only output), so we flatten: text parts join with newlines; thinking parts are wrapped in `<thinking>` so the agent sees them but knows they're informational; image/document parts with binary base64 sources lift into attachments preserving MIME and filename; URL-only image sources are dropped (no fetch — would change prompt determinism); unknown part types JSON-fence into the prompt so nothing is silently lost. Returns 202 with synthetic `msg_pending_<ts>` ID — the real Crush ID arrives via the SSE message.created event from H2. 7 tests cover text/thinking/image/URL-image-drop/unknown-part-fence/e2e/upstream-error/missing-workspace.

## Phase I — Engineering hygiene

- [x] **I1.** GitHub Actions CI — `.github/workflows/ci.yml` runs three matrix-jobs on every push to main + every PR: (a) `go test -race -count=1 ./...` in each of the 4 modules (emulator/tui/adapters/opencode/adapters/crush) so failures stay isolated; (b) `go vet ./...` per module; (c) a build job that compiles every binary (emulator-server, gact, gact-opencode-adapter, gact-crush-adapter). `concurrency: cancel-in-progress` saves CI minutes on rapid-fire commits. setup-go cache keyed on go.mod (always present; the no-external-dep modules don't ship a go.sum). **CI immediately found real bugs**: vet caught 5x `using resp before checking for errors` in SSE tests + 1x `append with no values` in main_test.go (fixed in the same commit), and slow-runner load surfaced a race in three scenario tests where the drain predicate read `st.GetSession(sid).Status` after each event — the script could publish idle, mutate the store, and the test would mistake the in-flight running event for an idle transition. Reproduced with `GOMAXPROCS=1`. Fix: read `e.Payload["status"]` instead of the ever-changing store; factored into `collectStatusEvents` helper so future tests don't reinvent the same race. Three CI iterations: workflow added → CI red (timeout fix wrong) → bumped deadlines (CI red, real race) → payload-read fix (CI green).
- [x] **I2.** Adapter conformance suite — `contract/conformance/` is a self-contained Go module (stdlib-only) that any GACT backend can adopt via `conformance.Run(t, url, Options{})`. Walks Health / Capabilities / Workspaces / Sessions_List / Sessions_Create / Messages_Post / SSE using raw `net/http` (not an SDK — the point is wire validation). Each section runs under `t.Run` so failures stay isolated; 501 on an unskipped section is a failure (tolerating it would defeat the purpose). Skip flags are opt-out per section for backends that only implement a subset. Self-tests: (a) runs against a fresh emulator binary — builds it on-the-fly if missing so CI needs no prerequisite step, skips if the emulator source isn't findable; (b) a hand-rolled health-only server proves the skip-flag plumbing. Module wired into `go.work` and `.github/workflows/ci.yml`.
- [x] **I3.** Wire conformance into adapter test suites — both OpenCode and Crush adapters now ship a `TestConformance_AgainstMockedUpstream` that boots the adapter against a "complete" mocked upstream (every endpoint conformance touches) and runs the full `conformance.Run`. OpenCode passes 6/6 sections; Crush passes 6/6 sections. Both set `SkipCreateSession` (neither adapter exposes POST /v1/sessions — upstream owns session creation) and pin a fixture SessionID. Caught one real bug while wiring: the OpenCode adapter treats upstream 404 as `{}` and then tries to unmarshal that as a list — would've silently returned "no sessions" in production if Crush-style path-shape bug occurred. Each mock handler registers both trailing-slash and bare-path variants so path-shape regressions in the adapter don't 404-silently. SSE mock emits one real event + keeps the stream open; cleanup closes in-flight SSE clients so `httptest.Server.Close()` doesn't hang. Adapter go.mod files grow a `require`/`replace` pair for `contract/conformance` (stdlib-only module, no transitive deps).

## Phase J — User-facing polish (multi-workspace, resilience)

- [x] **J1.** Workspace switcher — Ctrl+W opens a modal listing every workspace already loaded into `a.workspaces` (no extra round-trip — `connectCmd` populates it at startup). Selection defaults to the current workspace so Enter on the same row is a no-op toast. Switching tears down the SSE stream, clears sessions/messages/context/permissions, and dispatches a fresh `listSessionsCmd` keyed to the new workspace; the result lands as a `workspaceSwitchedMsg` that the Update handler distinguishes from regular `sessionsRefreshedMsg` (so we land on session #0 instead of preserving the old selection). Stale-response guard: if the user switches again before the in-flight response lands, the old `wsID` mismatch makes the handler drop the stale list. Caught + fixed a real rendering bug while doing this: the existing `truncate()` slices on byte indices, which cuts inside ANSI escape sequences when called on already-styled labels (modal showed "…" garbage). Fix: truncate the plain label first, style after. Help overlay updated, paste-blocklist updated. Tests cover open/close/nav/clamp/no-op-current/switch/stale-msg/empty-workspaces (7 tests). Screenshot at `screenshots/17-workspace-switcher.png` proves the modal renders correctly with two workspaces seeded.
- [x] **J2.** SSE exponential backoff — replaced the fixed 750 ms reconnect delay with a 250 ms → 500 ms → 1 s → 2 s → 4 s → 8 s → 16 s schedule, capped at 30 s. `nextReconnectDelay()` is a pure function of `a.sseBackoffAttempts` so tests walk the schedule directly; adds ±25% jitter via `math/rand` so multiple TUI instances reconnecting to the same restarted backend don't thunder in lockstep (floor-clamped to baseReconnectDelay so a low-jitter draw can't go below 250 ms). Reset-on-event: every `sseEventMsg` arrival clears attempts to 0, so a flaky backend that comes back quickly snaps back to the baseline rather than staying at 30 s for the rest of the session. Also defends against negative attempts via clamp (defensive against bookkeeping bugs). 3 unit tests: schedule bounds for every attempt (sampling 50x/level to catch jitter-range drift), negative-attempts safety, reset on event.
- [x] **J3.** Auto-retry connect on transient backend failure — `errMsg` from a connect-stage source ("capabilities", "workspaces", "sessions") now schedules a `retryConnectMsg` via `tea.Tick` on the same exponential schedule the SSE reconnect uses (250 ms → 30 s + jitter, sharing `nextReconnectDelay`'s implementation via `connectRetryAttempts`). Non-connect failures (post-message, etc.) don't retry — those come from user actions and shouldn't loop in the background. `connectedMsg` resets the counter so a flaky backend that comes back snaps to the baseline. From `StageError`, Ctrl+R retries instantly (skipping the backoff and resetting attempts); Ctrl+C still quits; every other key is swallowed so users don't accidentally trigger something against the unconnected backend. Error view advertises both keys + shows the pending auto-retry attempt number. `isConnectStage()` is an explicit allowlist — adding a new connect-stage value requires touching it (intentional friction). 7 tests cover: connect-stage schedules retry, non-connect doesn't, retry-msg only fires in StageError, retry-msg flips to StageConnecting + dispatches connectCmd, Ctrl+R immediate retry, attempts reset on connectedMsg, other keys swallowed in StageError.
- [x] **J4.** SSE Last-Event-ID resume — every incoming `sseEventMsg` now bumps `a.lastSeenSeqID` to `max(current, event.SeqID())` (max-guard so an out-of-order replay can't drag us backwards); `startSSECmd` passes this to `EventStreamScope.LastEventID` so the emulator's ring replays events published during a disconnect. Reset to 0 on `selectSession` — the next session has its own ring and resuming with a stale ID could skip real events or no-op. No backoff-reset conflict: the SSE backoff resets on event arrival (J2), the resume counter tracks the stream position — different concerns, both live on the same event-handler branch. 4 tests: tracks highest (not most-recent) id, out-of-order doesn't regress, two reconnects send the right header via a spy httptest server, selectSession resets the counter. Implementation subtlety caught while writing the test: the initial version held the mock connection open with `<-r.Context().Done()` which serialized the second request behind the first via HTTP/1.1 keep-alive; fixed by having the mock write headers then return immediately so each request gets its own connection without the test needing to drive cancellation.
- [x] **J5.** Preserve in-flight message on post failure — PostMessage failures now emit a `postFailedMsg{text, err}` instead of the generic `errMsg{stage: "post"}` that was triggering StageError. The Update handler restores the text into the textarea and sets a transient hint ("message not sent — press Enter to retry · <error>") so the user sees what happened and can just press Enter again once the backend is back. No more lost drafts on a transient `dial tcp: i/o timeout`. 3 tests: restore-text-and-hint on handler path, doesn't-promote-to-StageError, postMessageCmd actually emits postFailedMsg on a 503 from a real httptest server.
- [x] **J6.** Auto-rename session from first user message — `msgPostedAck` now carries the posted text; `autoRenameTitle()` decides whether this qualifies as a first-message rename (session title empty OR `"new session "` prefixed, AND loaded messages contain at most one user message), and dispatches `patchSessionTitleCmd` if so. `derivedTitle()` takes the first line, collapses whitespace, truncates at 60 chars with ellipsis. Result message mirrors the new title into `a.sessions[i]` so the sidebar updates without a refetch. Silent on PATCH failure — the rename is a nicety, not load-bearing, and an angry toast here would be worse than leaving the "new session HH:MM:SS" placeholder. 9 tests: derivedTitle single/multi-line/whitespace/empty/long-truncation, autoRenameTitle default/empty-title/user-set/second-message/unknown-session/empty-text, patch round-trip through httptest, silent swallow on 500.

## Phase K — Protocol transport + operator quality-of-life

- [x] **K1.** Crush adapter Unix socket transport — `--upstream` now accepts `unix:///path/to/sock` alongside TCP URLs. `ResolveUpstream` builds an `http.Client` whose `Transport.DialContext` dials the socket directly; the base URL internally becomes `http://unix` as a placeholder since the Transport intercepts the dial before the URL's host matters. `ResolveUpstreamTransport` is a separate entry for the long-lived SSE path so it can't accidentally pick up the 10 s RPC timeout (SSE needs `Timeout: 0`). Server now carries both the normalised `upstream` (used for URL concatenation) and the original `rawUpstream` (used when the SSE handler re-resolves a fresh Transport per stream). 7 tests: TCP passthrough, trailing-slash strip, Unix scheme custom Transport, empty-upstream safe default, full adapter end-to-end against a real `net.Listen("unix", …)` server returning Crush-shaped JSON, bare-Transport probe against a minimal Unix socket HTTP server, and TCP fallback round-trip via httptest. Skipped on Windows. README + CLI help updated.
- [x] **K2.** Manual session rename from sidebar — `e` on the selected session opens an inline single-line editor pre-filled with the current title. Enter commits (optimistically updates `a.sessions` then dispatches `patchSessionTitleCmd`, reusing J6's PATCH path); Esc cancels; whitespace-only input commits nothing and shows a "rename cancelled" toast so an accidental Enter-after-backspace doesn't clobber a title with "". Hand-rolled editor (not bubbles/textarea) — single-line, arrow keys/Home/End/backspace/delete, rune-indexed so multi-byte characters don't cut mid-sequence. Overlay reuses the workspace/settings modal chrome for visual consistency. Help overlay + paste-blocklist updated. 7 tests cover open-with-prefill, Esc cancel without PATCH, Enter with optimistic update + PATCH, whitespace-only Enter shows toast, backspace/typing, cursor movement (including clamp at column 0), mid-string insertion. Screenshot at `screenshots/18-rename-modal.png`.
- [x] **K3.** Emulator multi-workspace seeding flag — `emulator-server --seed-workspaces=alpha:/repos/alpha,beta:/repos/beta` adds extra workspaces alongside `ws_default` at boot. `parseSeedWorkspaces` accepts `name:/path` entries, tolerates whitespace and empty entries (between commas), and refuses to boot on malformed input — silently-skipped entries would be worse than a noisy boot failure. Entries get IDs from the store so tests aren't sensitive to ID hashing. 12 parser subtests cover empty/single/multi/whitespace/empty-entry-between-commas/no-colon/colon-at-start/colon-at-end/empty-name/empty-path/partial-list-invalid. 2 E2E tests boot the binary and assert extra workspaces appear on /v1/workspaces alongside the default (names seen `default`/`alpha`/`beta` with correct `root_path`), and a second E2E asserts a bad flag value (`no-colon-here`) exits non-zero with the flag name in stderr. Makes the J1 screenshot workflow not need an external `curl` to POST /v1/workspaces before booting the TUI.
- [x] **K4.** Visual session status indicators — leading glyph per sidebar row: animated 10-frame Braille spinner for running (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 125 ms), static `⚠` for waiting_permission, muted `·` for idle, neutral `○` for unknown statuses (forward-compat). Header "●" badge swapped for the same spinner glyph when the selected session is running, a static `⚠` when waiting for permission. `anySessionRunning()` gates a self-rescheduling `tea.Tick` so idle TUIs don't burn frames; the loop re-arms on idle→running transitions observed via `sseEventMsg` (prev state vs new state comparison guarantees exactly one extra Tick is appended rather than two). Caught + fixed a pre-existing bug while wiring: `session.status_changed` events updated `a.currentStatus` but NOT `a.sessions[i].Status`, so the sidebar row used to show "idle" for running sessions. Now the handler keys on payload.session_id so events for sibling sessions (e.g. subagent turns) mirror into the right row. 5 tests: tick advances frame + re-arms while running, tick drains when all idle, `anySessionRunning` reads both header and sidebar paths, `sessionStatusDot` matches each status including unknown, idle→running SSE transition flips state (so a follow-up tick would reschedule). 3 view goldens regenerated. Two fresh screenshots: `19-status-dot-running.png` (spinner in sidebar + header) and `20-status-dot-permission.png` (⚠ on waiting session, · on idle sibling).
- [x] **K5.** Session delete confirmation — `x` now requires a second press within the same session focus to actually commit the DELETE. First `x` sets `a.pendingDeleteSessionID` to the current session and shows a transient hint ("press x again to confirm delete (any other key cancels)"); a second `x` commits and clears the arm. Any non-`x` key at the top of `handleKey` wipes the arm (including navigation), and `selectSession` explicitly clears it so switching between sessions can't accidentally commit the old one's arm. `x` on a different session re-arms for that one instead of committing the stale arm — defensive even though `selectSession` should have already cleaned up. 5 tests cover first-x-arms, second-x-commits-via-real-DELETE-via-httptest-spy, other-key-cancels-through-top-level-handleKey, selectSession-clears-arm, x-on-different-session-rearms-not-commits. No UI render changes — the hint is already the transient banner above the input pane that J5/G9 introduced.
- [x] **K6.** Input history — per-session history ring (cap 100, consecutive-dupe-suppressed) pushed on every Enter-send. `↑` on empty input (or while already navigating) walks back; `↓` walks forward and restores the pre-history draft past the end. With content already in the input AND not already navigating, `↑/↓` fall through to the textarea so multi-line cursor nav still works — disambiguates the common "user typing" case from the "recall" case without an extra keybinding. `historyDraft` captures what was typed before entering history mode so the user can back out without losing work. Any non-nav keypress exits history mode so the next `↑/↓` returns to textarea cursor nav. Per-session storage (`map[sid][]string`) rather than shared across sessions — switching sessions gives you that session's own recall. Help overlay updated. 11 tests cover push edge cases (empty, no-session, dedupe, cap-trim), Prev walks backwards with clamp, Next restores draft and clears state, Next-when-not-navigating no-op, ↑-on-empty enters mode, ↑-with-content passes through, typing exits mode, Enter pushes, per-session isolation.
- [x] **K7.** Emulator `--seed-sessions` flag — `emulator-server --seed-sessions=ws_default=3,ws_alpha=1` creates N placeholder sessions ("seeded session 1", "seeded session 2", …) in each listed workspace at boot. `parseSeedSessions` mirrors `parseSeedWorkspaces`'s shape: whitespace-tolerant, empty-entry-between-commas OK, refuses to boot on malformed input (non-numeric count, zero count, empty ws_id, missing `=`, bad partial list). 15 parser subtests + 3 E2E tests (happy path with 3 seeded + title assertion, unknown workspace id fails boot with the id in stderr, non-numeric count fails boot with the flag name in stderr). Demos of multi-session sidebar behaviour now set up in one flag rather than requiring POST /v1/sessions × N after boot.
- [x] **K8.** Session archive — `A` (capital) on the selected session dispatches `archiveSessionCmd` which PATCHes `archived=true`. On success the Update handler removes the session from `a.sessions`, shows a "session archived" toast, and if the archived session was the selected one it adjusts the selection: prefer the previous sibling (visually less disorienting than jumping down), fall back to index 0 if we were already at position 0, clear selection + tear down SSE if that was the last session. Archiving a session ABOVE the selected one decrements the selection index so the same session stays focused. Soft-fail on PATCH error (J5/K5 pattern): "archive failed: …" toast, no StageError, sidebar unchanged so the user can retry. Stale "archived" event for an unknown session is a no-op. One-way in this iteration — un-archive UX and the "show archived" filter view are a follow-up. Help overlay updated. 6 tests: A dispatches PATCH (spy via httptest captures body has archived=true), success-removes-and-picks-previous, above-selected-decrements-index, last-session-clears-selection, failure-shows-hint-not-StageError, unknown-session-ignored.
- [x] **K9.** Archived view toggle — `h` in the sidebar flips `a.showArchived` and dispatches `reloadSessionsForView` with the matching `archived=` filter. The result falls into the existing `sessionsRefreshedMsg` branch so selection preservation keeps working. In the archived view, `A` sends `archived=false` (un-archive) rather than `archived=true`; the session again drops from the current list. `archiveSessionCmd` gained a `value bool` parameter; `sessionArchivedMsg` carries `archived bool` so the Update handler picks the right verb for the toast ("session archived" vs "session un-archived"; "archive failed" vs "un-archive failed"). Help overlay updated. 5 new tests: `h` dispatches two fetches with/without the archived filter (via spy httptest), `h` without workspace flips flag but skips the fetch, `A` in archived view sends `archived=false` to the PATCH, un-archive hint copy, default-view cases still pass. One test-file discovery surfaced: `KeyPressMsg{Code:'A', Mod: ModShift}` without `Text:"A"` isn't rendered by `k.String()` as `"A"` — needs all three fields matching the existing K8 test pattern.
- [x] **K10.** Copy last assistant message to clipboard — `y` in body focus writes the concatenated text of the newest assistant message to the system clipboard via `github.com/atotto/clipboard` (promoted from indirect to direct). `lastAssistantText()` walks messages in reverse, joins multiple text parts with blank-line separators, fences thinking parts in `<thinking>…</thinking>` so downstream consumers can strip them, and skips tool_call parts (they rarely carry copy-worthy free text). Assistant messages with ONLY tool-calls yield `ok=false` so the user gets a "nothing to copy" toast rather than an empty clipboard. `clipboardWrite` is a package-level var so tests can swap the backend and capture writes; production path calls `atotto.WriteAll`. Soft-fail on clipboard errors (e.g. no xclip installed) — transient "copy failed: <err>" hint, no StageError. Pick of "last assistant" (rather than a message cursor) is pragmatic first-cut; per-message yanks would need a body-level cursor, which is a follow-up. 10 tests cover empty slice, no-assistant-in-slice, most-recent-only selection, multi-part join, thinking fence, tool_call skip, tool-call-only yields false, handler path copies + hint, nothing-to-copy toast, and clipboard-failure toast.
- [x] **K11.** Sidebar session title filter — `/` in sidebar focus opens an inline filter editor; typing appends to `a.sessionFilter` (case-insensitive substring match on title); Enter commits (filter persists, exits edit mode); Esc reverts to the pre-`/` snapshot and exits. Nav (↑↓/jk, g/G, PgUp/PgDn) skips filtered-out sessions via `stepSelectionVisible(delta)` — selections walk through the visible subset in O(sessions) per step, so a filter hiding most entries still navigates naturally. Sidebar renderer takes `visibleSessionIndexes()` for both the scroll math and the selection-is-visible arithmetic; "↑ N more" / "N more ↓" indicators now count visible sessions. When the filter matches nothing, a muted "(no matches)" row appears and `ensureSelectedVisible` deliberately leaves selection alone so clearing the filter restores the user's position. Filter indicator is rendered at the top of the SESSIONS section: bold italic warning-coloured, with a cursor-`_` while editing. 10 tests cover slash-enters-mode, typing-narrows-list, backspace (including empty-safe), Enter-commits, Esc-restores-snapshot, nav-skips-hidden, g-jumps-to-first-visible, ensureSelectedVisible finds-match + empty-match-preserves-position, case-insensitive match.
- [x] **K12.** Emulator `--seed-messages` flag — `emulator-server --seed-messages=ses_a=3` seeds 3 user+assistant placeholder pairs in session `ses_a` (counted as "turns", so N=3 creates 6 messages). Same parser shape as K3/K7 — whitespace tolerance, empty-entry-between-commas OK, refuses to boot on malformed input (non-numeric count, zero/negative, bad partial list). Unknown session ID fails boot with the ID in stderr rather than silently dropping seeds. 15 parser subtests + 2 E2E (rejects-unknown-session, bad-syntax-fails-boot). Honest-coverage note in the test file: the happy-path E2E (chain --seed-sessions → --seed-messages in one boot) isn't exercised at the process level because seeded sessions get hash-based IDs; exposing explicit IDs is a separate follow-up. Interior logic is a straight fold with no branching, so parser + reject + bad-syntax together cover every branch.
- [x] **K13.** Retry last user message — `R` (shift+r) in body focus walks `a.messages` backwards for the most recent user message, concatenates its text parts, and dispatches `postMessageCmd` to resend. No-op + "no user message to retry" hint when no user message exists (or the most recent carries only non-text parts like an image). No-op when no current session. Transient "retrying…" hint confirms the action. Complements J5 which preserved the draft on transient failure — this is the complement for the case where the draft was already sent, accepted, and the agent's response went sideways. Reuses `postMessageCmd` so the response flows through the same pipe (SSE echoes back, cost updates, history append). `lastUserText` helper is parallel to `lastAssistantText` from K10 — same walk-reverse shape, same blank-line join for multi-part, but no thinking-fence path (user messages never carry thinking). 8 tests: empty slice, no-user, most-recent only, multi-part join, image-only yields false, handler dispatches POST via httptest spy on body, no-user shows hint, no-session no-op.
- [x] **K14.** Context files add from TUI — `o` in sidebar focus opens an inline "add to context" prompt (same modal chrome + editor primitives as K2 rename: rune-indexed cursor, arrow/home/end/backspace/delete, Enter to commit, Esc to cancel). Commit POSTs `{path, mode:"read"}` to `/v1/sessions/{id}/context/files`. Result lands as `contextFileAddedMsg`; success mirrors the returned file into `a.contextFiles` so the sidebar reflects it without a refetch. Stale-response guard: only mirrors when `a.currentSessionID() == m.sessionID` (session switch between post and response = drop). Whitespace-only input cancels (empty path would 400 anyway, better to skip the round-trip). Soft-fail on POST error — "add failed: …" toast, no StageError. Removal left to the existing `/drop` slash command (documented in the modal's hint line). Help overlay + paste-blocklist updated. 9 tests: o-key-opens, o-no-session no-op, Enter-POSTs (spy captures path round-trip), empty-path cancels, Esc cancels, typing + backspace cursor math, success mirrors into sidebar, failure shows hint without mirroring, stale response for a switched session is dropped. Screenshot at `screenshots/21-context-add.png`.
- [x] **K15.** Token budget footer polish — footer already showed raw token counts `(15000 in / 600 out)`; replaced with human-readable `humanTokens()` formatting (`1.5K`, `15K`, `150K`, `1.5M` with decimals only below 10× a unit, matching Kubernetes resource-quota conventions). Added threshold colouring: tokens render muted below 100K, warning-yellow at 100K–150K, danger-red at 150K+ — gives users a visual cue before they hit typical frontier-model context-window limits (Sonnet/GPT-4 Turbo are 200K). 16 tests cover the full formatting range including rounding edges (9999 → "10.0K", 10000 → "10K" with the decimal dropped past 10×).
- [x] **K16.** SSE reconnecting indicator — while `a.sseBackoffAttempts > 0` the footer shows `(reconnecting…)` next to the focus label in warning-yellow italic. Piggybacks on J2's existing reset-on-event behaviour — the indicator disappears the instant the stream is healthy, no separate clear path. 2 tests verify hidden-when-healthy and visible-during-backoff via the raw footer render.
- [x] **K17.** Deterministic IDs for seeded sessions — seeded sessions now use `ses_seed_<wsID>_<n>` as their ID instead of the store's default hash-based scheme. Same CreateSession code path; the store accepts caller-supplied IDs. Unlocks chained seeding: `--seed-sessions ws_default=2 --seed-messages ses_seed_ws_default_1=3` in one boot now works because the session IDs are predictable from the flag values. Existing tests keep passing because they only asserted presence, not ID shape.

## Phase L — UX feedback from review (floating overlays, expand/collapse, richer content)

Reviewer feedback captured in `feedback_tui_ux_direction.md`. Items:

- [x] **L1.** Richer default scenario — default script grew three new trigger-based branches: "long"/"explain"/"writeup" → `runLongScript` (≈60-line assistant writeup about rendering strategy, self-referentially discussing the exact compact-vs-dump question L3 targets), "log"/"dump"/"traceback"/"logs" → `runBigToolScript` (shell tool call returning ≈80 lines of synthetic server log, including a panic + retry storm to make skimming easy), "many tools"/"multi tool" → `runMultiToolScript` (three tool calls in one turn: read_file → grep → edit_file). All three terminate cleanly with a final assistant text + idle status. Empty-state crib lists the new prompts so discoverability lands at the same time. 3 smoke tests assert each branch produces the expected events + content shape (e.g. big tool output > 2KB, contains "panic recovered"; multi-tool emits exactly 3 tool.call.completed). Screenshot at `screenshots/22-long-reply.png` shows the current "just dump it all inline" rendering — clean baseline for L3 to improve against.
- [x] **L2.** Floating modal overlays — `overlay()`'s `padOrInsert` was discarding the base row entirely (`prefix + insert`), which is why every modal looked like a black bar across the screen with the window on top. Rewrote as `spliceRow` using `github.com/charmbracelet/x/ansi` (already a transitive dep) to cut base content at display-cell granularity, preserving content LEFT and RIGHT of the modal with a reset-SGR between segments so background colours can't leak past the modal's edges. Base row gets padded with spaces if shorter than `startX`, and a modal that overflows past the base's right edge gracefully drops the right chunk. Introduced `modalWidth()` as a shared constant (72 cells, clamped by `a.width-8`) and migrated every modal view (palette, help, settings, metrics, rename, workspace switcher, context-add) to use it — settings no longer shifts width between "Model" and "Agent" tabs. 6 tests cover: base preserved around centered modal, vertical centering doesn't touch rows outside the modal Y range, short base padded to startX, startX=0 (no left segment), modal past end of base (no right segment), ANSI styling preserved across splice (right-chunk retains expected display width after an SGR reset). Screenshots at `23-floating-settings.png` and `24-floating-workspace.png` show the conversation visible around both modals with identical widths. Unblocks L3 (expand/collapse uses the same floating chrome).
- [x] **L3.** Expand/collapse for bulky parts — tool_result parts that exceed `toolResultPreviewLines` (8) render with a preview of the first 8 lines + `[N more lines — Ctrl+E to expand]` footer in muted italic. `Ctrl+E` from anywhere (non-modal context) opens a floating detail view that reuses L2's chrome. The detail view wraps the content at the modal's inner width, paginates with `↑/↓ · j/k · PgUp/PgDn · g/G`, shows `line X–Y of Z` progress in the title, and closes on `Esc` or `Ctrl+E`. "Most recent bulky" heuristic (`findLatestBulkyPart`) mirrors K10/K13's target-the-newest pattern — a proper part cursor is a follow-up. `flattenToolResult` concatenates the tool_result's text sub-parts. 13 tests cover collapse math (short-passes-through, long-clips-to-N, trailing-newline doesn't inflate), lineCount edge cases, ctrl+E end-to-end (opens with newest bulky, nothing-to-expand toast, Esc closes with scroll reset, up-at-zero clamps, PgDn advances by page size), render emits "N more lines" hint and "Ctrl+E" reference. Screenshots: `27-bulky-collapsed.png` shows the preview, `28-bulky-expanded.png` shows the floating detail opened over the conversation (L2 chrome showing the sidebar + partial convo visible around it), `29-bulky-scrolled.png` shows PgDn paginating through the 130-wrapped-lines output to reveal the panic+retry storm section.
- [x] **L4.** Claude-Code-style conversation demarcation — tool_call parts now render as `ToolName(arg_summary)` headers (`Bash(cd /tmp && ls)`, `ReadFile(main.go)`, `Grep(println)`, `EditFile(main.go)`). `capitalizeToolName()` CamelCases snake_case names. `toolCallSummary()` pulls the primary arg inline for well-known tools (bash/shell → `command`, read/cat → `path`, grep → `pattern`, web_search → `query`); unknown tools fall through to the existing JSON-oneline. Summary truncates with `…)` when the header would exceed the pane width. tool_result parts now lead with `⎿` and continuation lines indent 3 cells so output reads as a block under its call. Errors get a red `(error)` tag on the first line. Thinking parts got the same `⎿ thinking` treatment for visual consistency. Screenshot at `screenshots/25-tool-demarcation.png` shows three consecutive tool calls in the multi-tool scenario rendered as `ReadFile(main.go)` / `Grep(println)` / `EditFile(main.go)` headers. 7 tests cover CamelCase conversion, summary extraction per tool-type (incl. missing-key fallback), basic tool_call shape, width-triggered truncation, tool_result leading glyph + continuation indent, error-tag rendering, thinking glyph. E2E happy path + streaming-golden updated to match new shape. Hiding the still-emitted `● TOOL` role header between tool calls is a follow-up polish pass.
- [x] **L5.** Full slash command surface — `/mcp`, `/tools`, `/skills`, `/agents` now open dedicated modals. `/mcp` and `/tools` hit their respective catalog endpoints and render a kind-agnostic `catalogItem` list (title + description + optional status tag — MCP shows `[connected]`/`[disconnected]`). `/skills` shows a forward-compatible stub since the contract doesn't yet include a skills endpoint; `/agents` redirects into the existing Settings > Agent tab which already has a richer picker. Emulator's static command list grew to include all four entries. Modal state lives on App as `catalogBrowserOpen`/`catalogBrowser`; `catalogCommandForID` maps IDs → kinds so palette-Enter routing is a single line. `loadCatalogBrowserCmd` dispatches the fetch per kind. 2 tests cover ID→kind routing and open→loaded→close state. Screenshots 51-53 show MCP / Tools / Skills views.
- [x] **L6.** Deeper settings modal — expanded from 2 tabs (Model, Agent) to 4 (Model, Agent, Theme, TUI). `settingsTabCount = 4` is a single source of truth so Tab/Shift+Tab wrap-around can't drift. Theme tab: dark/light picker; Enter swaps `a.Theme` via `ThemeForMode` live — same plumbing K9 uses — with a toast noting persistence requires `--theme` flag or config. TUI tab: read-only surface of current runtime config (backend URL, voice cmd, theme, AltScreen state) so users can confirm state without grepping the config file. Ctrl+S pre-seeds `themeSel` to the active theme so re-opens don't regress. Autocompaction + other per-session contract settings deferred to follow-up — they need backend plumbing the emulator doesn't expose yet. 8 tests cover tab cycle + reverse-cycle + wrap, theme ↑/↓ clamps, Enter live-swap, TUI tab Enter closes, themeSel pre-seed on light, themeName + boolPretty. Screenshots `30-settings-theme.png` + `31-settings-tui.png`.
- [x] **L7.** Discoverability — reworked the help overlay from a flat list into five pane-grouped sections: Global, Sidebar, Conversation body, Input, Permission pending. Sidebar manipulation keys (n/x/e/A/h/o/`/`) are now contiguous under one heading so reviewers who ask "can I rename sessions?" see the answer at a glance rather than scanning a 30-row flat list. Added inline notes that were missing before: "press x again to confirm" on delete, "auto-loads messages" on ↑/↓, "un-archive in archived view" on A, "per-session history" on empty-input ↑. Screenshot `26-help-overlay.png` captures the new layout. Help golden regenerated.

## Phase M — Bugs + feature asks from second-round user testing

All items captured in `.claude/projects/-home-jcernuda-tui/memory/feedback_tui_input_and_layout.md` and filed as GitHub issues #1–#7. All closed this iteration.

- [x] **M1.** Footer disappeared on tall conversations (bug). Root cause: renderBody wasn't clipping the message pane to its allotted height; extra rows bled into the footer row. Fixed by clamping every pane to its budget (`clampLines`) and belt-and-braces clamping the final joined view to `a.height`. Test `TestFooter_StaysInFrameOnLongConversation` ensures last row still has the Ctrl+N hint with a 40-message conversation; `TestRenderBody_ReturnsExactHeight` bounds total lines across 4 viewport sizes. Screenshot 32.
- [x] **M2.** Shift+Enter / `\`+Enter inserts a newline (bug). Rebound textarea's `InsertNewline` keymap to `{shift+enter, alt+enter, ctrl+j}` — the default was `{enter, ctrl+m}` which fought our "Enter sends" rule. Also honours trailing-backslash + Enter for Claude-Code muscle memory (`\<Enter>` always works, doesn't need Kitty protocol). Tests: `TestShiftEnter_InsertsNewline`, `TestBackslashEnter_InsertsNewline`.
- [x] **M3.** Paste no longer creates multiple prompts (bug). Added `inPaste` flag set by `PasteStartMsg`/`PasteEndMsg`; while set the Enter interceptor stands down so embedded newlines flow to the textarea instead of flushing. Protects terminals that split paste into KeyPressMsg streams between Start/End events. Test: `TestEnter_InPaste_DoesNotSend`.
- [x] **M4.** Compressed paste display (#1). Pastes ≥ 3 lines render as `[pasted content #N: L lines]` in the input; real body stashed on `App.pastes`. Ctrl+P expands the most recent in-place; Enter auto-expands any surviving placeholder before dispatching. Tests: `TestPaste_MultiLineCompresses`, `TestPaste_ShortPassesThrough`, `TestPaste_CtrlPExpandsLatest`.
- [x] **M5.** Floating compose modal (#2). Ctrl+G (or Ctrl+Shift+P on Kitty-protocol terminals) opens a big textarea seeded with the current draft. Plain Enter inserts newline inside the modal. Ctrl+S commits back; Esc cancels preserving pre-modal draft. Compressed pastes inline on open. Tests: `TestCompose_OpenCommitCancel`, `TestCompose_ExpandsPastesOnOpen`. Screenshots 44-46.
- [x] **M6.** @ file-reference fuzzy picker (#3). `@` at start-of-word opens a workspace-files picker; selection inserts `@path` into the buffer AND attaches the file to the session context (mode=read) via `AddContextFile`. Emulator's static file list grew from 3 to 17 entries so the picker has real material to match. Tests: `TestFilePicker_OpensOnAtAndInserts`, `TestFilePicker_AtMidWordPassesThrough`. Screenshots 48-50.
- [x] **M7.** Scenario discoverability (#4). New "Scenarios" tab in the help overlay lists every trigger keyword with its effect; always reachable via `?` even after the empty-state crib disappears. Screenshot 47.
- [x] **M8.** Slash commands actually execute. Root cause in emulator's `handleSessionCommand`: it only recorded the invocation. Now `/clear` wipes messages (+ `session.cleared` event → TUI reload), `/cancel` halts the run (shared plumbing with cancel endpoint), `/help` / `/diff` / `/undo` emit assistant notes. TUI optimistically clears on `/clear` for instant feedback. Test `TestCommands` verifies `/clear` wipes + `/help` emits an assistant note.
- [x] **M9.** Tabbed help overlay (#7). Split the help list into 5 (now 6 with Scenarios) tabs so it fits at 80x24. ←/→/h/l/Tab navigate. Tests: `TestHelpOverlay_TabCycles`, `TestHelpOverlay_FitsInSmallViewport`. Screenshots 36-40, 47.
- [x] **M10.** Configurable collapse threshold (#6). `Theme.CollapseThreshold` controls the tool_result preview budget; Settings > TUI exposes a ◀/▶ stepper; default lowered from 8 to 5 per user feedback. Test: `TestCollapseThreshold_ArrowKeysAdjust`. Screenshots 41-43.

## Phase O — Themes + ecosystem polish

## Phase U — tiny wins

- [x] **U1.** `gact list --format json` emits indented JSON of the Session slice. `--format tsv` (default) keeps the existing tab output. Unknown format → exit 2.
- [x] **U2.** Window title appends `(running)` or `(waiting)` for non-idle sessions so tab bars surface attention targets without bringing the TUI to the foreground.

## Phase SS — diff CLI

- [x] **SS1.** `gact diff list <sid>` lists every file_diff part in the session (path + pending/applied/rejected); `gact diff apply|reject <sid> [paths...]` invokes the existing apply/reject endpoints. Empty paths means "all pending". CLI test runs the full propose→list→apply→list cycle.

## Phase RR — permissions CLI

- [x] **RR1.** `gact perms {list,allow,deny,allow-session,allow-workspace}` — full permission CLI mirroring the TUI a/d/s/w keys. CLI test triggers a permission scenario, locates the pending id, allows, and verifies resolved status.

## Phase QQ — pretty stream

- [x] **QQ1.** `gact stream [SID] [--workspace WS_ID]` pretty-prints SSE as a one-line timeline (`HH:MM:SS  type  summary`). Per-event-type summary helpers keep `tail` for json + `stream` for humans. Real-emulator CLI test asserts the row format.

## Phase PP — bug-report bundle

- [x] **PP1.** `gact dump-bundle [-o DIR]` writes version.txt + diag.txt + metrics.json + sessions/<sid>.json into one directory. Best-effort (backend offline still produces local-only files). CLI test verifies each artefact lands.

## Phase OO — catalog CLI

- [x] **OO1.** `gact catalog tools|agents|mcp|commands [--format tsv|json]` — single CLI surface spanning all read-side catalog endpoints. Tested for all four kinds + JSON format + unknown-kind exit-2.

## Phase NN — context CLI

- [x] **NN1.** `gact context {list,add,rm} <sid> [path] [--mode]` — verb-then-flags shape (git/kubectl style). Round-trip CLI test exercises list → add ×2 → list → rm → list. Completion scripts list `context`.

## Phase MM — install + scripts dir

- [x] **MM1.** `make install` (with `PREFIX` / `BINDIR` overrides) copies both binaries to `$BINDIR`. `make uninstall` removes them. Tested via `PREFIX=/tmp/...` round-trip.
- [x] **MM2.** `scripts/completion.sh` shell-aware print of `gact completion` install snippet. Bash / zsh / fish supported.

## Phase LL — summary + completion

- [x] **LL1.** `gact summarize <sid>` triggers POST `/v1/sessions/{id}/summarize`, refetches, prints the updated session.summary. Completion scripts updated to list every subcommand. CLI test.

## Phase KK — one-shot scripting

- [x] **KK1.** `gact quick <q|-> [--keep]` — one-shot create + ask + delete. Default workspace via /v1/workspaces[0]. CLI test asserts session count unchanged after run, proving cleanup.

## Phase JJ — observability

- [x] **JJ1.** `gact metrics [--format text|json]` summarises uptime / session counts / token totals / cost. JSON format for scrapers, text for humans. CLI test for both.

## Phase II — archive + completion

- [x] **II1.** `gact archive <sid>` / `gact unarchive <sid>` — flip session.archived. Single runArchive(args, archived bool) handles both. CLI test exercises new → archive (gone) → unarchive (restored).
- [x] **II2.** `gact completion bash|zsh|fish` — static scripts; `gact completion bash > /etc/bash_completion.d/gact` works. CLI test verifies all three shells emit a non-empty script.

## Phase HH — session management CLI

- [x] **HH1.** `gact delete <sid>` removes a session. CLI test asserts the session disappears from `gact list` after.
- [x] **HH2.** `gact rename <sid> <title>` PATCHes the title. CLI test confirms the new title surfaces in `gact list`.

## Phase GG — session creation CLI

- [x] **GG1.** `gact new [--workspace WS_ID] [--title T]` prints the new session id; defaults workspace to first listed and title to current UTC time. CLI test round-trips through `gact list`.

## Phase FF — q&a CLI

- [x] **FF1.** `gact ask <sid> <q|->` — send + wait + print latest assistant reply text. Snapshots pre-send count so it picks the new reply even when subagents fan out. Stdin via `-`. CLI test.

## Phase EE — repo ergonomics

- [x] **EE1.** Top-level `Makefile` with build / test / test-race / vet / fmt / run-emulator / run-tui / ping / list / screenshots / clean / help targets. PORT/THEME/TIMING overridable via env. README quickstart links the targets.

## Phase DD — docs + log

- [x] **DD1.** README "CLI subcommands" section — every Phase T-CC subcommand documented with one-line description + pipe-composition example.
- [x] **DD2.** `gact log <sid> [--limit N]` prints role-headered conversation: text bodies, `→ tool(args)` for tool_call, `⎿ output` for tool_result, `(thinking)` prefix. Plain ASCII (greppable). CLI test asserts USER + ASSISTANT headers and user text appear after a run.

## Phase CC — operator-tools fill-in

- [x] **CC1.** `gact cancel <sid>` POSTs the cancel endpoint. Idempotent. CLI test.
- [x] **CC2.** `gact run <sid> <text|->` combined send+wait. Stdin sentinel via `-`. Honours --timeout / --interval. CLI test.

## Phase BB — scripting follow-ups

- [x] **BB1.** `gact wait <sid> [--timeout] [--interval]` polls status until idle. Exit 2 on timeout. Full CLI test exercises send → wait → verify idle against a real emulator.

## Phase AA — scripting

- [x] **AA1.** `gact send <sid> <text|->` posts a user message; prints the returned `msg_id`. Stdin pipe via `-`. reorderFlagsFirst taught to preserve lone `-` as positional. Full CLI test.

## Phase Z — cursor-aware everything

- [x] **Z1.** `Ctrl+E` respects the Y1 cursor. `findBulkyPartIn(msg)` scans a single message; falls back to `findLatestBulkyPart` when the cursor is off or the selected message has no bulky content.

## Phase Y — body-focus cursor

- [x] **Y1.** Body-focus message cursor (`n` next, `N` prev; idx=-1 off by default). Left-gutter `▌` in Secondary when set; takes precedence over the V3 search marker. Session switch resets.
- [x] **Y2.** d / y / R route through the cursor when set (drop/copy/retry THAT message); fall back to "latest" when the cursor is off. Delete clamps cursor to new last-index. Cursor-on-assistant + R emits a hint rather than sending the wrong text.

## Phase X — CLI + backend surface

- [x] **X1.** `gact tail [SID] [--workspace WS_ID]` streams SSE events as JSON lines (`{"type", "seq", "payload"}`). Kill via Ctrl+C or upstream closing the stream.
- [x] **X2.** `gact ping [-q]` probes `/v1/health`; exits 0 healthy, 1 otherwise. Full CLI tests cover live + unreachable.

## Phase W — session utilities

- [x] **W1.** `/duplicate` creates a fresh session with title+` (copy)` + cloned model + cloned agent. Dispatches sessionCreatedMsg so the new session lands in the sidebar and becomes active. Test + emulator catalog + help entry.

## Phase V — operator tools

- [x] **V1.** `gact export --all -o DIR [--workspace WS_ID]` bulk-exports sessions to one JSON file per session. Tolerates per-session failures; summary to stderr; exit 1 if any failed. Full CLI test against a real emulator binary.
- [x] **V2.** `sseHealthDot()` in the header — green/amber/red glyph keyed to the SSE stage. Users glance-verify the stream without scanning the footer.
- [x] **V3.** `searchHitMessageID` + left-gutter `▶` marker applied when the user hits Enter on a `?search` result. Marker clears on session switch. Per-character highlight within the match string deferred — gutter attention alone was enough without threading the query through glamour.

## Phase T — terminal integration

- [x] **T1.** `tea.View.WindowTitle` set to `GACT — <session title>` (fallback: bare `GACT`). bubbletea's renderer diffs against the previous frame so the escape sequence only fires when the title actually changes. Test covers both branches.
- [x] **T2.** `gact list [--backend URL] [--workspace WS_ID]` prints tab-separated rows (id, status, title, updated_at RFC3339). Pipelines like `gact list | awk '$2=="waiting_permission" {print $1}'` work out of the box.
- [x] **T3.** Emulator `--walk-files` flag. When set AND a workspace's RootPath exists on disk, the handler walks the real tree (up to 2000 entries; skips dotfiles + node_modules + vendor + target). Test covers the happy path and confirms static-demo entries are suppressed in walk mode.

## Phase S — render polish

- [x] **S1.** Body-focus `t` toggles per-message timestamps. Faint-italic row under the role header when on; skipped on tool-result messages whose header is already suppressed. Not persisted (live debugging aid). Test covers both flip states.
- [x] **S2.** Ctrl+E now expands long assistant text too. findLatestBulkyPart extended to consider PartTypeText; title reflects "tool_result · N lines" vs "assistant text · N lines" so the detail view header tells the user which kind they opened. Inline compression of text parts deferred — plain text scrolls fine in the body; this feature is about the paginated detail view entry point.

## Phase R — discoverability + diag

- [x] **R1.** `gact diag` prints version + contract + runtime + platform + config path + every config field + custom theme file status + GACT_* env vars. Non-interactive; exits after printing. Users can paste the output into bug reports without opening the TUI.
- [x] **R2.** Sidebar ends with a faint-italic "N active · M archived" row (flips ordering in the archived view so the first number always matches what's shown). Screenshot 54 confirms.
- [x] **R3.** `gact version` now reads runtime/debug.ReadBuildInfo() and prints the git revision (+ `(dirty)` when vcs.modified is set), commit time, and Go toolchain. Works automatically on any `go install` build.
- [x] **R4.** `gact emit-config` prints a sample config.json to stdout with every field + its default (JSON doesn't allow comments so field names serve as docs). Redirect to `~/.config/gact/config.json` for a starting point.

## Phase Q — polish round four

- [x] **Q1.** README refreshed — theme gallery (Dracula + solarized-light + picker + tokyo-night), custom-theme schema, Phase-M/N/O keymap additions, updated TUI implementation summary.
- [x] **Q2.** `Ctrl+Alt+T` (Kitty-protocol terminals) + `/theme-next` / `/theme-prev` slash commands cycle palettes in-place. CollapseThreshold + cost thresholds preserved across the swap; persists via SaveConfig. Tests cover wrap-around + threshold-survive. No Kitty-free one-key equivalent — `/theme-next` is the portable path.
- [x] **Q3.** Palette surfaces the active state for `/theme /clear /cancel /agent /rename` via `paletteCurrentValue(id)`. Secondary-italic suffix after the title keeps the primary identifier prominent. Test + screenshot 64.
- [x] **Q4.** `/theme-export` serialises the active palette to `~/.config/gact/theme.json`. Round-trip safe with LoadCustomTheme (exported `name` field matches the active ThemeMode). Test `TestExportThemeJSON_Roundtrip` exports Dracula, reloads, asserts Bg RGBA preserved.

## Phase P — polish round three

- [x] **P1.** Per-theme glamour StyleConfig — `glamourStyleFromTheme(Theme)` derives an `ansi.StyleConfig` from the theme's palette (Document/Heading → Fg+Primary, Code → Warning on BgSubtle, Link → Secondary, etc.). Cache keyed by `ThemeModeName + width` so swaps invalidate naturally. Screenshots 60/61 show the result on Solarized-Light and Dracula.
- [x] **P2.** Custom theme import — `~/.config/gact/theme.json` (single file) loaded at startup; palette appended to AllThemeModes as `ModeCustom`; ThemeModeFor checks custom first so user-vs-builtin collisions prefer the user's file. Tests cover load + missing-file + round-trip. Screenshots 62/63.
- [x] **P3.** Cost-meter thresholds configurable — `Theme.CostWarnTokens` / `Theme.CostDangerTokens` (defaults 100K/150K via applyStyles) + config.json fields. Footer colour branch reads from the theme so local-model users can lower thresholds. Stepper rows in Settings > TUI deferred (the array-of-steppers pattern needs its own component; current TUI tab only handles one row).
- [x] **P4.** Collapse hint upweights the Ctrl+E pointer (Secondary + bold) so it matches the footer affordance grammar. Muted-italic wrapper still, but the key itself pops.

- [x] **O1.** Ship 5 new palettes + fix light (#8). Added Dracula, Solarized Dark, Solarized Light, Nord, Tokyo Night. Replaced the horrifying white light theme with a Gruvbox-inspired warm-cream variant. Settings > Theme cycles all 7 palettes with live preview on ↑/↓ and persists the choice via `config.json` (name ⇌ ThemeMode via `ThemeModeName` / `ParseThemeMode`). `ThemeModeFor(theme)` reverse-lookup lets SaveConfig serialise the active palette without tracking mode on the Theme struct. Screenshots 54-59 show each theme applied. Tests updated (`TestSettings_ThemeTabUpDownCycle` walks all 7, `TestThemeName` uses palette-identity matching).

## Phase N — Follow-up polish after second-round feedback shipped

Concrete, small-surface improvements that round out the M-phase features. Each one is tight enough to ship in a single iteration; pick from the top.

- [x] **N1.** Per-session input draft preservation. `swapInputDraftFor(sid)` stashes the outgoing session's buffer and restores the incoming one; successful sends drop the saved draft to prevent resurfacing. `lastLoadedSessionID` field tracks the buffer-owning session so the swap works even though callers update `a.selected` before calling `selectSession`. 2 tests cover A→B→A→B preservation and send-clears-draft.
- [x] **N2.** Two-step /clear confirmation. A true undo path would need a backend restore API that doesn't exist in the contract; the practical defense is to force a second press. First `/clear` arms `pendingClearSessionID` + a "press again to confirm" toast; second press (only if still armed for the same session) actually wipes; anything else cancels. Session switch clears the armed state same as K5's delete pattern. Test: TestClear_RequiresDoubleConfirmation.
- [x] **N3.** Message-level delete — `d` on body focus drops the most recent message (K10/K13 "target latest" pattern, optimistic local removal + background DELETE /v1/messages/{id}). Client grew `DeleteMessage`; `deleteMessageCmd` wraps it as a fire-and-forget tea.Cmd. A per-row cursor would be nicer but costs real complexity; "latest" covers the "I messed up the last turn" case that prompts this feature. Test: TestDeleteLastMessage_DropsLocally.
- [x] **N4.** `/sessions` slash command — focuses the sidebar and pre-arms the K11 title filter so the user can immediately type to narrow the session list. Cheaper than a second dedicated modal and reuses the existing filter code path. Test `TestSessionsSlashCmd_FocusesSidebarFilter` covers the palette-Enter wiring.
- [x] **N5.** Persist Settings > TUI collapse threshold via `config.json`. `Config.CollapseThreshold *int` serialized alongside backend_url/theme/voice_command; `config.Save(cfg, path)` helper writes with 0o755 parent-dir creation + 2-space indent for human diffability. `App.SaveConfig` hook fires on every ◀/▶ stepper click; `App.Theme.CollapseThreshold` seeds from the persisted value on startup. Tests: `TestSaveLoadRoundtrip` + `TestCollapseThreshold_CallsSaveConfig`.
- [x] **N6.** Conformance suite coverage bump. Added three new sections — `Commands_List`, `Tools_List`, `Metrics` — each with a matching `Skip*` flag. Emulator now exercises all of them via `TestE2E_Conformance`; Crush + OpenCode adapters skip them because neither adapter proxies those endpoints yet (tracked as follow-ups in their READMEs). Backends that declare command/tool/metrics capability but return 501 now fail loudly rather than silently passing.
