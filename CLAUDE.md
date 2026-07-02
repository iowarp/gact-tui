# GACT TUI — Claude project instructions

This file is loaded into every Claude Code session for this repo. Read it before doing anything.

## Project

Generic Agentic-Coder TUI (GACT). A Bubbletea-based terminal frontend that connects to any
conforming agentic-coder backend via REST + SSE. The protocol source of truth is
`contract/SPEC.md` (plus the conformance suite next to it). The canonical backend is
[iowarp/clio-agent](https://github.com/iowarp/clio-agent); an emulator of the contract exists
for development and testing.

## Repo layout (as it actually is)

Go workspace — `go.work` has **seven modules**:

- `emulator/` — HTTP server implementing the GACT contract, scriptable scenarios for tests
- `tui/` — Bubbletea TUI client; `internal/{client,config,intro,plugins,ui,version}`
- `adapters/opencode`, `adapters/crush`, `adapters/goose`, `adapters/claudecode` — Go adapters
  that translate other agent backends onto the GACT wire contract
- `contract/conformance` — conformance test suite for the spec

Not in `go.work`:

- `contract/SPEC.md` — authoritative protocol spec. **Read before touching emulator, adapters,
  or client wire code.**
- `adapters/claude-agent-sdk-server/` — Python adapter (uv-managed, pytest tests)
- `apps/` — pnpm workspace (packages: `core`, `web`, `desktop`) plus `design/` and `branding/`
  (brand mechanism — see `apps/branding/README.md`)
- `visual_loop/` — Python visual-audit harness (`.tape` sources, checker scripts). Run outputs
  (`tui_audit_*/` dirs, logs, session dumps) are untracked and regenerable — never commit them.
- `notes/` — distilled reference for bubbletea, lipgloss, bubbles, ultraviolet, testing, pitfalls
- `.claude/skills/` — reusable workflows (`tui-screenshot`, `tui-test`, `release`, ...)
- `screenshots/` — curated VHS-produced captures (`screenshots/README.md` is the index).
  UI-touching work must add or refresh a screenshot here.
- `docs/` — feature docs; `docs/archive/` holds historical work-logs (PLAN.md, STATUS.md, ...)
- `research/` — read-only clones for reference. **Do not modify.**
- `loop-test/` — minimal Bubbletea+VHS proof-of-concept, kept as a reference template

## Status and reporting

- Durable status lives in **GitHub issues and PRs** — not in root markdown files.
- One-shot agent reports/analyses go to `docs/archive/` or into the relevant issue.
  **Never create new root-level report files.**

## Cleanup program (2026-07 audit)

The nine-reviewer audit and its fix program are tracked in umbrella issue
[#237](https://github.com/iowarp/gact-tui/issues/237) (pointer doc:
`docs/system-cleanup-2026-07.md`; master plan lives in iowarp/clio-agent
`docs/design/system-cleanup-2026-07.md`). Two ground rules from it apply to all new code:

1. **No silent fallback.** When something fails or is unavailable, surface a structured
   reason — do not silently substitute defaults, swallow errors, or fake success.
2. **No accretion.** The `tui/internal/ui` package split is pending
   ([#234](https://github.com/iowarp/gact-tui/issues/234)). New UI code goes into the
   seam-named file clusters that exist (e.g. `catalog_browser_*`, `conversation_*`,
   `command_palette_*`) —
   do not add new god files or grow unrelated code into existing ones.

## Build / test quickstart

`make help` lists everything. The main targets (all verified in the Makefile):

```sh
make build          # build emulator + TUI binaries into bin/
make test           # unit + integration tests for every go.work module
make test-race      # same under -race
make vet            # go vet every module
make fmt            # gofmt every module
make run-emulator   # run the emulator (PORT=7777 by default)
make run-tui        # run the TUI against http://localhost:$(PORT)
make screenshots    # render every VHS tape under tui/ into screenshots/
```

Direct Go commands also work from the repo root thanks to `go.work`:
`go build ./...` / `go test ./...`.

Python adapter: `cd adapters/claude-agent-sdk-server && uv sync && uv run pytest`.
Apps: `cd apps && pnpm install && pnpm -r build` (see `apps/CLAUDE.md` for specifics).

## Working rules

1. **Tests must pass.** Never commit failing tests; never `t.Skip` to make a build green.
2. **Visual verification for UI work.** Changes under `tui/` end with a fresh screenshot
   (use the `tui-screenshot` skill). Don't describe the change — show it.
3. **Real implementations only.** Stub endpoints returning `501` are fine; endpoints that
   pretend to work are not.
4. **Conventional commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
   One change per commit when possible.
5. **Spec first.** Wire-visible behavior changes start in `contract/SPEC.md` and the
   conformance suite, then propagate to emulator, adapters, and clients.

## Memory

User feedback memories live in this project's Claude memory directory. The harness loads
`MEMORY.md` automatically; read the linked files for rules-of-engagement.
