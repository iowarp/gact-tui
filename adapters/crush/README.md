# gact-crush-adapter

A GACT v0.1 → Crush HTTP adapter. Run between your GACT TUI and a Crush
upstream so the TUI can drive Crush without changes.

```
[ GACT TUI ] ── http (GACT v0.1) ──> [ adapter ] ── http (Crush) ──> [ crush server ]
```

## Build & run

```sh
cd adapters/crush/cmd/gact-crush-adapter
go build -o gact-crush-adapter .

# Crush listens on a Unix socket by default. For v0.1 the adapter speaks
# TCP only — use `crush serve --listen tcp://127.0.0.1:8080` (or an
# equivalent flag) to expose Crush over TCP.
./gact-crush-adapter \
  --upstream http://127.0.0.1:8080 \
  --default-workspace ws_default \
  --port 7779

# In another terminal:
GACT_BACKEND=http://localhost:7779 gact
```

## v0.1 scope

Implemented:
- `GET /v1/health`
- `GET /v1/capabilities`
- `GET /v1/workspaces`
- `GET /v1/workspaces/{id}`
- `GET /v1/sessions?workspace_id=…` — translates Crush's nested
  `/v1/workspaces/{id}/sessions`
- `GET /v1/sessions/{id}?workspace_id=…` — same nesting

Everything else returns 501.

## Translation notes

- Crush nests sessions under workspaces; GACT flattens with
  `?workspace_id=`. Pass `--default-workspace` so single-workspace
  deployments don't need to thread the ID on every request.
- Crush timestamps are Unix seconds (not ms — that's OpenCode).
- Crush's `yolo`/`debug` workspace flags are surfaced as
  `metadata.x_crush_*` per SPEC §8.2.
- Crush's `prompt_tokens`/`completion_tokens` map to GACT's
  `tokens.input`/`tokens.output`.
- Status defaults to `idle` (Crush's status comes from agent activity
  observed via SSE — wired in a future revision).

## Not yet implemented

| GACT endpoint | Crush mapping | Notes |
|---|---|---|
| messages | `/v1/workspaces/{id}/sessions/{sid}/messages` | Need part-shape translation. |
| SSE events | `/v1/workspaces/{id}/events` | Per-session filter + event taxonomy. |
| POST messages | `POST /v1/workspaces/{id}/agent` | Maps to Crush's agent endpoint. |
| permissions | `/v1/workspaces/{id}/permissions/grant` etc. | Crush has rich permission flow. |
| LSP / MCP | `/v1/workspaces/{id}/lsps`, `/mcp/states` | First-party in Crush. |
| Unix socket transport | n/a | TCP only in v0.1. |

## Tests

```sh
cd adapters/crush
go test -race -count=1 ./...
```

Mocked Crush upstream — no real Crush required for unit/integration runs.
