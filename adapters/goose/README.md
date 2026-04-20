# gact-goose-adapter

A GACT v0.1 → [Goose](https://github.com/block/goose) HTTP adapter.
Goose is a Rust agent that ships a `goosed` HTTP server (axum-based,
default port 3001). Run this adapter between your gact TUI and a
goosed instance so the TUI can drive Goose without changes.

```
[ gact TUI ] ── http (GACT v0.1) ──> [ adapter ] ── http (Goose) ──> [ goosed ]
```

## Install

```sh
# From a clone:
cd adapters/goose/cmd/gact-goose-adapter
go build -o gact-goose-adapter .

# Or globally with go install (once the repo is tagged):
go install github.com/JaimeCernuda/gact-tui/adapters/goose/cmd/gact-goose-adapter@latest
```

You'll also need the [`gact` TUI](../../README.md#install) and a
running goosed.

## Run

```sh
# Start goosed (typical default port 3001)
goose ...

# Adapter
gact-goose-adapter --upstream http://localhost:3001 --port 7781

# In another terminal:
GACT_BACKEND=http://localhost:7781 gact
```

## Status

| Endpoint | Wired? | Notes |
|---|---|---|
| `GET /v1/health` | ✓ | Probes upstream `/health`; reports `healthy=false` when goosed is unreachable. |
| `GET /v1/capabilities` | ✓ | Advertises `workspaces`, `sessions`, `messages`, `sse` (everything wired below). |
| `GET /v1/workspaces` + `/{id}` | ✓ | Single synthetic workspace from `--workspace-root`. |
| `GET /v1/sessions` + `/{id}` | ✓ | Proxies Goose's `GET /sessions` and `/sessions/{id}` with shape translation (name → title, working_dir → metadata, status synthesized as idle). |
| `GET /v1/sessions/{id}/messages` + `/{msg_id}` | ✓ | Reads conversation off the per-id session response and projects each Goose `Message` (text/thinking/toolRequest/toolResponse) to GACT Parts. |
| `POST /v1/sessions/{id}/messages` | ✓ | Translates GACT Part[] → Goose `ChatRequest{user_message, session_id}`, POSTs to `/reply`. Returns 202 immediately; SSE arrives via `GET /events`. |
| `GET /v1/sessions/{id}/events` | ✓ | Per-session SSE fan-out. Translates Goose's `MessageEvent` variants (`Message`, `Finish`, `Error`, `Notification`, `Ping`) into GACT §7.3 events. |

Everything else returns `501 not_implemented` so the TUI degrades
gracefully — it reads `capabilities` and hides UI for absent
features (tools catalog, file diffs, MCP, permissions, etc.).

**Conformance**: 8 sections green against a mocked goosed —
Health, Capabilities, Workspaces, Sessions_List, Sessions_Get,
Messages_Post, Messages_List, SSE.

## Roadmap

- File-diff Parts from agent-edit tool calls (Goose's
  `developer__text_editor` returns the before/after; surface as
  GACT `file_diff` so the TUI's `a`/`r` apply/reject keys light up).
- Permissions flow (Goose's `ToolConfirmationRequest` content
  variant maps onto SPEC §6.11 permission events).
- MCP catalog passthrough from Goose's extension data.
- Real-goosed smoke test (gated on `which goose` like the
  claude-agent-sdk smokes).

## Tests

```sh
cd adapters/goose
go test -race -count=1 ./...
```

Tests use `httptest` to mock the Goose upstream — no real goosed
required. The conformance test stands the adapter against a richer
mock that covers every endpoint `gact conformance` walks (health,
sessions, messages, /reply SSE) and runs the suite end-to-end.
