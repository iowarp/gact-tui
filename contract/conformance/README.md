# GACT conformance suite

A runnable test harness that hits any GACT-compliant backend via HTTP
and asserts the wire shapes match `contract/SPEC.md`. Point it at a
live URL and it walks the major endpoints.

## What it checks

| Section | Endpoint | Asserts |
|---|---|---|
| `Health` | `GET /v1/health` | 200, `healthy: true`, `uptime_s: int` |
| `Capabilities` | `GET /v1/capabilities` | 200, `contract_version`, `backend.name`, non-empty capabilities map |
| `Workspaces` | `GET /v1/workspaces` | 200, every workspace has an ID |
| `Sessions_List` | `GET /v1/sessions[?workspace_id=…]` | 200, every session has an ID |
| `Sessions_Create` | `POST /v1/sessions` | 2xx, response carries an ID |
| `Messages_Post` | `POST /v1/sessions/{id}/messages` | 200 or 202, response carries a `message_id` |
| `SSE` | `GET /v1/sessions/{id}/events` | 200, `text/event-stream`, at least one `data:` frame within the budget |

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
