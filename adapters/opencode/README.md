# gact-opencode-adapter

A GACT v0.1 → OpenCode HTTP adapter. Run between your GACT TUI and an
OpenCode upstream so the TUI can drive OpenCode without changes.

```
[ GACT TUI ] ── http (GACT v0.1) ──> [ adapter ] ── http (OpenCode) ──> [ opencode server ]
```

## Install

```sh
# From a clone:
cd adapters/opencode/cmd/gact-opencode-adapter
go build -o gact-opencode-adapter .

# Or globally with go install (once the repo is tagged):
go install github.com/JaimeCernuda/gact-tui/adapters/opencode/cmd/gact-opencode-adapter@latest
```

You'll also need the [`gact` TUI](../../README.md#install) itself.

## Run

```sh
# Point at your OpenCode server (default upstream is http://localhost:4096)
gact-opencode-adapter --upstream http://localhost:4096 --port 7778

# In another terminal, run the TUI against the adapter:
GACT_BACKEND=http://localhost:7778 gact
```

## v0.1 scope

Implemented:
- `GET /v1/health`
- `GET /v1/capabilities` (advertises `workspaces`, `sessions` only)
- `GET /v1/workspaces` — synthesises one workspace from OpenCode's `/path`
- `GET /v1/sessions` — proxies `GET /session/`
- `GET /v1/sessions/{id}` — proxies `GET /session/{id}`

Everything else under `/v1/` returns `501 not_implemented` so the TUI
gracefully degrades (it reads `capabilities` and hides UI for absent
features).

## Not yet implemented

| GACT endpoint | OpenCode mapping | Notes |
|---|---|---|
| `POST /v1/sessions/{id}/messages` | `POST /session/{id}/message` | Need to map GACT Part[] → OpenCode message parts. |
| `GET /v1/sessions/{id}/events` (SSE) | `GET /event` (SSE) | Per-session filter + event-shape translation; OpenCode's bus events don't 1:1 our taxonomy. |
| `GET /v1/sessions/{id}/messages` | `GET /session/{id}/message` | Cursor pagination; translate OpenCode parts → GACT parts. |
| `POST /v1/sessions/{id}/cancel` | `POST /session/{id}/abort` | Trivial mapping. |
| `GET /v1/providers`, `/v1/agents`, `/v1/tools` | n/a | OpenCode's analogues live under `/provider`, `/agent`, etc. |
| MCP / permissions / files / diffs | varies | These exist in OpenCode but the wire shapes diverge — case-by-case translation. |

## Translation notes

- OpenCode timestamps are ms-since-epoch; we convert to time.Time UTC.
- OpenCode's `slug`, `projectID`, `directory` are preserved on
  `Session.metadata` as `x_opencode_*` (per SPEC §8.2 vendor prefix rule)
  so a future round-trip can recover them.
- OpenCode's status is computed from agent activity; we report
  `status: idle` until we wire the SSE flow.
- OpenCode's project model is more granular than GACT's workspace; v0.1
  collapses to a single workspace per adapter instance.

## Tests

```sh
cd adapters/opencode
go test -race -count=1 ./...
```

Tests use `httptest` to mock OpenCode upstream — no real OpenCode
required for unit/integration runs.
