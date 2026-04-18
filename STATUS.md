# STATUS

**Last updated:** 2026-04-18T05:08Z by autonomous loop iteration 2
**Current phase:** Phase A — emulator skeleton (7/21 tasks done)
**Next task:** PLAN A8 — Messages endpoints (POST 202, GET list with cursor, PATCH part, search)

## Done so far

### Handoff session
- See iteration 0/1 below for setup details.

### Iteration 2 (autonomous)
- **PLAN A5 done.** `internal/store/`:
  - In-memory Store with single sync.RWMutex
  - Workspace/Session/Message CRUD
  - Cursor pagination (newest-first), system-message filter, cascade delete
  - 8 unit tests, all pass
- **PLAN A6 done.** Workspace endpoints (SPEC §6.1): list/create/get/patch/delete; seeded `ws_default`; DisallowUnknownFields. Smoke-tested via curl end-to-end.
- **PLAN A7 done.** Session endpoints (SPEC §6.2): list (filter by workspace_id/parent_session_id/archived), create, get, patch, delete, fork (copies parent messages), cancel, summarize, export, import. **Bug found and fixed:** session.MessageCount was preserved through import causing double-counting → store.CreateSession now resets derived fields (MessageCount/Tokens/CostUSD).

## Currently in progress
- Nothing.

## Blockers
- **Build env note (still applies for future iterations):** Bash subshells initialize from `~/.bashrc`. Go 1.26.2 is wired there. If a future iteration sees `go: command not found` or `go 1.22.2`, prepend `export GOROOT="$HOME/sdk/go1.26.2" && export PATH="$GOROOT/bin:$HOME/go/bin:$PATH"` to the bash command.

## Decisions made (not in SPEC)
- **Emulator routing:** stdlib net/http, Go-1.22+ method-prefixed mux. (iteration 1)
- **Module path:** `github.com/JaimeCernuda/gact-tui/{emulator,tui}` — two modules in one repo. (iteration 1)
- **Single mutex per Store:** simpler than per-resource locks; profile if contention shows up. (iteration 2)
- **Strict request bodies:** `json.DisallowUnknownFields` on all handlers. Vendor extensions go in metadata or under `/v1/ext/...`. (iteration 2)
- **Derived session fields are store-managed:** MessageCount/Tokens/CostUSD reset on CreateSession; AppendMessage increments. Caller-supplied values are ignored on create. (iteration 2)
- **Session cancel/summarize:** in absence of event bus (A10) yet, cancel just sets Status=idle and summarize sets a placeholder. Real semantics arrive with A11 scenario engine.
- **Handler file split:** `handlers.go` (helpers + §3), `handlers_workspaces.go`, `handlers_sessions.go`. New resources get their own file.

## Notes for the next iteration
- A8 is messages — list (cursor pagination, IncludeSystem flag), get one, POST (returns 202 with msg_id), DELETE, PATCH part, search (stub or simple substring scan).
- The POST should accept `{parts: [...], model?: ModelRef}` and return `{message_id, accepted_at}` per SPEC §6.3. The user's message becomes a stored Message immediately; the emulator's scenario engine (A11) will produce the assistant's response asynchronously and stream it via SSE (A9). For A8, just store the user message; assistant response generation comes later.
- After A8, A9 (SSE) is the next big chunk. Sketch: per-client channel, fan-out from a central event bus, heartbeat goroutine. Use `Last-Event-ID` for resume by maintaining a small ring buffer.
- Repo state: 4 commits on main, clean tree.

## Iteration log
| # | Time (UTC) | Tasks | Commits | Tests | Screenshots |
|---|---|---|---|---|---|
| 0 | 2026-04-18T04:45Z | Handoff scaffold | 1 (initial) | — | — |
| 1 | 2026-04-18T04:50Z | A1, A2, A3, A4 | f9b1fd8, ecab7e7 | 3 pass | — |
| 2 | 2026-04-18T05:08Z | A5, A6, A7 | 80036e7, e285f68, (this) | 24+ pass | — |
