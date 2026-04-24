# adapters/clio — GACT v0.1 adapter for iowarp/clio-agent

> **Status:** scaffolding only. Tracked by [iowarp/clio-agent#1](https://github.com/iowarp/clio-agent/issues/1) and the CLIO-BBBBBBBBBB phases in [`/PLAN.md`](../../PLAN.md).

## What this is

A Go binary (`gact-clio-adapter`) that makes [iowarp/clio-agent](https://github.com/iowarp/clio-agent) look like any other GACT v0.1 backend, so `gact agent deploy clio my-clio && gact connect my-clio` just works.

Mirrors the shape of [`adapters/claudecode/`](../claudecode) — supervises an external Python process (`clio-agent-api`) and translates GACT ↔ CLIO REST + SSE.

## Architecture (target)

```
┌─────────────┐   GACT v0.1 (REST + SSE)   ┌──────────────────────┐   HTTP    ┌──────────────┐
│  gact TUI   │ ───────────────────────▶   │ gact-clio-adapter    │ ────────▶ │ clio-agent-  │
│ (Bubbletea) │ ◀──── SSE events ─────     │ (this package)       │           │ api (FastAPI)│
└─────────────┘                            └──────────────────────┘ ◀──MCP── └──────────────┘
```

## Protocol mapping (reference)

| GACT | CLIO | Notes |
|---|---|---|
| `POST /v1/sessions` | — | synthesised by the adapter (CLIO is sessionless on the server side) |
| `POST /v1/sessions/{sid}/messages` | `POST /query {question, session_id}` | 1:1, SSE-over-SSE |
| `GET /v1/sessions/{sid}/events` | `GET /query?stream=true` (inside the POST) | translate `routing` / `chunk` / `done` |
| `GET /v1/catalog/agents` | `GET /experts` | direct |
| `GET /v1/health` | `GET /health` | direct |
| `GET /v1/metrics` | `GET /metrics` | direct |
| `POST /v1/sessions/{sid}/cancel` | — | **gap**, best-effort (cancel HTTP, CLIO keeps running) |

Full semantics in [clio-agent's `docs/tui/`](https://github.com/iowarp/clio-agent/tree/develop/docs/tui) on the `develop` branch.

## Provider path for dev

Use [Meridian](https://github.com/rynfar/meridian) as an OpenAI-compatible proxy over Anthropic OAuth so you can drive CLIO with a Claude Max subscription instead of paying for API tokens:

```sh
meridian serve --port 4141 &
export CLIO_LM_PROVIDER=openai
export CLIO_LM_API_BASE=http://127.0.0.1:4141/v1
export CLIO_LM_API_KEY=any-placeholder
export CLIO_LM_MODEL=claude-sonnet-4-5
```

Already proven with Crush / OpenCode / Aider / Cline. The adapter may eventually grow `--auto-meridian` to spawn it alongside `clio-agent-api`.

## Files

| File | Purpose |
|---|---|
| `doc.go` | Package godoc, top-level design notes |
| `client.go` | HTTP client for `clio-agent-api` (placeholder) |
| `server.go` | GACT HTTP server this adapter exposes (placeholder) |
| `translate.go` | GACT ↔ CLIO event conversion (placeholder) |
| `sessions.go` | Adapter-owned session registry (placeholder) |
| `subprocess.go` | Supervisor for `clio-agent-api` child (placeholder) |
| `cmd/gact-clio-adapter/main.go` | Binary entry point (prints "not implemented" today) |

## Next steps

Work proceeds in `/loop` iterations. The next unchecked item is CLIO-BBBBBBBBBB1 in [`/PLAN.md`](../../PLAN.md).
