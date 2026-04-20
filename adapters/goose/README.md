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

## Status (KKKKKKK2 — scaffold)

Wired:
- `GET /v1/health` (probes upstream `/health`; reports `healthy=false` when goosed is unreachable)
- `GET /v1/capabilities` (advertises `workspaces`; `sessions=false` until KKKKKKK3 wires it)
- `GET /v1/workspaces` (single synthetic workspace from `--workspace-root`)
- `GET /v1/workspaces/{id}` (echoes the synthetic, 404 on mismatch)

Everything else returns `501 not_implemented` so the TUI degrades
gracefully (it reads `capabilities` and hides UI for absent
features).

## Roadmap

- **KKKKKKK3** — Sessions: proxy `GET /sessions` + `GET /sessions/{id}`.
- Subsequent — POST messages, SSE event translation (Goose's `/reply`
  is SSE-native), file diffs from agent-edit tool calls.

## Tests

```sh
cd adapters/goose
go test -race -count=1 ./...
```

Tests use `httptest` to mock the Goose upstream — no real goosed
required for unit tests. End-to-end smoke against a real goosed is
a TODO once the messages path lands (it'd cost an inference call
on the configured Goose provider, so it's not free like the
emulator-backed conformance).
