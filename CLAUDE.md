# GACT TUI — Claude project instructions

This file is loaded into every Claude Code session for this repo. **Read it fully before doing anything.**

## Project

Generic Agentic-Coder TUI (GACT). A Bubbletea-based terminal frontend that connects to any conforming agentic-coder backend via REST + SSE. The contract is in `contract/SPEC.md`. We're also building an **emulator** of that contract for development and testing.

Two Go modules in this repo:
- `emulator/` — HTTP server implementing GACT v0.1, with scriptable scenarios for tests
- `tui/` — Bubbletea TUI client that drives any GACT-compliant backend

## Stack

- Go 1.26+ — install from [go.dev/dl](https://go.dev/dl/) or a package manager; must be on PATH. The repo is a `go.work` workspace, so `go build ./...` / `go test ./...` from the repo root cover every module.
- TUI framework: `charm.land/bubbletea/v2`
- Styling: `charm.land/lipgloss/v2`
- Components: `charm.land/bubbles/v2`
- Layout: `github.com/charmbracelet/ultraviolet/layout`
- Visual loop: VHS (`vhs hello.tape` → PNG), see `notes/` and `.claude/skills/tui-screenshot.md`
- Tests: `github.com/charmbracelet/x/exp/teatest/v2` + `github.com/charmbracelet/x/exp/golden`

## Where things live

- `contract/SPEC.md` — authoritative protocol spec (READ BEFORE TOUCHING EMULATOR OR CLIENT)
- `notes/` — distilled reference for bubbletea, lipgloss, bubbles, ultraviolet, testing, pitfalls
- `.claude/skills/` — reusable workflows (`tui-screenshot`, `tui-test`)
- `research/` — read-only clones of charm repos, crush, opencode, aider, goose, gemini-cli, charmbracelet-x. **Do not modify.**
- `loop-test/` — minimal Bubbletea+VHS proof-of-concept, kept as a reference template
- `STATUS.md` — current build state. **Read at start of every session, update at end.**
- `PLAN.md` — ordered task queue. **Pick the top unfinished item.**
- `screenshots/` — VHS-produced PNGs of the TUI in various states. New work that touches the UI MUST add a screenshot here.

## ABSOLUTE RULES (anti-procrastination)

You — Opus 4.7 — have a documented tendency to procrastinate, defer decisions, and stop early. The user has called this out repeatedly. The following rules are not suggestions:

1. **No deferring.** If a design question comes up, decide it per the rationale in the project's Claude memory (`feedback_decide_dont_defer.md`). Document the decision and move on. Do not write "TBD" or "open question" anywhere except `STATUS.md` blockers section.

2. **No over-research.** Research is done. The contract is written. The notes are written. Build now. If you find yourself reading research/ for more than 5 minutes per session, stop and code.

3. **Difficult-first.** Per `feedback_design_ambition.md`: when faced with a "simple vs ambitious" choice, pick ambitious unless there's a concrete reason not to. We're building the full hierarchical, MCP-aware, sub-agent-capable system.

4. **Visual verification is mandatory for UI work.** If you change anything in `tui/`, you MUST end the session with a fresh `screenshots/<descriptive-name>.png` proving it works. Use the `tui-screenshot` skill. Don't describe the change — show it.

5. **Tests must pass.** Never commit failing tests. Never `t.Skip` to make a build green. If a test won't pass, document the blocker in `STATUS.md` and pick a different task.

6. **Commit and push before stopping.** Every session ends with `git push`. Even partial progress is committed (with `wip:` prefix if not feature-complete). If `git status` shows anything modified at the end of a session, you have NOT stopped correctly.

7. **No early-stopping.** "I finished a task" is not a reason to stop. Pick the next item from `PLAN.md` and keep working until you hit a real blocker (build broken, test infra broken, network down, etc). Even then, document it in `STATUS.md` and try the next-next task.

8. **No scope creep upward.** If you find a refactor that "would be cleaner first", resist. Note it as a follow-up task in `PLAN.md` and keep going. We can refactor when the system is alive.

9. **Real implementations only.** The user's global CLAUDE.md says: "Do not mock or fake implementations outside of tests; all src/ code must be real and functional." Stub endpoints that return `501` are fine; lying endpoints that pretend to work are not.

10. **Commit message style.** Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). One change per commit when possible.

## Build / test commands

```sh
# Whole workspace (go.work covers emulator/, tui/, adapters/*, …)
go build ./...
go test ./...

# Emulator only
cd emulator && go build ./... && go test ./...

# TUI only
cd tui && go build -o gact . && go test ./...

# Run emulator (from emulator/)
./emulator-server --port 7777 --scenario default

# Run TUI against emulator
GACT_BACKEND=http://localhost:7777 ./gact

# Visual loop
cd tui && vhs <tape>.tape   # produces hello.gif + screenshots/...
```

## Memory

User feedback memories live in this project's Claude memory directory. The harness loads `MEMORY.md` automatically. Read the linked files for rules-of-engagement.

## Personal note from the original session

I (the session that set this up) handed off to you. The user is asleep. They will be very disappointed in the morning if STATUS.md says "I researched some more" or "I planned the next phase". They will be happy if STATUS.md says "Built X, tested Y, screenshots show Z, here are the open questions for human review."

Build the thing. The contract has been agonized over. Just build it.
