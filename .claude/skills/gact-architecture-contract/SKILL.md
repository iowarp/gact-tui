---
name: gact-architecture-contract
description: Load-bearing architecture decisions of gact-tui and WHY they exist — the three-tier contract system (reality leads, spec documents, conformance enforces), the two coexisting wire dialects, invariants that must never be broken, and known weak points. Load this BEFORE changing anything wire-visible (SSE handling, wire types, capability gating, streaming/transcript logic on any surface), before "fixing" behavior that looks inconsistent between the emulator and clio, or when you need to know whether a design constraint is deliberate or accidental. Keywords: SPEC.md, contract, capabilities, dialect, final_text, replay, invariant, emulator vs clio, parity.
---

# gact-architecture-contract

Why this codebase is shaped the way it is. Every section states a decision,
the reason, and what breaks if you violate it. Facts below were verified
against the repo on 2026-07-06; volatile ones are date-stamped and have
re-verification one-liners at the end.

**Vocabulary used throughout** (defined once):

- **GACT** — Generic Agentic-Coder TUI: a wire contract (REST + SSE) that lets
  any client drive any conforming agent backend.
- **clio** — the reference backend, [iowarp/clio-agent](https://github.com/iowarp/clio-agent)
  (in code it is `clio-agent-gact`). In prose say "clio" or "the agent backend".
- **SSE** — Server-Sent Events, the one-way HTTP streaming transport used for
  live events (`text/event-stream`).
- **emulator** — `emulator/`, an in-repo Go HTTP server implementing the GACT
  contract with scriptable scenarios, used for development and tests.
- **conformance suite** — `contract/conformance/`, a Go test suite that probes
  a live backend for contract compliance.
- **surface** — one of the three end-user clients: TUI (`tui/`), web
  (`apps/web/`), desktop (`apps/desktop/`, a Tauri shell around the web app).

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| Endpoint/event/payload lookup while coding against the wire | **gact-wire-protocol-reference** |
| How to classify/gate/review a change; commit and PR conventions | **gact-change-control** |
| Triage of a live failure (symptom → experiment) | **gact-debugging-playbook** |
| History of a past investigation or revert | **gact-failure-archaeology** |
| Running the emulator/TUI/web/desktop | **gact-run-and-operate** |
| Executing the cross-surface parity campaign | **gact-interface-parity-campaign** |
| Bubbletea/lipgloss idioms, golden tests, VHS tapes | **gact-bubbletea-reference** |
| Web/desktop rendering internals (smd, Live* engine, brand system) | **gact-web-rendering-reference** |

---

## 1. The three-tier contract system

Three tiers, one direction of authority:

1. **Reality leads** — clio's actual wire is the contract.
2. **Spec documents** — `contract/SPEC.md` (v0.2, 2,284 lines as of 2026-07-06)
   describes that wire. It is explicitly *descriptive*, not aspirational.
3. **Conformance enforces** — `contract/conformance/` asserts the documented
   shapes against a live backend, including the drift classes that already
   bit clients once.

This direction was an explicit owner decision, quoted from
`docs/system-cleanup-2026-07.md` (2026-07-01):

> The GACT contract (`contract/SPEC.md`) drifted because it was never updated
> while the implementation evolved. **Convergence direction: re-reconcile the
> spec to today's implementation** (reality leads, spec documents, conformance
> enforces) — do not regress code to the stale documented contract. Exception:
> where the implementation is self-contradictory (`message.created` nesting
> fork #229, inconsistent error tags, capability flags that lie), pick the
> coherent current behavior and codify it.

Concretely: SPEC.md was reconciled to clio `develop @ 3527143` in commit
`59d136d2` "docs(contract): reconcile SPEC.md to clio reality; conformance
asserts the drift classes (#247)". The spec header states: *"this spec is
descriptive — reality leads. When the reference backend and the prose diverge,
the backend's wire is the contract and the prose gets rewritten to match it."*

The spec marks two content classes inline — respect both:

- **Vendor extensions**: everything `x_clio_*`, the `semantic.event` spine,
  clio-only endpoints. Optional. A generic client MUST run without them.
- **`[NOT IMPLEMENTED in clio 3527143]`**: valid spec surface clio does not
  serve (global `/v1/events`, `POST /summarize`, several events). Do not
  depend on it against clio.

**What this means for you**: if you find code disagreeing with SPEC.md, the
question is never "which do I trust" — capture clio's real wire (see
gact-proof-and-analysis-toolkit) and reconcile *the spec* to it, then the
code, then add a conformance check so the drift becomes CI-impossible. The
protocol-convergence epic is iowarp/gact-tui#232 (OPEN as of 2026-07-06);
the umbrella cleanup program is iowarp/gact-tui#237.

Where conformance actually runs (as of 2026-07-06): CI runs it **against the
emulator only** (`contract/conformance/conformance_test.go` boots a fresh
emulator). The only path to run it against a live backend is the CLI:

```powershell
# from repo root, backend running
go run ./tui conformance --backend http://localhost:7800
```

`conformance.Run` has exactly two callers: that CLI (`tui/cli_diagnostics.go`)
and the emulator self-test. **Conformance passing against the emulator does
NOT mean the emulator behaves like clio** — the capability-truth check is
self-relative (each backend's flags vs its own routes), and the emulator
serves routes clio truthfully denies (see §3).

---

## 2. Capability discovery gates every feature

`GET /v1/capabilities` returns `contract_version` (`"0.2"` from clio and the
emulator) plus a boolean flag map and richer-valued `x_clio_*` vendor flags.
SPEC §3.3 codifies the **bidirectional truthfulness rule**:

- flag `true` ⇒ the route is registered and works;
- flag `false` (or absent) ⇒ the route returns 404/501, and **the client MUST
  hide the UI affordance**.

This holds unconditionally for clio since its Phase-0 fixes (clio #760/#782 —
`session_summary` and `attachments_upload` are now truthfully `false`).
The conformance suite probes capability↔route truth (`drift_checks.go` check
1 — explicitly the check that would have caught the earlier over-claim, where
the TUI's compact command hit a 404 `/summarize`, iowarp/gact-tui#224).

**Why it is the architecture, not a nicety**: GACT is one client codebase for
many backends. There is no per-backend build; the capability map at connect
time is the only mechanism that keeps a generic client honest. The TUI's
startup already models this — it calls `Capabilities` first and only calls
`ListWorkspaces` when `capabilities.workspaces` is true (clio advertises
`false` there and 501s).

**Rules**:

- Never hardcode "the backend supports X". Gate on the flag.
- Never advertise a flag your endpoint stub doesn't honor (emulator/adapters).
- Version strings are NOT feature signals — all five adapters still advertise
  `contract_version "0.1"` while emulator/TUI say `"0.2"`, and stale "v0.1"
  package docs survive in `tui/internal/client/client.go:1` and
  `emulator/internal/server/routes.go` (verified 2026-07-06). Only capability
  flags are reliable.

This connects to the project's hardest live problem (owner, 2026-07-06):
**keeping all interfaces in parity of capabilities honestly**. Every surface
must truthfully reflect what the connected backend can do — no more, no less.
When priorities conflict anywhere in this repo, the owner's stated thesis
wins: *the backend-generic wire contract with a conformance suite AND
provably capability-honest clients on every surface.* See
gact-interface-parity-campaign for the execution plan.

---

## 3. The two-dialect reality (why the TUI client is liberal)

Two wire dialects coexist **inside this repo** as of 2026-07-06:

1. **clio's codified dialect** — what SPEC §7.3a/§7.4 documents.
2. **the emulator's looser pre-reconciliation dialect** — what
   `emulator/internal/scenario/scenario.go` and
   `emulator/internal/server/handlers_events.go` actually emit.

Verified differences:

| Aspect | clio (SPEC-codified) | emulator (as of 2026-07-06) |
|---|---|---|
| Thinking-part deltas | `delta: {text_append}` — thinking uses `text_append` too (§7.5) | `thinking_append` (scenario.go:261) |
| `part.added` / `part.delta` payload | carries `turn_id`, `stream_source: "live"\|"batch"` | `{message_id, part}` / `{message_id, part_id, delta}` — no `turn_id`, no `stream_source` |
| `part.completed` | carries authoritative `final_text` | no `final_text` |
| `cost.updated` event | never emitted (§7.3b; rollups ride `message.completed`) | emitted after every turn (scenario.go:321) |
| Connect preamble | `server.connected` then `session.snapshot`, both `id: 0` | `server.connected` only — no `session.snapshot` |
| Replayed events | carry `replay: true` in the envelope | no `replay` flag |
| Routes | session-scoped SSE only; `/summarize`, `/attachments`, global `/v1/events`, `GET /v1/permissions/{id}`, `PATCH .../parts/{id}` all absent | all of those registered (`routes.go:29,38,49,81,180`) |

**The TUI only works against both because it is deliberately liberal**:
`tui/internal/ui/live_message_parts.go` reads `text_append` AND
`thinking_append` AND `input_json_append`; treats `final_text` as an
authoritative replace *when present*; `live_events.go` promotes tokens/cost
from `message.completed` because clio has no `cost.updated`; stale-replay
filtering compares `occurred_at` timestamps (`live_event_context.go`) instead
of the `replay: true` flag the emulator never sends.

**The trap this skill exists to prevent**: a session that "fixes" the TUI (or
apps/core) to match only one dialect gets green tests against the emulator
and breaks against clio, or vice versa. Before narrowing any event-handling
code, test against BOTH backends (see gact-run-and-operate), or prove the
emulator has been synced first. Whether the emulator *should* be synced to the
codified dialect is an open question tracked under iowarp/gact-tui#232 — no
issue in this repo currently decides it. Do not resolve it silently as a side
effect of a bug fix.

---

## 4. Shared Go wire types: `emulator/pkg/gact` is the de-facto schema

The Go types for every wire object (Session, Message, Part, events, …) live in
`emulator/pkg/gact` (21 `.go` files). The TUI client and all four Go adapters
import them. `tui/internal/client/client.go` states the intent: *"The TUI
never depends on emulator implementation details — only on the wire types,
which are normative per contract/SPEC.md."*

Consequences (all verified):

- The repo is a Go workspace: `go.work` joins **7 modules** (emulator, tui,
  4 adapters, contract/conformance). Two more Go modules exist OUTSIDE the
  workspace: `apps/desktop/sidecar-launcher` and `loop-test`.
- `tui/go.mod` carries relative `replace` directives (`../emulator`,
  `../contract/conformance`). A full-repo clone builds fine;
  `go get github.com/JaimeCernuda/gact-tui/tui` can never work standalone.
- Module paths are split across two orgs: the workspace modules are
  `github.com/JaimeCernuda/gact-tui/...` while `apps/desktop/sidecar-launcher`
  is `github.com/iowarp/gact-tui/...`. The GitHub remote is iowarp/gact-tui.
  Cite issues as iowarp/gact-tui#NNN regardless of module path.
- **One wire, four hand-copied type systems** (iowarp/gact-tui#232's words):
  Python Pydantic in clio, Go in `emulator/pkg/gact`, TypeScript in
  `apps/core/src/wire`, plus per-adapter vocabularies. Every enum checked
  during the #232 audit had drifted in the hand-copied TS layer; commit
  `c66b885f` "fix: sync wire layers to the codified shapes — crush flat
  message.created, TS enum/payload drifts (#248)" fixed 8 confirmed TS drifts
  and added `apps/core/tests/wire_shapes.test.ts` to fail typecheck on
  re-drift. #232 lists contract-owned/generated types as an open exploration
  ("codegen: types.py (or spec schema) → TS + Go") — **candidate, not built**.

**Rule**: never fork or duplicate a wire type locally. Change it in
`emulator/pkg/gact` (Go) or `apps/core/src/wire` (TS), spec-first per
gact-change-control, and mirror the change across the hand-copied layers in
the same PR — hand-copying is the known drift generator.

---

## 5. Invariants that must hold (each verified in SPEC.md)

Break any of these and some surface renders wrong or hangs. Numbers cite
SPEC.md sections.

1. **Every turn terminates** (§7.4a, clio #756). After
   `session.status_changed(running)`, a terminal `message.completed` +
   terminal `session.status_changed` always arrive — even a crash inside
   finalize settles with `stop_reason: "error"`,
   `error_info.error: "finalize_error"`. The single exception: the ask-user
   pause, whose boundary is `session.status_changed → waiting_user` (§6.23).
   Clients may rely on this; backends/emulator/adapters must preserve it.

2. **`part.completed.final_text` is authoritative** (§7.3a, §7.4). Clients
   MUST replace accumulated deltas with `final_text`. Finalize may RE-emit
   `part.completed` with cleaned text for an already-streamed part; a streamed
   part whose text cleans to empty is dropped and **never receives
   `part.completed`**. Naive delta-accumulation renderers show ghost text.

3. **Event ids: ≥1, strictly ascending per session, non-contiguous** (§7.1).
   Ids come from a single process-global counter shared across sessions.
   **Id-arithmetic gap detection is invalid** — a "gap" is normal. The
   preamble (`server.connected`, `session.snapshot`) always carries `id: 0`
   and is not part of the replay timeline.

4. **SSE replay window is 256 non-transient events; recovery is REST refetch**
   (§7.1). Resume beyond the window is NOT gap-free; slow consumers lose
   events silently (queue depth 256, drop-on-full). The designed recovery is
   `GET /messages` — **reload is byte-identical to the live stream** because
   messages serialize via the same `to_wire()` projection (§6.3 note). Any
   client state not reconstructible from REST will silently diverge. Design
   client features accordingly.

5. **Don't wait on §7.3b events against clio.** These are valid spec surface
   that clio never emits; waiting on them hangs forever. The full table is in
   SPEC §7.3b; the ones that have actually trapped people: `session.created`
   / `session.deleted` (deletion by another client is currently unobservable;
   `session.deleted` is a PROPOSED addition), `message.error` (use
   `message.completed.error_info`), `cost.updated` (rollups ride
   `message.completed`), `tool.call.progress`, `notification`,
   `session.agent_routed`, `memory.cache.updated`, `integration.status_changed`.

6. **`permission.resolved` can arrive with no matching `permission.requested`**
   (§7.3a) — all auto/direct resolutions do this. A resolved→requested join
   accumulates unmatched ids; tolerate them. Also: permission timeout emits
   NO `permission.resolved` at all, and `waiting_permission` session status is
   declared but never emitted (§15.7).

7. **`message.created` payloads are the flat wire Message** — never
   `{message: ...}` (§7.3a; the nesting fork was iowarp/gact-tui#229; crush
   was the last emitter fixed in commit `c66b885f`). Conformance drift-check 3
   asserts this.

8. **The execution event ledger is bounded and pruned only on explicit
   deletion.** TUI-side invariant, not spec-side:
   `executionLedgerMaxEvents = 2000`, trim to `executionLedgerTrimTarget =
   1500`, with a structured `execution.ledger.trimmed` audit event
   (`tui/internal/ui/execution.go`, `execution_sse.go`). Ledgers are emptied
   on `session.cleared` and pruned ONLY on backend-confirmed deletion
   (`execution.ledger.pruned`). **Never prune from refreshed session lists** —
   they are workspace-scoped/archive-filtered views, and per-session
   high-water marks make the loss irreversible in-process. This burned once:
   commit `57496b29` "fix(tui): bound the execution event ledger; prune only
   on explicit deletion (#244)", fixing iowarp/gact-tui#231 (CLOSED).

9. **No silent fallback; no accretion** (cleanup-program ground rules, root
   CLAUDE.md). Failures surface a structured reason; new TUI UI code goes into
   existing seam-named file clusters, never new god files (the ui-split epic
   is iowarp/gact-tui#234, OPEN as of 2026-07-06).

10. **Genericity: server-first semantics** (owner doctrine, 2026-07-06).
    NEVER inject dedup, prose filters, or backend-specific semantics on the
    client side when they belong on the server — GACT clients are generic
    interfaces to many agents, and baking one agent's semantics into a client
    breaks the others. This is why the client-side dedup/prose filters
    (`dedupToolThought`, `dedupeRepeatedText`, `clioScaffolding`, the TUI
    normalization pipeline) are scheduled for **deletion**, gated on clio-side
    fix clio #767 (single-writer TurnTranscript) per the sequencing note in
    `docs/system-cleanup-2026-07.md`. Do not add new filters of this class;
    do not delete the existing ones before the server-side fix lands. See
    gact-working-discipline.

---

## 6. The apps half (web + desktop) — and the three SSE parsers

The Go workspace is only ~two-thirds of the product. `apps/` is a pnpm
workspace: `@clio/core` (shared TS GACT client, no DOM), `@clio/web`
(SolidJS + Vite), `@clio/desktop` (Tauri 2 shell). `apps/CLAUDE.md` is loaded
for any session touching `apps/` and adds its own binding rules.

**Load-bearing pieces:**

- **The web app has its own live-streaming engine** — 28 `Live*.ts` files in
  `apps/web/src` (LiveTranscript, LiveReducer, LiveTranscriptReconcile,
  LivePendingInteractions, …) as of 2026-07-06. It is a full second SSE →
  transcript consumer, parallel to the TUI's `tui/internal/ui/live_*` files.
  Fixing an event-handling bug on one surface does NOT fix it on the other —
  this duplication is a root cause of the parity problem.

- **ONE markdown renderer, and it is binding.**
  `apps/web/src/components/Markdown.tsx` uses `streaming-markdown` (smd), a
  true incremental parser that only APPENDS DOM nodes. Its header documents
  that it *replaced* two prior renderers — the plain-while-streaming flip and
  the O(n²) finalize-only re-parser. Do not reintroduce either pattern; do not
  add a second renderer. (This was a costly saga — see
  gact-failure-archaeology.)

- **`apps/web/RENDERING_SPEC.md` + `apps/web/CANONICAL-CONVERSATION.md` are
  BINDING for any transcript change on ANY surface** — web, desktop, *and*
  TUI — per `apps/CLAUDE.md`: "Any change to the conversation transcript
  (web/desktop/TUI) must match the agreed render. Read both before touching
  transcript code." CANONICAL-CONVERSATION.md is the entire approved
  EarthScope run rendered out, grounded in the real wire. RENDERING_SPEC's
  own header: "Do not re-litigate anything here."

- **Desktop = Tauri shell + Rust supervisor.** `apps/desktop/src-tauri/src`
  has 16 `supervisor*.rs` files handling sidecar lifecycle (boot, attach,
  install, probe, shutdown, spawn) plus a Go helper module
  `apps/desktop/sidecar-launcher`. The bundled-sidecar flow binds clio to
  127.0.0.1 on an ephemeral port with a per-launch CSPRNG bearer token
  (`apps/SECURITY.md`). Details in gact-run-and-operate and
  gact-web-rendering-reference.

- **The repo contains (at least) three independent SSE parsers** — a stated
  parity risk:

  | Parser | Location | Consumer |
  |---|---|---|
  | Go, hand-rolled line parser | `tui/internal/client/sse.go` | TUI |
  | TypeScript | `apps/core/src/client/sse.ts` | web (EventSource path also exists) |
  | Rust | `apps/desktop/src-tauri/src/sse_parse.rs` (+ `sse_bridge.rs`/`sse_stream.rs`) | desktop (SSE routed through Rust so the WebView never depends on clio's CORS) |

  A spec-conformance quirk in one parser (see weak point on `data:` handling
  below) is a surface-specific bug the other two won't reproduce. Any change
  to SSE framing must be checked against all three.

---

## 7. Known weak points — stated plainly

These are acknowledged holes, not hidden ones. Do not "discover" them as new
findings; do check whether they have since been fixed (re-verification
commands at the end).

| # | Weak point | Detail (verified 2026-07-06) |
|---|---|---|
| 1 | **Zero CI for the Rust crate and sidecar-launcher** | No workflow runs `cargo test` or clippy (`.github/workflows/apps.yml` only caches cargo and installs tauri-driver for a webview E2E). The Rust test files (`sse_stream_tests.rs`, `ssh_tests.rs`, …) never run in CI. `apps/desktop/sidecar-launcher` is outside `go.work` and referenced by zero workflows. `@clio/desktop`'s `lint`/`typecheck` scripts are echo no-ops. **"CI green" says nothing about the desktop Rust/Go surface** — run `cargo test` and the sidecar-launcher `go test` manually when touching them. |
| 2 | **Attach-first cross-origin security FINDING (2026-05-31, open)** | `apps/SECURITY.md`: when desktop attaches to an already-running clio on :17800, there is no bearer token and clio serves `Access-Control-Allow-Origin: *`, so ANY web page in the user's browser can drive tool calls → code execution. Mitigation (c) (route all WebView↔clio traffic incl. SSE through Rust) is DONE; (a) token on attach path and (b) scoped CORS are **open, deferred to the v1.0 bar**. Never recommend the attach-first flow without this caveat. |
| 3 | **Hand-copied type systems** | See §4. Codegen from a single schema is an open #232 exploration, not built. |
| 4 | **Provisional `turn.*` channel — zero consumers** | SPEC §7.3c: clio double-publishes a normalized `turn.*` transcript channel. "Status: provisional — codify-or-deprecate is tracked in iowarp/gact-tui#232. It currently has zero client consumers; do NOT build on it until #232 resolves." Building on it risks deletion under you; it also gates the TUI streaming-parity epic iowarp/gact-tui#233. |
| 5 | **Stale `0.1` markers** | `tui/internal/client/client.go` pkg doc says "GACT v0.1 client"; `emulator/internal/server/routes.go` header says "registers all GACT v0.1 endpoints"; all five adapters advertise `contract_version "0.1"`. Meanwhile spec/emulator/TUI report `0.2`. Treat version strings as noise (§2 above). |
| 6 | **TUI SSE parser strictness** | `tui/internal/client/sse.go:118-123` requires a space after the field colon (`data: ` not `data:`) and does not concatenate multi-line `data` fields. A spec-compliant server emitting `data:foo` is silently ignored. Known and tracked in iowarp/gact-tui#234; per the spec-first rule the fix should ride the contract/conformance path, not a quiet client patch. |
| 7 | **Module-path split** | Workspace modules under `github.com/JaimeCernuda/gact-tui/`, sidecar-launcher under `github.com/iowarp/gact-tui/`, GitHub remote iowarp/gact-tui (§4). |
| 8 | **Emulator ≠ clio even when both pass conformance** | The capability-truth check is self-relative; the emulator honestly advertises routes clio honestly denies. Passing against one proves nothing about the other (§1, §3). |
| 9 | **Timestamp-based replay filtering in the TUI** | `live_event_context.go` filters stale replays by `occurred_at` vs session `UpdatedAt` instead of the spec's `replay: true` flag (which the emulator doesn't emit — chicken-and-egg with the dialect-sync question). Clock skew between client and backend could misclassify events. Deliberate for now; do not "simplify" it to the flag without syncing the emulator first. |

---

## 8. Checklist before touching anything wire-visible

1. Read the relevant SPEC.md section (structure: §3 capabilities, §4 objects,
   §6 endpoints, §7 SSE, §14 errors, §15 drift list). Endpoint-level detail:
   gact-wire-protocol-reference.
2. Is the behavior gated by a capability flag? If not, should it be?
3. Which dialect(s) does your change assume? Test against emulator AND clio,
   or state explicitly why one is enough.
4. Does it violate any invariant in §5 above? (Especially final_text
   authority, turn termination, REST-reconstructibility.)
5. Does it add client-side semantics that belong on the server? If yes, stop —
   file it against clio instead (§5 item 10).
6. Transcript rendering involved (any surface)? Read
   `apps/web/RENDERING_SPEC.md` + `CANONICAL-CONVERSATION.md` first.
7. Spec-first: wire-visible changes start in `contract/SPEC.md` + the
   conformance suite, then propagate (root CLAUDE.md rule 5; process in
   gact-change-control).
8. Add/extend a conformance check so the drift class becomes CI-impossible.

---

## Provenance and maintenance

All facts verified 2026-07-06 on this machine
(`D:/Libraries/Documents/projects/gact-tui`). Re-verify volatile ones with
(PowerShell, repo root):

```powershell
# Spec version, reconciliation target, line count
Get-Content contract/SPEC.md -TotalCount 20; (Get-Content contract/SPEC.md | Measure-Object -Line).Lines

# Workspace modules (7) + out-of-workspace Go modules
Get-Content go.work; Get-Content apps/desktop/sidecar-launcher/go.mod -TotalCount 1

# Emulator dialect drift still present? (expect hits at thinking_append / cost.updated; no session.snapshot)
Select-String -Path emulator/internal/scenario/scenario.go -Pattern 'thinking_append|cost.updated'
Select-String -Path emulator/internal/server/handlers_events.go -Pattern 'session.snapshot'

# Adapter contract_version strings (expect five "0.1" as of 2026-07-06)
Select-String -Path adapters/*/server.go,adapters/claude-agent-sdk-server/src/gact_claude_sdk/server.py -Pattern '"0\.[12]"' | Select-String -Pattern 'ontract'

# Ledger bounds
Select-String -Path tui/internal/ui/execution.go -Pattern 'executionLedger(MaxEvents|TrimTarget)'

# SSE parser strictness still unfixed?
Select-String -Path tui/internal/client/sse.go -Pattern 'HasPrefix\(line, "data: "\)'

# Live* engine size, ui package size
(Get-ChildItem apps/web/src/Live*.ts).Count; (Get-ChildItem tui/internal/ui/*.go).Count

# CI still missing cargo test?
Select-String -Path .github/workflows/*.yml -Pattern 'cargo (test|clippy)'

# Issue states (#232/#233/#234/#237 OPEN, #231 CLOSED as of 2026-07-06)
gh issue view 232 --repo iowarp/gact-tui --json state,title
gh issue view 234 --repo iowarp/gact-tui --json state,title

# Conformance callers (expect: conformance.go doc + tui/cli_diagnostics.go)
# (use the Grep tool for 'conformance.Run' over *.go)
```

If any command's result contradicts this file, the repo wins — update this
skill in the same PR.
