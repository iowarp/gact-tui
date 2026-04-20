# gact-claudecode-adapter

A GACT v0.1 → Claude Code adapter. Drives Anthropic's `claude` CLI in
stream-json mode, using the same OAuth that Claude Code already uses
locally — **no API keys to configure**, no tokens to paste.

```
[ GACT TUI ] ── http (GACT v0.1) ──> [ adapter ] ── stdio (stream-json) ──> [ claude CLI ]
                                                                                    │
                                                                                    └── OAuth via your keychain
```

The adapter is functionally equivalent to the Python `claude-agent-sdk`
library (which is itself a thin wrapper around `claude --output-format
stream-json`). Going through the CLI directly keeps the repo all-Go and
inherits all of Claude Code's per-cwd config (CLAUDE.md, MCP servers,
tool permissions).

## Install

Requires the `claude` CLI on PATH. Get it from
[claude.com/code](https://claude.com/code) and authenticate once
interactively (`claude` then complete the OAuth flow).

```sh
# From a clone:
cd adapters/claudecode/cmd/gact-claudecode-adapter
go build -o gact-claudecode-adapter .

# Or globally with go install (once the repo is tagged):
go install github.com/JaimeCernuda/gact-tui/adapters/claudecode/cmd/gact-claudecode-adapter@latest
```

You'll also need the [`gact` TUI](../../README.md#install) itself.

## Run

```sh
# Bind the adapter to a workspace directory (Claude Code is cwd-scoped)
gact-claudecode-adapter --cwd ~/myrepo --port 7780

# In another terminal:
GACT_BACKEND=http://localhost:7780 gact
```

Run multiple adapters on different ports to drive multiple repos.

## Status (DDDDDDD1 — scaffold)

Wired:
- `GET /v1/health`
- `GET /v1/capabilities` (advertises `workspaces`, `sessions`; rest false until wired)
- `GET /v1/workspaces` (single synthetic workspace from `--cwd`)
- `GET /v1/workspaces/{id}` (echoes the synthetic workspace)

Everything else returns `501 not_implemented` so the TUI degrades
gracefully — it reads `capabilities` and hides UI for absent features.

## Roadmap

- **DDDDDDD2** — sessions: in-memory session table; `POST /v1/sessions`
  creates a row, `GET /v1/sessions[/{id}]` lists/echoes.
- **DDDDDDD3** — messages: `POST /v1/sessions/{id}/messages` spawns
  `claude -p --output-format stream-json --input-format stream-json
  --verbose` for the session and writes the user message; reads JSONL
  events; caches the assistant message.
- **DDDDDDD4** — SSE: `GET /v1/sessions/{id}/events` translates each
  Claude stream-json event into a GACT §7.3 event (`text` →
  `message.part.delta`, `tool_use` → `tool_call`, `tool_result` →
  `tool_result`, `result` → `session.status_changed: idle`).
- **DDDDDDD5** — conformance: a mock `claude` shell script emits canned
  stream-json so the conformance test runs without OAuth or network.

## Auth model

The adapter never sees credentials. `claude` resolves auth in this
order (per its own help text):

1. `ANTHROPIC_API_KEY` env var (if set)
2. `apiKeyHelper` in `~/.claude/settings.json`
3. OAuth token from the OS keychain (the default after
   `claude` interactive login)

So the adapter "just works" on a machine where `claude` already does.

## Tests

```sh
cd adapters/claudecode
go test -race -count=1 ./...
```

Server tests use `/usr/bin/true` as a mock claude binary so they don't
require a real CLI install. Subprocess-spawning tests (DDDDDDD3+)
will use a shell-script mock that emits canned stream-json events.
