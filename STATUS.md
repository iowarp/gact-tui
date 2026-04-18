# STATUS

**Last updated:** 2026-04-18T05:50Z
**Current phase:** Phase D (TUI tests / golden snapshots)
**Repo:** https://github.com/JaimeCernuda/gact-tui — main is `f9566bf` and ahead

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
