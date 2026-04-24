# docs_clio — CLIO agent reference for the gact-tui integration

This folder captures everything a gact-tui integrator needs to know about **iowarp/clio-agent** to wire it up as a backend. It was produced by reading the cloned `clio-agent/` tree (which is gitignored in this repo) end-to-end — not rewritten from memory.

## Reading order

| # | Doc | When to read |
|---|---|---|
| 01 | [Overview](01-overview.md) | What CLIO is, who it's for, 30-second mental model |
| 02 | [Agent graph](02-agent-graph.md) | How a single turn flows end-to-end |
| 03 | [Experts](03-experts.md) | What an Expert is, current roster, routing |
| 04 | [ARC memory](04-arc-memory.md) | Persistent memory layout + what to surface in the TUI |
| 05 | [Tools](05-tools.md) | The FastMCP gateway + every tool catalogued |
| 06 | [Endpoints](06-endpoints.md) | CLI + REST API + MCP surface |
| 07 | [Providers + config](07-providers-config.md) | LM providers matrix + env-var reference |
| 08 | [Semantics + lifecycle](08-semantics-and-lifecycle.md) | Behavioural pins from the test suite |
| 09 | [Integration plan](09-integration-plan.md) | How gact-tui actually hooks in |

## TL;DR for someone who just wants to build the adapter

- CLIO ships **`clio-agent-api`** — FastAPI server on `:8000` with `POST /query`, `GET /health`, `GET /experts`, `GET /metrics`. That's the TUI's main interface.
- One turn = `POST /query {question, session_id}` → `{answer, selected_expert, duration_ms, error_info}`. Add `stream: true` for an SSE feed with `routing` / `chunk` / `done` events.
- Routing is deterministic-first (filename heuristics) with a DSPy LM router fallback; selects one of `data` / `analysis` / `visualization` / `chat` / `none`.
- CLIO doesn't issue `session_id`s — the adapter/TUI owns them.
- Cancellation, per-tool SSE events, and token streaming are **not** available today. Plan to fall back to post-hoc rendering, and upstream these as Phase 4 of the integration (see `09-integration-plan.md`).
- The pattern to follow is `adapters/claudecode/` — Go adapter binary that supervises the Python `clio-agent-api` subprocess, translates REST+SSE into GACT v0.1.

## What the docs don't cover

- The SIMBA optimiser internals (enough in `08` for integration; deeper context in `clio-agent/docs/SELF_IMPROVEMENT.md` upstream).
- DSPy signatures in detail (treat as implementation detail — `CLAUDE.md` Rule 3 in `clio-agent/`).
- IOWarp CTE storage tiers (automatic; not the TUI's concern).

## Source location

The clone itself lives at `/home/jcernuda/tui/clio-agent/` — gitignored by this repo so it doesn't get republished. Regenerate with:

```sh
cd /home/jcernuda/tui
gh repo clone iowarp/clio-agent
```
