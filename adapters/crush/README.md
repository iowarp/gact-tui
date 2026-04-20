# gact-crush-adapter

A GACT v0.1 → Crush HTTP adapter. Run between your GACT TUI and a Crush
upstream so the TUI can drive Crush without changes.

```
[ GACT TUI ] ── http (GACT v0.1) ──> [ adapter ] ── http (Crush) ──> [ crush server ]
```

## Install

```sh
# From a clone:
cd adapters/crush/cmd/gact-crush-adapter
go build -o gact-crush-adapter .

# Or globally with go install (once the repo is tagged):
go install github.com/JaimeCernuda/gact-tui/adapters/crush/cmd/gact-crush-adapter@latest
```

You'll also need the [`gact` TUI](../../README.md#install) itself.

## Run

```sh
# TCP upstream:
gact-crush-adapter \
  --upstream http://127.0.0.1:8080 \
  --default-workspace ws_default \
  --port 7779

# Unix-socket upstream (Crush's production default):
gact-crush-adapter \
  --upstream unix:///run/crush/crush.sock \
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
- `GET /v1/sessions/{id}/messages?workspace_id=…` — translates Crush's
  wrapped `{type, data}` parts. text/reasoning/tool_call/tool_result
  pass through with shape conversion; `finish` becomes
  `Message.StopReason`; `image_url`/`binary` map to `image`/`document`;
  unknown types fall through as `x_crush_<type>` per SPEC §8.3.
- `GET /v1/sessions/{id}/events?workspace_id=…` and
  `GET /v1/events?workspace_id=…` — proxy Crush's
  `/v1/workspaces/{wsID}/events` SSE stream. Crush's
  `{type, payload:{type, payload}}` envelope translates to GACT events
  (session.created/updated/status_changed/deleted, message.created/
  updated/deleted, permission.requested/resolved). Unknown payload
  types fall through as `x.crush.<type>` per SPEC §8.4. Per-session
  filter drops crosstalk; heartbeat every 15s.
- `POST /v1/sessions/{id}/messages?workspace_id=…` — translates GACT
  parts into Crush's flat `{session_id, prompt, attachments}` shape
  and forwards to `POST /v1/workspaces/{wsID}/agent`. text parts join
  with newlines; thinking parts are wrapped in `<thinking>` blocks;
  image/document parts with binary base64 sources lift into
  attachments; URL-only image sources are dropped (no fetch); unknown
  part types JSON-fence into the prompt so nothing is silently lost.
  Returns 202 with a synthetic `msg_pending_<ts>` ID — the real Crush
  ID arrives via the SSE `message.created` event.

Everything else returns 501.

## Translation notes

- Crush nests sessions under workspaces; GACT flattens with
  `?workspace_id=`. Pass `--default-workspace` so single-workspace
  deployments don't need to thread the ID on every request.
- Crush timestamps are Unix seconds (not ms — that's OpenCode).
- `--upstream` accepts `http://host:port`, `https://…`, and
  `unix:///path/to/sock`. The Unix form uses a custom `http.Transport`
  whose `DialContext` dials the socket directly; the base URL
  internally becomes `http://unix` but the Transport intercepts the
  dial before the URL's host matters.
- Crush's `yolo`/`debug` workspace flags are surfaced as
  `metadata.x_crush_*` per SPEC §8.2.
- Crush's `prompt_tokens`/`completion_tokens` map to GACT's
  `tokens.input`/`tokens.output`.
- Status defaults to `idle` (Crush's status comes from agent activity
  observed via SSE — wired in a future revision).

## Not yet implemented

| GACT endpoint | Crush mapping | Notes |
|---|---|---|
| permissions | `/v1/workspaces/{id}/permissions/grant` etc. | Crush has rich permission flow. |
| LSP / MCP | `/v1/workspaces/{id}/lsps`, `/mcp/states` | First-party in Crush. |

## Tests

```sh
cd adapters/crush
go test -race -count=1 ./...
```

Mocked Crush upstream — no real Crush required for unit/integration runs.
