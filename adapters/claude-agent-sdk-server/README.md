# gact-claude-agent-sdk-server

A GACT v0.1 sidecar that exposes Anthropic's Python
[`claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-python)
through the GACT REST + SSE contract — so the [GACT TUI](../../) can drive
Claude Code via the same OAuth the SDK already uses on your machine.

```
[ GACT TUI ] ── http (GACT v0.1) ──> [ this sidecar (FastAPI) ] ── Python SDK ──> [ claude CLI ]
                                                                                          │
                                                                                          └── OAuth via your keychain
```

**No API keys to configure.** The sidecar never sees credentials —
`claude-agent-sdk` spawns the `claude` CLI internally, which uses the
OAuth token in your keychain (or `ANTHROPIC_API_KEY` if you've set
one).

## Install

Requires Python 3.11+, [uv](https://docs.astral.sh/uv/), and the
`claude` CLI on PATH (one-time interactive `claude` login to set up
OAuth — get it from [claude.com/code](https://claude.com/code)).

```sh
cd adapters/claude-agent-sdk-server
uv sync           # creates .venv, installs claude-agent-sdk + fastapi + uvicorn
```

You'll also need the [`gact` TUI](../../README.md#install) itself.

## Run

```sh
# Bind the adapter to a workspace directory (Claude Code is cwd-scoped:
# CLAUDE.md, MCP config, tool permissions all key off the directory)
uv run gact-claude-agent-sdk-server --cwd ~/myrepo --port 7780

# In another terminal:
GACT_BACKEND=http://localhost:7780 gact
```

Run multiple sidecars on different ports to drive multiple repos.

### CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--cwd PATH` | `$PWD` | Workspace root passed to the SDK (one cwd → one workspace). |
| `--cli-path PATH` | SDK auto-detect | Override `claude` binary location (PATH lookup + bundled fallback otherwise). |
| `--host HOST` | `127.0.0.1` | Bind interface — use `0.0.0.0` to expose on the LAN. |
| `--port PORT` | `7780` | TCP port. |
| `--log-level LVL` | `info` | uvicorn log level. |

Env-var equivalents: `GACT_CLAUDE_CWD`, `GACT_CLAUDE_CLI`. CLI flags
win on conflict.

## What's wired

Endpoints (SPEC §6):

| Endpoint | Status |
|---|---|
| `GET /v1/health` | ✓ |
| `GET /v1/capabilities` | ✓ |
| `GET /v1/workspaces`, `GET /v1/workspaces/{id}` | ✓ (single synthetic workspace from `--cwd`) |
| `GET /v1/sessions`, `POST /v1/sessions`, `GET /v1/sessions/{id}` | ✓ |
| `GET /v1/sessions/{id}/messages`, `GET /v1/sessions/{id}/messages/{mid}` | ✓ |
| `POST /v1/sessions/{id}/messages` | ✓ (spawns SDK turn in background) |
| `GET /v1/sessions/{id}/events` (SSE) | ✓ (server.connected, message.created, session.status_changed, server.heartbeat) |
| `GET /v1/sessions/{id}/diffs`, `/v1/workspaces/{id}/files`, `/v1/tools`, etc. | not yet wired (cap=false → TUI hides UI) |

Per-session model: one long-lived `ClaudeSDKClient` per GACT session,
held across HTTP requests so the SDK's conversation memory survives
multi-turn flows.

## Test

Three layers:

```sh
uv run pytest tests/test_bridge.py     # SDK→GACT translation (no CLI)
uv run pytest tests/test_endpoints.py  # FastAPI surface (no CLI)
uv run pytest tests/test_smoke.py      # REAL claude-agent-sdk turn against live OAuth
```

Or all at once:

```sh
uv run pytest -v
```

The smoke test auto-skips when `claude` isn't on PATH, so a fresh
clone runs the deterministic tests cleanly. On a logged-in machine it
runs end-to-end against the real Anthropic API in ~4 seconds.

## How it differs from a Go adapter

The other adapters in this repo (`opencode`, `crush`) are Go programs
that proxy a vendor's HTTP server. Claude Code doesn't ship an HTTP
server — its only public interface is the `claude` CLI. The official
Python `claude-agent-sdk` is the canonical typed wrapper around that
CLI; using it directly (instead of re-implementing the JSONL stream
parser in Go) gives us:

- Free updates when the SDK gains support for new Claude Code features
- Typed `AssistantMessage`/`ToolUseBlock`/etc. instead of raw JSON
- The SDK's per-session `ClaudeSDKClient` handles all the subprocess
  lifecycle (spawn, stdin, stdout draining, restart on crash)

Trade-off: this adapter is Python, not Go. But the wire surface
(GACT v0.1) is unchanged, so the TUI doesn't care.

## Roadmap (not yet wired)

- **Tool permissions** — translate `can_use_tool` callbacks into
  GACT permission events so the TUI's `a/d/s/w` flow works.
- **File diffs** — extract `Edit` / `Write` tool calls into GACT
  `file_diff` parts so `a`/`r` apply/reject works.
- **Streaming deltas** — translate the SDK's `StreamEvent` (when
  `include_partial_messages=True`) into GACT
  `message.part.delta` events for char-by-char rendering.
- **MCP, hooks, agents** — pass-through from SDK options.

## License

MIT — see [../../LICENSE](../../LICENSE).
