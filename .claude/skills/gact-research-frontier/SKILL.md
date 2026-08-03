---
name: gact-research-frontier
description: The open problems where gact-tui can advance the state of the art, with honest positioning and claim discipline. Load this when asked "what should we work on next", "what is novel here", "how do we position GACT externally", when writing a paper/README/talk/blog claim about GACT, when deciding the fate of the ACP adapter branch, when scoping the interaction channel (issue 250), contract-owned type generation, capability-parity enforcement, live==reload conformance, or backend certification. Keywords: research, novelty, positioning, frontier, roadmap, claim, certification, codegen, parity, ACP, interaction channel.
---

# gact-research-frontier

Where this project can genuinely exceed the state of the art, what must be built
first, and what may honestly be claimed. Written 2026-07-06; every fact below was
verified against the repo on that date unless labeled otherwise.

**Vocabulary used throughout** (defined once here):

- **The contract** — `contract/SPEC.md`, the GACT REST+SSE protocol spec (v0.2).
  SSE = Server-Sent Events, the one-way HTTP streaming channel backends push
  turn events over.
- **Conformance suite** — `contract/conformance/`, an executable Go test suite
  that probes a live backend URL and asserts contract behavior. Also runnable as
  the `gact conformance` CLI subcommand (`tui/cli_diagnostics.go`).
- **Capability flag** — a boolean in `GET /v1/capabilities` (SPEC §3.3); clients
  must feature-gate on flags, never on backend identity or version strings.
- **Dialect** — a backend's concrete variant of the wire (the emulator and clio
  emit measurably different SSE shapes; see gact-architecture-contract).
- **Adapter** — a sidecar that translates another agent's API onto the GACT wire
  (`adapters/`).
- **Drift class** — a category of spec↔implementation divergence that actually
  broke a client, now asserted by `contract/conformance/drift_checks.go`.
- **clio** — the reference backend, [iowarp/clio-agent](https://github.com/iowarp/clio-agent).

## The thesis (owner decision, 2026-07-06 — wins all conflicts)

> The load-bearing differentiator is the **generic contract + conformance suite
> + provably capability-honest clients on every surface**.

When two frontier items conflict on effort or sequencing, the one that
strengthens contract genericity + enforced parity wins. Concretely: emulator
dialect convergence and parity tooling outrank feature velocity on any single
surface, and nothing may be built that bakes one backend's semantics into a
client (see gact-working-discipline for the doctrine form of this rule).

The owner's statement of the hardest live problem (2026-07-06): *"keeping all
interfaces in parity of capabilities honestly."* Current bugs are temporary;
cross-surface capability parity is the persistent pain. Frontier item 2 exists
because of this; the executable campaign for it is gact-interface-parity-campaign.

## When NOT to use this skill

| You actually want to… | Load instead |
|---|---|
| Implement a wire-visible change (endpoints, SSE, types) | gact-wire-protocol-reference + gact-change-control |
| Understand WHY the architecture is shaped this way | gact-architecture-contract |
| Execute the parity campaign step-by-step | gact-interface-parity-campaign |
| Run the emulator / TUI / clio / web / desktop | gact-run-and-operate |
| Prove a hypothesis with wire captures / differentials | gact-proof-and-analysis-toolkit |
| Debug something broken right now | gact-debugging-playbook |
| Check whether an idea was already tried and rejected | gact-failure-archaeology |
| Decide what counts as evidence before claiming "done" | gact-validation-and-qa |

This skill is for **choosing and framing** frontier work and for **external
claims** — not for executing the work itself.

---

## The six frontier items

Status labels: **OPEN** = agreed direction, unstarted or partial. **CANDIDATE**
= plausible, needs an owner decision before starting. **PROPOSED** = designed on
paper only, nothing on any wire.

### 1. Contract-owned, generated wire types across Go/TS/Python — OPEN

**Why current SOTA fails.** Every agent ecosystem hand-copies its wire types per
language, and hand-copies drift. This repo has the receipts: one wire, four
hand-copied type systems (clio's Python Pydantic `gact/types.py`; Go in
`emulator/pkg/gact` — the TUI imports its protocol types *from the test
emulator*; TS in `apps/core/src/wire`; per-adapter vocabularies). When audited,
**every checked enum in the TS layer had drifted** — commit `c66b885f` "fix:
sync wire layers to the codified shapes" fixed 8 confirmed TS drifts plus the
crush adapter's nested `message.created`, and added
`apps/core/tests/wire_shapes.test.ts` as a tripwire.

**This project's asset.** Three real clients (TUI, web, desktop) + five adapters
+ an emulator all speaking one wire in one repo, a conformance suite, and
documented drift classes (SPEC §15, `drift_checks.go`) — i.e., a live laboratory
where type drift is observable and its cost is recorded.

**First three steps in this repo** (rooted in iowarp/gact-tui#232's unchecked
items "Move Go wire types out of emulator/pkg/gact into a contract-owned module
(or generate them)" and "Explore codegen: types.py (or spec schema) → TS + Go"):

1. Create a contract-owned Go module (e.g. `contract/wire`), move the types out
   of `emulator/pkg/gact`, and repoint the imports in `tui/`, all four Go
   adapters, and the emulator (all joined by `go.work`). Pure mechanical move;
   no wire change, so it does not need spec-first gating — but read
   gact-change-control before touching module boundaries.
2. Pick the schema source of truth (JSON Schema derived from clio's `types.py`
   vs. a schema checked into `contract/`) and generate the TS layer in
   `apps/core/src/wire` from it, keeping `wire_shapes.test.ts` green as the
   independent check during the swap.
3. Add a CI drift gate: regenerate all targets and `git diff --exit-code` —
   a hand edit to any generated file fails the build.

**You have a result when…** deliberately introducing a single enum-value drift
in any one language (Go, TS, or the schema) turns CI red with a message naming
the drifted symbol — with no human reading diffs. Until then, "the types are in
sync" is a claim, not a property.

### 2. Machine-checkable multi-surface capability parity — OPEN (the thesis item)

**Why current SOTA fails.** Multi-frontend agent products keep their surfaces in
parity by hand and by memory. Nobody fails a build because the web app silently
ignores a capability the TUI surfaces. "Capability-honest" — the UI's claimed
support for every backend flag is enforced, not asserted — is not a property any
adjacent ecosystem tests for.

**This project's asset.** Already further than SOTA on one surface, verified
2026-07-06:

- The TUI's doctor screen builds a per-flag disposition row for every capability
  (`doctorCapabilityRows` in `tui/internal/ui/doctor_capability_rows.go`, with
  four honest disposition classes: full / partial / gated / not-surfaced).
- Two tests (`tui/internal/ui/doctor_capability_matrix_test.go`) bind the
  human-readable matrix doc `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` to those
  rows: a flag missing from the doc, or a doc claim mismatching the code's
  disposition class, fails `go test`.
- The conformance suite asserts capability↔route truth on the backend side
  (`capRouteProbes` in `contract/conformance/drift_checks.go`: flag true ⇒ route
  exists, flag false ⇒ 404/501) — the check that would have caught the historic
  `session_summary`/`attachments_upload` over-claim.

**The gap** (verified by search, 2026-07-06): web/desktop have no equivalent.
`apps/core/src/wire/capabilities_types.ts` decodes the flags and
`apps/core/tests/capabilities.test.ts` exists, but no test anywhere in `apps/`
enforces that every flag has a declared UI disposition on the web or desktop
surface. A new flag can land and be silently ignored by two of three surfaces —
exactly the owner's hardest-problem statement.

**First three steps in this repo:**

1. Extract the flag list into one machine-readable source both languages can
   read (candidates: generate from the Go `gact.Capabilities` struct, or make
   `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` parseable-by-contract — the TUI test
   already parses its table, so the doc-as-source route is proven).
2. Build the web-side mirror of `doctorCapabilityRows`: a per-flag disposition
   table in `apps/core` with a vitest test asserting every key of
   `CapabilityFlags` has an entry (same four disposition classes).
3. Add the cross-surface CI check: one job that diffs the TUI, web, and desktop
   disposition tables against the flag source and fails on any flag lacking a
   stated disposition on any surface.

**You have a result when…** a CI job fails when any surface silently ignores a
new capability flag — falsifiable test: add a dummy flag to the flag source on a
branch and confirm every surface's job goes red until each declares
full/partial/gated/not-surfaced for it. (This exact milestone is the charter of
gact-interface-parity-campaign — execute it there.)

### 3. Live==reload byte parity as a conformance-testable property — CANDIDATE (gated)

**Why current SOTA fails.** Streaming agent UIs routinely render a live turn one
way and its reloaded transcript another, because clients accumulate deltas,
filter, and dedup locally. No adjacent protocol makes "the reloaded transcript
is byte-identical to what streamed" a testable conformance property.

**This project's asset.** The property is already *designed in* on the reference
backend: SPEC.md states messages serialize via `to_wire()` and "reload is
byte-identical" to the live stream (SPEC §4.4 Message and §6.3 Messages notes),
`part.completed.final_text` is authoritative over buffered
deltas, and the repo owns the war history proving why this matters — commit
`e442b485` "refactor(web): retire client-side text dedup so live == reload"
removed a filter that ran only on settled transcripts (live ≠ reload by
construction), and PR iowarp/gact-tui#249 (commit `c1e96579`) collapsed the
TUI's dual transcript render into one projection. See gact-failure-archaeology
for the full saga.

**Gating (do not start out of order).** Server-first sequencing applies: the
remaining client-side prose filters can only be deleted after iowarp/clio-agent#767
(single-writer TurnTranscript) removes the duplication at the source, and
iowarp/gact-tui#233 phase 2 waits on iowarp/gact-tui#232 settling the
authoritative streaming channel (`docs/system-cleanup-2026-07.md`, "Sequencing
note"). Building the *measurement* is not gated; deleting the filters is.

**First three steps in this repo:**

1. Build the differential check as an opt-in conformance section: drive a turn,
   capture the SSE-projected transcript, then `GET /messages` and compare
   canonicalized JSON. Run it against the emulator first.
2. Extend to per-part byte assertions: accumulated deltas vs `final_text`,
   flagging any part where a client would need local cleanup to match reload.
3. When iowarp/clio-agent#767 lands, run the same section via `gact conformance` against a
   live clio and file the capture as proof (see gact-proof-and-analysis-toolkit
   for the wire-capture differential recipe).

**You have a result when…** the conformance suite has a live-vs-reload section
that passes against both the emulator and clio, and demonstrably **fails** when
a client-style dedup/filter is injected into the projection under test. Until a
run against real clio exists, claim only "designed for byte parity", never
"byte-parity verified".

### 4. The bidirectional interaction channel (choice/form/url/show) — PROPOSED (everything)

**Why current SOTA fails.** Agent protocols carry text, tool calls, and
permission gates; none carry a generic, capability-gated, *bidirectional*
structured-interaction channel where an MCP server can render a map and receive
the human's selection back into the model's context. MCP Apps (SEP-1865) and MCP
elicitation/MRTR (SEP-2322) provide pieces; no one has composed them into a
backend-generic client contract.

**This project's asset.** A settled design that stays inside GACT's existing
invariants: no new turn-state machine (blocking interactions reuse the tool-call
suspension; the permission round-trip already proves the resume mechanism),
REST+SSE only (SEP-2322 round-trips replace any duplex lane), spec-first,
no silent fallback, and per-kind capability flags (`interaction_choice` /
`interaction_form` / `interaction_url` / `interaction_show`). Founding consumer:
the EarthScope geo/station map (plus `plot_timeseries` brush-to-static-export).
Tracked as iowarp/gact-tui#250 (OPEN as of 2026-07-06).

**Warning — fragile state as of 2026-07-06:** the two design docs
(`docs/clio-interaction-channel-design.md`,
`docs/clio-interaction-channel-implementation-plan.md`) exist **untracked** in
the working tree (`git status` shows `??`). They are the only durable record of
the settled design; one `git clean` loses them. None of the `interaction_*`
flags exist in `contract/SPEC.md` yet (verified by grep). Label every part of
this item PROPOSED in any external context.

**First three steps in this repo:**

1. Commit the two design docs (via normal change control) so the design survives
   the working tree.
2. Spec-first (CLAUDE.md rule 5): draft the SPEC.md additions — interaction
   payload shapes, the human-completable marker on a pending `tool_call`, the
   answer-submission endpoint, the four capability flags — together with
   conformance checks, before any emulator/client code.
3. Add an emulator scenario that emits a `choice` interaction and parks the tool
   call, so TUI and web rendering are testable keylessly. Per the implementation
   plan, final acceptance is a real-run against a live clio stack with a real
   LLM — the emulator is necessary, not sufficient.

**You have a result when…** a scripted emulator turn presents a choice, an
answer POST resumes the parked tool call, and the reloaded transcript matches
the live one — rendered on both TUI and web; and separately, when the same flow
is captured end-to-end against live clio with the EarthScope map returning a
station selection into the model's next turn.

### 5. Ecosystem bridge: the ACP adapter branch — CANDIDATE (merge/rebase/delete decision owed)

**Why current SOTA fails / why this matters.** ACP (Agent Client Protocol — the
editor↔agent protocol used by Zed, Gemini CLI, and clio-coder's `clio acp`) is
the closest adjacent art to GACT. A working ACP→GACT bridge positions GACT as an
interoperability superset ("any ACP agent gets three GACT surfaces for free")
instead of a competing island — the strongest possible answer to "why not just
use ACP?".

**This project's asset** (verified 2026-07-06): `origin/feat/acp-adapter`, one
unmerged commit `b677dde1` "feat(adapters): add generic ACP→GACT v0.2 bridge
adapter" (2026-06-24, 1,442 insertions across 8 files: `adapters/acp/`
server/translate/transport + cmd binary + go.work entry). Its package doc says
it fronts *any* ACP v1 agent over newline-delimited JSON-RPC on stdio, scope:
workspaces, sessions, messages, per-session SSE, the modal permission flow,
cancel, structured errors; everything else 501 + truthfully-false capability
flags. `adapters/` on develop has **no** acp directory. No tracked issue for the
branch was found (searched 2026-07-06).

**Risk.** The branch predates the wire-shape sync (`c66b885f`, 2026-07-02) — it
translates shapes that have since been codified differently, so it is bit-rotting.

**First three steps in this repo:**

1. Evaluate cheaply: rebase the branch onto develop in a worktree, `go build
   ./...` + `go test` its module, and list what broke against the post-sync
   (`c66b885f`) shapes. This is an hour, and it converts "1,442 mystery lines" into a
   concrete keep-or-kill datum.
2. If keeping: add the `conformance_test.go` the README's own adapter recipe
   prescribes (boot against a mock ACP agent, call `conformance.Run`) — note no
   existing adapter does this yet (see item 6).
3. Present the merge/rebase/delete decision to the owner in a tracked issue with
   the rebase evidence attached. Do not merge unilaterally; do not silently
   delete — either outcome is a positioning decision, not a hygiene chore.

**You have a result when…** the branch is either merged with a green conformance
run and a screenshot of the TUI driving a real ACP agent, or deleted with the
decision and evidence recorded in an issue. An unmerged branch is neither an
asset nor a claim.

### 6. Backend certification: "passes gact conformance" as a portable claim — CANDIDATE

**Why current SOTA fails.** No agent-frontend ecosystem offers a third-party
backend a checkable badge: "run this suite against your URL; if it's green, all
these clients work." That is what conformance suites are *for* (cf. HTML/CSS
test suites, JDBC TCKs), and no agent protocol has one with teeth.

**This project's asset.** The suite exists, runs in CI against the emulator, is
shippable as `gact conformance --backend <url>`, and asserts drift classes that
demonstrably bit real clients. That is most of a certification program.

**What must be true first** (each verified 2026-07-06):

| Blocker | Current state | Fix direction |
|---|---|---|
| The emulator dialect question | The emulator emits a looser pre-reconciliation dialect (e.g. `thinking_append` at `emulator/internal/scenario/scenario.go:261`; no `session.snapshot` preamble; no `replay:true`; no `final_text`), yet passes conformance — because the capability-truth check is self-relative. "Certified" must mean "clients work", and today emulator-green ≠ clio-equivalent. No issue records whether the two-dialect state is intentional — **open question; get an owner ruling before building certification on it** | Either sync the emulator to the codified dialect or make conformance assert the codified §7.3a event shapes directly |
| Adapters advertise `contract_version "0.1"` | All five (grep-verified: `adapters/{claudecode,goose,crush,opencode}` + the Python server) while the spec and emulator report 0.2 | Bump alongside a real capability audit per adapter; version strings must not out-claim behavior |
| Nobody but the emulator actually runs the suite | `conformance.Run` has exactly two callers: `tui/cli_diagnostics.go` (the CLI) and `contract/conformance/conformance_test.go` (emulator-only, the CI path via `make test`). The README's adapter table nonetheless asserts per-adapter conformance results — those claims are currently hand-written, not CI-generated | Wire `conformance.Run` into each adapter's own tests (README "Build it for your own backend" step 3 already documents exactly how) |

**First three steps in this repo:** the three fix directions above, in that
order — owner ruling on the emulator dialect, adapter version/capability audit,
adapter conformance tests in CI.

**You have a result when…** every in-repo backend (emulator + five adapters)
runs the conformance suite in CI, and the README's per-backend conformance
claims are generated from those CI runs rather than typed by hand. Only then is
"passes gact conformance" a claim a third party can trust — and only then is it
worth publicizing.

---

## Positioning: what is genuinely novel, and claim discipline

### Novel vs known art — be honest

Vendor-neutral agent↔UI contracts are **not** novel in themselves. Known
adjacent art: ACP (Agent Client Protocol; this repo's own unmerged branch
bridges it — item 5), MCP and its Apps/elicitation SEPs for embedded UI and
structured input, and every agent vendor's private HTTP+SSE API. Anyone claiming
"first generic agent protocol" is wrong and will be corrected in public.

GACT's defensible novelty is the **enforcement discipline around** the contract:

1. An executable conformance suite whose checks are derived from drift classes
   that *actually bit real clients* (SPEC §15 + `drift_checks.go`), not from
   aspirations.
2. The "reality leads, spec documents, conformance enforces" reconciliation
   methodology (owner decision 2026-07-01, `docs/system-cleanup-2026-07.md`) —
   a repeatable answer to the universal spec-rot problem.
3. Multi-client parity as a first-class, test-enforced property (item 2) —
   three real client surfaces + five adapters + an emulator co-evolving against
   one contract in one repo.
4. (When proven) live==reload byte parity as a conformance-testable property
   (item 3) and the capability-gated interaction channel (item 4).

Honest weaknesses to disclose alongside any claim: one reference backend; the
conformance suite's CI teeth currently reach only the emulator; two wire
dialects coexist in-repo; adapters sit at contract_version 0.1.

### Claim discipline (binding)

Nothing may be claimed externally that lacks proof of the listed kind. This
absorbs the project's evidence bar (gact-validation-and-qa): green tests never
close a UI claim; drive the real product.

| External claim | Minimum proof required |
|---|---|
| "Backend/adapter X conforms" | A conformance run in CI (not a hand-run, not a README assertion) |
| "Surface X supports capability Y" | The surface's capability-disposition matrix row + a screenshot of the running product exercising it |
| "Live == reload" | The item-3 differential check, green against the emulator AND live clio |
| "Interaction channel works" | Real-run capture against live clio with a real LLM (per the iowarp/gact-tui#250 plan doc), per semantic — not emulator-only |
| Any performance number | A runnable script in the repo that reproduces it (see gact-diagnostics-and-tooling) |

Known claims currently ahead of their proof (as of 2026-07-06, both in
README.md): the adapter table's per-adapter conformance results (no adapter
invokes the suite in tests) and "supports 28 of 30 v0.2 capabilities" for clio
(a README statement; no capture regenerates it). Do not repeat either externally
until regenerated from CI/live evidence; fixing them is item 6.

### Reproducibility standard

The **keyless emulator is the repro artifact**. README claims it "boots in
~50ms, no deps"; verified on this machine 2026-07-06: it builds with stock Go,
boots, and serves `/v1/health` + `/v1/capabilities` (contract_version 0.2) with
no API keys and no network, well under a second of wall time including shell
overhead (the ~50ms figure itself is the README's, not re-measured). Every
frontier demo, bug report, and external artifact should ship as "run the
emulator with scenario X, then run Y" — anyone can replay it with `git clone` +
Go. PowerShell, from the repo root (this-machine paths):

```powershell
cd D:\Libraries\Documents\projects\gact-tui\emulator
go build -o "$env:TEMP\emulator-server.exe" .\cmd\emulator-server
Start-Process "$env:TEMP\emulator-server.exe" -ArgumentList '--port','7799'
curl.exe -s http://localhost:7799/v1/capabilities
# stop it when done:
Stop-Process -Name emulator-server -Force -Confirm:$false
```

(Repo tooling equivalent, Git Bash: `make build` then run the binary the
Makefile drops inside `emulator/` — note it does NOT build into `bin/`.)

---

## Provenance and maintenance

Volatile facts in this skill and how to re-verify each (PowerShell-safe; run
from `D:\Libraries\Documents\projects\gact-tui`):

| Fact (as of 2026-07-06) | Re-verify with |
|---|---|
| Issues iowarp/gact-tui#232/233/234/237/250 OPEN | `gh issue view 232 250 --json state,title` (etc.) |
| iowarp/gact-tui#232 remaining checklist (type ownership, codegen, dedup owner, turn.* decision) | `gh issue view 232 --json body -q .body` |
| Interaction flags absent from SPEC | `Select-String -Path contract\SPEC.md -Pattern 'interaction_'` (no hits ⇒ still absent) |
| iowarp/gact-tui#250 design docs still untracked | `git status --porcelain docs/clio-interaction-channel-*` (`??` ⇒ untracked) |
| ACP branch unmerged, 1 commit | `git fetch origin; git cherry develop origin/feat/acp-adapter` (`+ b677dde1…` ⇒ still unmerged) |
| All adapters at contract_version 0.1 | `Get-ChildItem adapters -Recurse -Include *.go,*.py \| Select-String 'ontract.?ersion.*0\.'` |
| `conformance.Run` callers = CLI + emulator test only | Grep tool for `conformance\.Run` over `*.go` |
| TUI capability-matrix tests exist and pass | `cd tui; go test ./internal/ui -run TestCapabilityMatrix` |
| No web-side per-flag disposition test | Grep `apps/core/tests` + `apps/web/tests` for `capabilit` and inspect |
| Emulator keyless boot, contract 0.2 | The PowerShell block in "Reproducibility standard" above |
| Sequencing gates (iowarp/clio-agent#767, server-first) | `docs/system-cleanup-2026-07.md` "Sequencing note"; clio-agent issue tracker |
| Commit hashes cited (`c66b885f`, `e442b485`, `c1e96579`, `b677dde1`) | `git log -1 --format='%h %s' <hash>` |

If any row's re-verification disagrees with this skill, the repo wins — update
this file (through normal change control) rather than trusting it.
