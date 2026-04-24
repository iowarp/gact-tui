// Package clio implements a GACT v0.1 adapter for iowarp/clio-agent.
//
// It follows the same shape as adapters/claudecode/: a Go binary
// supervises an external Python process (clio-agent-api, FastAPI on
// :8000 by default) and translates every GACT REST + SSE primitive
// into the equivalent CLIO call.
//
// Deployment flow (not implemented yet; tracked by the CLIO-BBBBBBBBBB
// phase in /PLAN.md):
//
//  1. Operator runs `gact agent deploy clio my-clio`.
//  2. Main gact CLI finds the `gact-clio-adapter` binary on PATH,
//     allocates a free port, spawns the adapter with
//     `--clio-endpoint http://127.0.0.1:<clio_port>
//      --listen :<adapter_port>`.
//  3. The adapter in turn spawns `clio-agent-api --host 127.0.0.1
//     --port <clio_port>` and supervises it (SIGTERM on exit).
//  4. The adapter serves the GACT contract on `<adapter_port>`,
//     translating each REST call to the upstream CLIO endpoint.
//  5. `gact connect my-clio` reads the registry entry and launches
//     the TUI against the adapter.
//
// Translator responsibilities (see docs at
// https://github.com/iowarp/clio-agent/tree/develop/docs/tui):
//
//   - Synthesise + track session_id state (CLIO is stateless per
//     turn on the sessions axis; the adapter owns the /v1/sessions
//     registry).
//   - `POST /v1/sessions/{id}/messages` → `POST /query` with
//     session_id; stream CLIO's SSE (routing / chunk / done) back
//     as GACT events (`message.part.added` for routing header,
//     `message.part.delta` for chunks, `message.completed` for done).
//   - `GET /v1/catalog/agents` → `GET /experts`.
//   - `GET /v1/health` → `GET /health`.
//   - `GET /v1/metrics` → `GET /metrics`.
//
// Missing upstream (tracked on the CLIO issue
// https://github.com/iowarp/clio-agent/issues/1):
//   - Per-tool SSE events (so tool.call.started / tool.call.completed
//     can fire live instead of post-hoc).
//   - Token streaming (CLIO currently synthesises chunks).
//   - Cancellation (no cancel hook in the ReAct loop).
//
// Provider note: for dev without API costs, run Meridian
// (https://github.com/rynfar/meridian) as an OpenAI-compatible proxy
// over Anthropic OAuth and set `CLIO_LM_PROVIDER=openai` +
// `CLIO_LM_API_BASE=http://127.0.0.1:<meridian_port>/v1`. The adapter
// may eventually grow an `--auto-meridian` flag to spawn it alongside
// clio-agent-api.
package clio
