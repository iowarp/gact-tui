# GACT conformance suite

A runnable test harness that hits any GACT-compliant backend via HTTP
and asserts the wire shapes match `contract/SPEC.md`. Point it at a
live URL and it walks the major endpoints.

## What it checks

Sections are listed in the order they run. Each is skippable via the
matching `Options.Skip*` flag.

### Always-on (non-cap-gated)

| Section | Endpoint(s) | Asserts |
|---|---|---|
| `Health` | `GET /v1/health` | 200, `healthy: true`, `uptime_s: int` |
| `Capabilities` | `GET /v1/capabilities` | 200, `contract_version`, `backend.name`, non-empty capabilities map |
| `Workspaces` | `GET /v1/workspaces` + `/v1/workspaces/{id}` | list 200 + non-empty IDs; per-id echoes id + non-empty `root_path` (GGGGGG1) |
| `Sessions_List` | `GET /v1/sessions[?workspace_id=…]` | 200, every session has an ID |
| `Sessions_Create` | `POST /v1/sessions` | 2xx, response carries an ID |
| `Sessions_Get` | `GET /v1/sessions/{id}` | 200, id echoed, non-empty status (HHHHHH1) |
| `Messages_Post` | `POST /v1/sessions/{id}/messages` | 200 or 202, response carries a `message_id` |
| `Messages_List` | `GET /v1/sessions/{id}/messages` + `/messages/{msg_id}` | 200 + non-nil `messages` array; per-entry `{id, role, parts}` with role in `{user\|assistant\|system\|tool}`; first-message drill echoes id (IIIIII1) |
| `SSE` | `GET /v1/sessions/{id}/events` | 200, `text/event-stream`, first complete event has `event:` line + `data:` JSON with matching `type` per SPEC §7.2 (NNNNNN1) |
| `Commands_List` | `GET /v1/commands` | 200, every command has an `id` |
| `Tools_List` | `GET /v1/tools` + `/v1/tools/{id}` | list 200 + each entry has `{id, name}`; first-tool drill echoes id + non-empty name (EEEEEE1) |
| `Metrics` | `GET /v1/metrics` | 200 + `uptime_s` + structural envelope: `sessions/messages` carry `total`, `tokens` carries `input_total`/`output_total` (MMMMMM1) |
| `Agents` | `GET /v1/agents` + `/v1/agents/{id}` | 200 + non-nil `agents` array; per-entry `{id, source, title}` with source in `{builtin\|user\|recipe\|skill}`; first-agent drill echoes id + non-empty source/title (DDDDDD1, FFFFFF1) |

### Capability-gated (auto-skip when the cap is `false`)

| Section | Cap | Endpoint(s) | Asserts |
|---|---|---|---|
| `Hooks` | `hooks` | `GET /v1/hooks`, `POST /v1/hooks`, `DELETE /v1/hooks/{id}` | full create/list/delete cycle |
| `Policies` | `permissions` | `GET /v1/policies`, `PUT /v1/policies` | round-trip a single allow rule |
| `Tasks` | `session_tasks` | `POST /v1/sessions/{id}/tasks`, `GET`, `DELETE` | create/list/delete cycle |
| `Mcp` | `mcp` | `GET /v1/mcp/servers` + `/{id}` + `/{id}/tools` + `/{id}/resources` + `/{id}/prompts` | list shape + per-server detail + tools/resources/prompts (BBBBB1, JJJJJJ1, LLLLLL1) |
| `Providers` | `providers` | `GET /v1/providers` + `/{id}` + `/{id}/models` | list shape + per-provider detail + per-provider models (TTTTT1, KKKKKK1) |
| `Files` | `files` | `GET /v1/workspaces/{id}/files` | 200 + `entries` array, each entry has `path` + `type` in `{file\|dir}` (UUUUU1) |
| `Diffs` | `diffs` | `GET /v1/sessions/{id}/diffs` | 200 + non-nil `diffs` array, each entry has required `{path, applied}` (BBBBBB1) |
| `Messages_Diffs` | `diffs` | `GET /v1/sessions/{id}/messages/{msg_id}/diffs` | same shape as `Diffs`, gated on first message id (CCCCCC1) |

501 from an un-skipped section counts as a failure. Silently tolerating
501 would defeat the purpose — if the backend doesn't implement a
section, skip it explicitly via `Options`.

## Usage

Drop it into the adapter's test file:

```go
import (
    "testing"

    "github.com/JaimeCernuda/gact-tui/contract/conformance"
)

func TestMyAdapterConformance(t *testing.T) {
    srv := startMyAdapter(t)
    defer srv.Close()

    conformance.Run(t, srv.URL, conformance.Options{
        // Only implemented the read path? Skip the rest.
        SkipCreateSession: true,
        SkipPostMessage:   true,
    })
}
```

The suite uses `t.Run` for each section, so failures stay isolated and
individual sections can be re-run via `-run`.

## Running it against the emulator

The suite ships a self-test that shells out to the built emulator
binary. If the binary isn't present, the test skips (so a fresh clone
can still `go test ./contract/conformance/...` without failing).

```sh
# Build the emulator first:
cd emulator && go build -o ./emulator-server ./cmd/emulator-server

# Then:
cd ../contract/conformance && go test -race -count=1 ./...
```

## Design notes

- **Module-independent.** `contract/conformance/go.mod` has no external
  deps — just stdlib. Adapter authors don't inherit the TUI's huge
  Bubbletea dep graph by adopting the suite.
- **HTTP, not an SDK.** The suite talks raw `net/http` on purpose. The
  point is to validate the wire contract, not an SDK's ergonomics.
- **Options are allow-lists framed as skip flags.** Every section is
  on by default. Callers opt out explicitly so we never "pass" a
  backend by accident.
- **Budget-bounded.** SSE probe waits up to `SSEBudget` (default 3 s)
  for the first `data:` frame. Every other section uses `HTTPTimeout`
  (default 10 s).
