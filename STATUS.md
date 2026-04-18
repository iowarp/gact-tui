# STATUS

**Last updated:** 2026-04-18T04:50Z by handoff session (manual iteration)
**Current phase:** Phase A — emulator skeleton (4/21 tasks done)
**Next task:** PLAN A5 — internal storage layer

## Done so far

### Handoff session (humans-in-the-loop, before sleep)
- Surveys: Crush, OpenCode, Aider, Goose, Gemini CLI, MCP spec, Anthropic Messages API + Agent SDK
- `notes/` reference pack (bubbletea, lipgloss, bubbles, ultraviolet, testing, pitfalls)
- `.claude/skills/` (`tui-screenshot`, `tui-test`)
- Visual feedback loop verified end-to-end via `loop-test/`
- GACT v0.1 contract spec at `contract/SPEC.md` (§10 = Decisions and Rationale, all 10 questions resolved)
- CLAUDE.md with anti-procrastination rules
- PLAN.md ordered task queue (Phases A–F)
- This STATUS.md
- Private GitHub repo: https://github.com/JaimeCernuda/gact-tui
- Cron `9984ef23` scheduled (every 30 min at :17 and :47, durable)

### Manual handoff iteration (this session, validating workflow)
- **PLAN A1–A4 done.** Emulator scaffold:
  - `emulator/go.mod` (stdlib net/http, google/uuid)
  - `emulator/pkg/gact/types.go` (wire types)
  - `emulator/internal/server/{server.go,handlers.go,server_test.go}`
  - `emulator/cmd/emulator-server/main.go`
  - `go test ./...` passes (3 test cases)
  - Smoke-tested with curl: /v1/health, /v1/capabilities, 404 routing all green

## Currently in progress
- Nothing.

## Blockers
- **Build env note:** Bash subshells initialize from `~/.bashrc` (not `~/.zshrc`). Go 1.26.2 PATH was added to `.bashrc` this iteration. Subsequent cron iterations should pick this up automatically. If a future iteration sees `go: command not found` or `go 1.22.2`, set `export GOROOT="$HOME/sdk/go1.26.2" && export PATH="$GOROOT/bin:$HOME/go/bin:$PATH"` at the top of the iteration's bash work.

## Decisions made (not in SPEC)
- **Emulator routing:** stdlib `net/http` Go-1.22+ method-prefixed mux. No chi/gorilla. Reason: zero deps, fast, sufficient for our route count.
- **Module path:** `github.com/JaimeCernuda/gact-tui/emulator` for emulator and (future) `.../tui` for the TUI. Two modules in one repo, one push origin.
- **`go` directive:** `1.25.0` in emulator/go.mod (compatible with installed 1.26.2; minimum-supported Go for callers).

## Notes for the next iteration
- Pick PLAN A5 (storage layer). Suggested shape: `internal/store/store.go` with `Store` struct holding `map[ID]*Workspace`, `map[ID]*Session`, `map[ID]*Message`, sync.RWMutex per resource. Constructor returns a Store; each handler takes a `*Store` (or store is owned by `*Server`). Add `*Store` to `Server` struct.
- After A5, A6 (workspaces CRUD) is straightforward. By end of next iteration aim for A5 + A6 + tests.
- Don't forget: every committed change MUST run `go test ./...` and that MUST pass.
- The `tui/` module doesn't exist yet. Phase A focuses on emulator only; tui scaffolding starts at C1.

## Iteration log
| # | Time (UTC) | Tasks | Commits | Tests | Screenshots |
|---|---|---|---|---|---|
| 0 | 2026-04-18T04:45Z | Handoff scaffold | 1 (initial) | — | — |
| 1 | 2026-04-18T04:50Z | A1, A2, A3, A4 | 1 (`f9b1fd8`) | 3 pass | — |
