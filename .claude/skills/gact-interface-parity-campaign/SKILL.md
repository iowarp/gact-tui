---
name: gact-interface-parity-campaign
description: Executable decision-gated campaign for keeping TUI, web, and desktop honestly at capability parity with any GACT backend — the project's hardest live problem (owner, 2026-07-06). Load when asked to check/close/prove capability parity, when a backend advertises a flag a client ignores, when a feature exists on one surface but not another, when adding or removing a capability flag, when the capability matrix or its tests fail, or when planning parity work (issues 232/233). Keywords: parity, capabilities, capability matrix, x_clio_*, Doctor, flag ignored, surface gap, TUI vs web vs desktop, conformance, UNDECODED.
---

# GACT Interface Parity Campaign

This is the flagship campaign for the owner-named hardest live problem: "keeping
all interfaces in parity of capabilities honestly." Bugs come and go; the ongoing
pain is that three client surfaces (TUI, web, desktop) must each tell the truth
about what the backend can do — and drift apart silently unless you measure them.

Success is **measurable, never judged by eye**: the parity ledger (Phase 1) has
zero unexplained rows, the enforcement tests are green on every surface that has
them, and the claim is backed by real-app evidence on all three surfaces.

Issue references: bare `#NNN` means iowarp/gact-tui#NNN; `clio #NNN` means
iowarp/clio-agent#NNN.

## Phase 0 — Doctrine (read before touching anything)

**Parity definition.** For every capability the backend advertises, each surface
must be in exactly one of three states:

1. **Fully surfaced** — the feature works in the primary UI or a drill-down.
2. **Explicitly partial/gated** — decoded, visibly marked, with a drill-down or a
   named reason (issue, proof path, or explicit non-goal).
3. **Hidden with a stated reason** — decoded but not surfaced, and the reason is
   written down where a test can see it.

**Never silently ignored.** This wording is the project's own release doctrine —
the 0.9 blocker (iowarp/gact-tui#93, "1.0 blocker: CLIO capability parity and
gating matrix", now CLOSED) as recorded in `docs/ZERO_NINE_READINESS.md`:

> Every advertised CLIO capability must be either fully surfaced in the TUI,
> explicitly marked partial with a useful drill-down, or hidden/disabled with a
> clear reason. The TUI must not silently ignore new `x_clio_*` flags that
> affect user expectations.

**Capability truthfulness is bidirectional** (contract/SPEC.md §3.3): a flag
advertised `true` implies the route is registered; `false` (or absent) implies
the route returns 404/501, and the client MUST hide the affordance. This holds
on the reference backend since clio Phase 0 (clio #760/#782 — `session_summary`
and `attachments_upload` are truthfully `false` there because `POST
.../summarize` and `POST .../attachments` are not registered).

**Beyond-SOTA thesis (owner, 2026-07-06).** The differentiator this project bets
on is *generic contract + provable parity*: a backend-generic wire contract with
a conformance suite AND capability-honest clients on every surface. When
priorities conflict (velocity vs parity, one backend's convenience vs
genericity), **this thesis wins**.

**Corollary — genericity rule (owner, standing).** NEVER inject dedup, filters,
or semantics on the client that belong on the server. GACT is a generic
interface to many agents; encoding one agent's semantics into a client breaks
the others. The existing client-side dedup/prose filters are scheduled for
deletion once the server work lands (see Phase 3 fences).

**Definitions** (used throughout):

| Term | Meaning |
|---|---|
| Surface | A client: TUI (`tui/`), web (`apps/web`), desktop (`apps/desktop` — Tauri shell around the web app) |
| Capability flag | A key in `GET /v1/capabilities` → `.capabilities` (booleans plus mixed-type `x_clio_*` vendor keys) |
| Decoded | The client's typed wire layer can even *see* the flag (Go: `gact.CapabilityFlags` in `emulator/pkg/gact/types.go`; TS: `CapabilityFlags` in `apps/core/src/wire/capabilities_types.ts`) |
| Support class | `full` / `partial` / `gated` / `none` per `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` |
| Parity ledger | The joined table: flag × {backend truth per backend, decoded-by-client, support class, verdict} |
| Unexplained row | A ledger row whose verdict is not OK and has no named issue/reason |

## When NOT to use this skill

- Debugging one broken feature or a rendering bug → **gact-debugging-playbook**
  (triage first), **gact-web-rendering-reference** (web/desktop transcript),
  **gact-bubbletea-reference** (TUI internals).
- Looking up wire semantics of an endpoint/event/flag → **gact-wire-protocol-reference**;
  design rationale and invariants → **gact-architecture-contract**.
- Bringing up the emulator, clio, web, or desktop → **gact-run-and-operate**.
- Deciding what counts as evidence / adding tests → **gact-validation-and-qa**.
- Measuring with diagnostic scripts generally → **gact-diagnostics-and-tooling**
  (its capability-diff script overlaps Phase 1; use either).
- Routing/committing the resulting change → **gact-change-control**.
- Session conduct, autonomy, read-the-evidence → **gact-working-discipline**.

Work this campaign to completion without stopping to ask answerable questions
(owner: an agent stopping mid-task to ask a "silly question" once cost 4 hours).
Stop only at the explicitly marked owner-decision gates below.

---

## Phase 1 — Build the parity ledger

Goal: one table with a row per capability flag and a column per truth source.
All commands run from the repo root `D:\Libraries\Documents\projects\gact-tui`
(this-machine path). PowerShell is primary; `make` targets need Git Bash.

### 1.1 Backend truth — raw wire, per backend

Boot the emulator (fresh build — never trust a stale binary):

```powershell
# PowerShell
cd emulator; go build -o emulator-server.exe ./cmd/emulator-server
./emulator-server.exe --port 7777 --timing fast   # also: --scenario, --replay-file, --seed-* ...
```

```sh
# Git Bash equivalent
make run-emulator     # PORT=7777 by default
```

Fetch the raw flag map. **In Windows PowerShell use `curl.exe`** — bare `curl`
is an alias for `Invoke-WebRequest` and behaves differently:

```powershell
curl.exe -s http://127.0.0.1:7777/v1/capabilities | python -m json.tool
```

For clio, bring up a real backend first (see **gact-run-and-operate**; on this
machine clio conventionally runs on :17800, instrumented builds on :17801;
clio's own default bind is 127.0.0.1:8100) and repeat the fetch against it.
**Gate:** if clio is not reachable, bring it up or mark the clio column
"not probed on <date>" — do NOT substitute emulator output and call it clio
truth. The two backends genuinely differ (see 1.5).

The decoded view (what the Go client can see) comes from the CLI:

```powershell
cd tui; go build -o gact.exe . ; ./gact.exe capabilities --backend http://127.0.0.1:7777 --format json
```

`gact capabilities` decodes into `gact.CapabilityFlags`, so **unknown keys are
silently dropped**. The raw `curl.exe` fetch is backend truth; `gact
capabilities` is client-visible truth. A key present in the first but absent in
the second is exactly the "backend grew a flag the client is blind to" case —
branch to Phase 2.

### 1.2 TUI truth — the test-enforced matrix

- Document of record: `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` — 53 rows as of
  2026-07-06 (33 standard flags + 20 `x_clio_*` fields), one support class each.
- Code of record: `doctorCapabilityRows` in
  `tui/internal/ui/doctor_capability_rows.go` (rendered by the in-TUI `/doctor`
  Doctor view, capability tab — backend support and TUI support shown
  separately).
- Enforcement (all verified green on 2026-07-06):

```powershell
go test ./tui/internal/ui -run "TestDoctorCapabilityRows|TestCapabilityMatrixDoc" -count=1
```

| Test | What it forces |
|---|---|
| `TestDoctorCapabilityRowsCoverDecodedCapabilityFlags` | every decoded `CapabilityFlags` field has a Doctor row |
| `TestDoctorCapabilityRowsExposeTUISupportStatus` / `...NameCurrentCLIORoutes` | rows carry support status and name real routes |
| `TestCapabilityMatrixDocCoversDoctorRows` | every Doctor row has a matrix-doc row |
| `TestCapabilityMatrixDocMatchesDoctorSupportClasses` | doc support class == code support class |
| `TestCapabilityMatrixDocNonFullRowsCarryDisposition` | every non-`full` row names a proof path, issue, or explicit non-goal |

Known limit: the tests enforce **coverage, support class, and disposition — not
the prose notes**. Example of live drift (as of 2026-07-06): the doc's
`session_summary` note still says `/compact` uses `POST /v1/sessions/{id}/summarize`,
while the code row (updated by PR #238 for #224) correctly says `POST
/v1/sessions/{id}/compact` with a legacy `/summarize` fallback. Trust the code
row; fix doc prose when you touch a row.

### 1.3 Web/desktop truth — **no equivalent matrix exists (as of 2026-07-06)**

State this plainly in your ledger: web and desktop have **no capability matrix
document, no support-class rows, and no coverage-enforcing tests**. What exists:

- Typed decode only: `apps/core/src/wire/capabilities_types.ts`
  (`CapabilityFlags` with an index signature admitting unknown keys —
  so web *sees* unknown flags but nothing forces it to account for them).
  `apps/core/tests/capabilities.test.ts` asserts decode shape only.
- Scattered gating points — enumerate them with a grep, then **Read each file**
  (owner rule: read the evidence; do not stop at pattern matches):

```powershell
# Where web gates on capability flags (verified hits as of 2026-07-06):
#   apps/web/src/components/LeftRail.tsx            (nav entries require flags)
#   apps/web/src/routes/chatPaletteActionItems.ts   (capabilityActionItems)
#   apps/web/src/routes/ChatScreenModel.ts
#   apps/web/src/routes/chatPaletteItems.ts, ChatLayoutTypes.ts, discovery/HooksPage.tsx
git grep -ln "CapabilityFlags\|capabilities\[" -- apps/web/src apps/core/src
```

- Web Doctor page: `apps/web/src/routes/discovery/DoctorPage.tsx` shows backend
  health and `x_clio_capability_gaps` rows — it does **not** render a per-flag
  TUI-style support matrix.
- Rendering behavior truth (for transcript-shaped capabilities like thinking
  blocks, tool telemetry): `apps/web/RENDERING_SPEC.md` +
  `apps/web/CANONICAL-CONVERSATION.md` bind all three surfaces (per
  `apps/CLAUDE.md`) — see **gact-web-rendering-reference**.
- The rest of web/desktop truth comes from a **real-app walk**: launch the
  surface against the same backend, exercise the feature, and Read the rendered
  HTML/screenshots (see Phase 4 evidence rules).

### 1.4 Join the sources — run the ledger script

This skill ships a stdlib-Python ledger builder (verified against the emulator
on 2026-07-06; Python 3.14 is on this machine's PATH):

```powershell
python .claude/skills/gact-interface-parity-campaign/scripts/parity_ledger.py `
  --backend emulator=http://127.0.0.1:7777 `
  --backend clio=http://127.0.0.1:17800
```

It joins raw backend flags (per backend), the Go-decoded field set (parsed from
`emulator/pkg/gact/types.go` json tags), and the matrix-doc rows, and emits one
verdict per flag: `OK`, `UNDECODED-BY-GO`, `NO-MATRIX-ROW`, `STALE-MATRIX-ROW`.
Exit code 1 on any problem row. With two backends it also prints
flag-value disagreements. (**gact-diagnostics-and-tooling** has a capability-diff
script covering similar ground; either tool is fine — the point is the joined
table, not the tool.)

Web/desktop columns must be added by hand from 1.3 — that is the gap, and until
Phase 3(b) lands it stays manual.

### 1.5 Expected observations — and what to do if you see something else

| Expectation (verified 2026-07-06 unless dated otherwise) | If you see X instead → do Y |
|---|---|
| Emulator: `contract_version "0.2"`, 38 advertised keys, ledger script exits 0 (all rows OK) | Non-OK verdicts → this is your work queue; go to Phase 2 |
| clio advertises **28 of 30** v0.2 capabilities per README.md ("only LSP + voice intentionally out") — a README *claim*; the live map is the truth | Live count differs from README → README drift; route a docs fix through **gact-change-control**, citing the live JSON |
| clio: `session_summary=false`, `attachments_upload=false` (truthful since clio #760/#782) | Either `true` → probe the route; if it 404s the backend lies again → Phase 2 row 1 |
| Emulator advertises `session_summary/attachments_upload/voice/session_export/session_branching = true` and registers those routes — **deliberately broader than clio** | Treating emulator flags as clio truth → stop; this is the "emulator-only parity claim" wrong path (Phase 3 fences) |
| Emulator omits 15 of the 20 `x_clio_*` keys (`omitempty`, unset) — the `-` column in the ledger | A brand-new key appears in a backend's raw JSON that the ledger marks `UNDECODED-BY-GO` → Phase 2 row 2 (the "must not silently ignore new `x_clio_*` flags" doctrine) |
| `x_clio_*` values are mixed-type: strings (`x_clio_text_streaming`, `x_clio_hook_backend`), maps (`x_clio_hook_events`, `x_clio_stream_fallback_reasons`, `x_clio_capability_gaps`), booleans | A client typing them all as booleans → decode drift; fix the typed layer (this bit TS once; fixed in PR #248) |
| Matrix tests green | Red after you add/remove a Go field → the tests are doing their job: add the Doctor row + matrix row + disposition; never weaken the test |

---

## Phase 2 — Classify each gap

One classification per non-OK ledger row (or per hand-found web/desktop gap).
Work the table top to bottom; first match wins.

| # | Finding | Classification | Action |
|---|---|---|---|
| 1 | Flag `true` but its route returns 404/501 | **Backend lies** | clio-side issue (precedent: clio #760, fixed in Phase 0). Detector: conformance `checkCapabilityTruth` (`contract/conformance/drift_checks.go`, `capRouteProbes` — 9 probeable single-route flags). Before filing: fresh-build the backend and re-verify (**gact-debugging-playbook** — wrong-blame gates); the fix is server-side, never a client workaround |
| 2 | Backend advertises a key the client cannot decode (`UNDECODED-BY-GO`, or missing from TS types) | **Client blind** | Surface it: add the field to `gact.CapabilityFlags` (Go) and/or `capabilities_types.ts` (TS); the TUI tests then force a Doctor row + matrix row + support class + disposition. "Gated/none with stated reason" is a legitimate outcome — silent ignoring is not |
| 3 | Client shows a working affordance for a flag the backend advertises `false` (or fakes success on 404) | **Client fakes it — P0** | Violates the no-silent-fallback ground rule (CLAUDE.md, audit program). Fix immediately: hide the affordance or surface the structured error. Never ship a canned success |
| 4 | Same flag means different things on different surfaces | **Semantics fork** | Arbitrate spec-first: wire meaning → `contract/SPEC.md` + conformance; transcript rendering meaning → `apps/web/RENDERING_SPEC.md`. Live example (as of 2026-07-06, unresolved): `apps/core/src/wire/capabilities_types.ts` comments say `x_clio_files_content` was *removed* and replaced by `multimodal_image_parts` + workspace-scoped file reads, while the Go struct still decodes `x_clio_files_content` and the TUI matrix marks it `full`. Do not "fix" either side unilaterally — reconcile via SPEC (reality leads), then propagate |
| 5 | Feature surfaced on one surface, absent on another, no stated reason anywhere | **Parity gap (the core case)** | Write the ledger row; pick the fix from Phase 3. If intentionally absent (e.g. voice on TUI), the fix is a *stated reason* (matrix row `gated`/`none` + disposition), not necessarily code |
| 6 | Two backends disagree on a flag (emulator vs clio) | **Dialect divergence — usually expected** | Emulator is deliberately broader/looser (extra routes, pre-reconciliation event shapes). Record it; only escalate if a client depends on the emulator-only behavior. Emulator sync is an OPEN owner decision (Phase 3d) — don't assume |

Also fold in adjacent parity facts when classifying (all verified):

- Wire `contract_version` strings are **not** a capability signal: all five
  adapters still advertise `"0.1"` while spec/emulator report `"0.2"`. Flags
  are the only reliable gate.
- Desktop has a structural parity ceiling recorded in #232: the Rust SSE bridge
  discards `id:`/`event:` fields, so **desktop can never resume via
  Last-Event-ID** until the SSE-unification item lands. A "desktop misses
  events after reconnect" ledger row classifies here, not as a new bug.

## Phase 3 — Fix: ranked solution menu (with obligations)

Ranked by leverage. Each option carries obligations — take the option, take the
obligations.

**(a) Contract-owned generated types** — the remaining #232 item ("move Go wire
types out of emulator/pkg/gact", "explore codegen: types.py → TS + Go").
Ends the root cause: one wire, four hand-copied type systems (Python/Go/TS/
per-adapter) where every checked TS enum had drifted before PR #248.
*Obligations:* a codegen design reviewed via **gact-change-control** (this is
wire-adjacent → spec-first), and conformance/`wire_shapes.test.ts`-style proof
that generated output equals today's shapes before switching anything over.
*Status: open/candidate — not started as of 2026-07-06.*

**(b) Capability-matrix tests for web/desktop mirroring the TUI's** — the
direct fix for the 1.3 gap. Concretely: enumerate the decoded flag universe in
`apps/core` (the typed keys of `CapabilityFlags` — note the index signature
means you must also assert against a pinned expected-keys list), build a
`doctorCapabilityRows`-equivalent support-class table for web/desktop, and add
vitest checks mirroring `TestDoctorCapabilityRowsCoverDecodedCapabilityFlags` +
the doc-consistency trio, against a new web/desktop matrix doc.
*Obligations:* every non-full row carries a disposition; wire it into `pnpm -r
test` so it actually runs in CI (`.github/workflows/apps.yml`). New UI code
follows the no-accretion rule. *Status: proposed — nothing exists as of
2026-07-06; this is the highest-value unowned slice of the campaign.*

**(c) Single transcript projection shared live/reload** — #233 phase 2.
Phase 1 (parts-only projection, synced semantic allow-list) merged as PR #249
(commit c1e96579, on origin/develop 2026-07-02). Phase 2 is **GATED**: it waits
on #232's authoritative-streaming-channel decision AND clio #767 (single-writer
TurnTranscript). **Do NOT start it before both land** — starting early
re-creates the live≠reload dual-normalization failure the audit called out.
*Obligations when unblocked:* delete (not bypass) the client prose filters;
live and reload render byte-identically. *Status: blocked as of 2026-07-06.*

**(d) Emulator dialect sync** — make the emulator emit the codified clio shapes
(`session.snapshot` preamble, `replay:true`, `turn_id`/`stream_source`/
`final_text` on part events, `text_append` for thinking, drop `cost.updated`).
*This is an open question with NO recorded decision* (#232's checklist covers
type ownership, not emulator event-shape sync; the TUI's dual-dialect tolerance
in `live_events.go`/`live_message_parts.go` currently depends on the looser
dialect existing). **Owner-decision gate: raise it, don't assume.** Syncing
unilaterally could mask the TUI's liberal-parsing coverage; not syncing means
"green against emulator" keeps proving less than it appears to.

### Wrong paths — fenced

| Fence | Why (with receipt) |
|---|---|
| **Never add client-side compensations/dedup/filters** for a backend quirk | Genericity rule (Phase 0). The existing `dedupToolThought`/`dedupeRepeatedText`/`clioScaffolding`/TUI normalization pipeline are *scheduled for deletion* after clio #767/#732/#736 — adding more digs the hole deeper. History: **gact-failure-archaeology** (the render/dedup saga) |
| **Never build on the `turn.*` normalized channel** | SPEC §7.3c marks it provisional, double-published with zero consumers; codify-or-deprecate is pending in #232. Building on it risks deletion under you |
| **Never test against the emulator only and claim clio parity** | Emulator advertises flags clio truthfully denies and registers routes clio lacks; conformance's capability-truth check is self-relative (flag vs own routes), so both pass while differing. clio claims need a clio run |
| **Never trust wire `contract_version` strings** | All five adapters say "0.1"; stale markers exist in package docs too. Gate on flags |
| **Never close a parity row on green tests alone** | Owner rule: green tests never close a UI issue — drive the real app, Read the rendered output (Phase 4) |

## Phase 4 — Validate and promote

Run every gate; each has an "if X instead → Y".

**Gate 1 — Conformance green on every backend you claim.**

```powershell
cd tui; go build -o gact.exe . ; ./gact.exe conformance --backend http://127.0.0.1:7777
./gact.exe conformance --backend http://127.0.0.1:17800   # the clio you brought up
```

Exit 0 = pass; failed sections are listed on stderr (skip sections with
`--skip Name,Name`). Note: the suite creates its own workspace/session and
POSTs messages — it mutates backend state; point it at a disposable backend,
not a session you care about. *If a section fails →* that's a contract break,
not a parity note: stop and route through **gact-change-control** (spec-first).

**Gate 2 — Matrix tests green (TUI; plus web/desktop once 3(b) exists).**

```powershell
go test ./tui/internal/ui -run "TestDoctorCapabilityRows|TestCapabilityMatrixDoc" -count=1
```

*If red →* fix rows/doc, never the test. *If a row had to become
`partial`/`gated`/`none` →* it must carry a disposition (issue link, proof
path, or explicit non-goal) — an "unknown" or empty disposition is an
unexplained row and fails the campaign.

**Gate 3 — Ledger clean.** Re-run `parity_ledger.py` against every backend in
scope: exit 0, and every backend-vs-backend difference in the footer is either
expected (1.5 table) or has a Phase 2 classification with an issue. *If a
problem row remains →* the campaign is not done; no unexplained rows, period.

**Gate 4 — Real-app evidence on all three surfaces.** Green tests do not close
parity work (owner rule). Drive each surface against the same backend and
capture:

- TUI: fresh screenshot via the `tui-screenshot` skill (or `make screenshots`
  in Git Bash); UI-touching work must land a curated capture under
  `screenshots/` per CLAUDE.md.
- Web: `pnpm --filter @clio/web test:visual` refreshes
  `apps/web/screenshots/` (required by `apps/CLAUDE.md`), or a live walk with
  the browser tools.
- Desktop: run the Tauri dev/debug build (see **gact-run-and-operate**) and
  screenshot the same flow.

Then **Read the evidence with the Read tool** — the actual PNG/HTML/log files,
not a grep for an expected string. Owner rule (2026-07-06): pattern filters
keep missing unknown errors; if context is tight, send a subagent to read and
summarize. *If a surface can't demonstrate the capability →* back to Phase 2;
the ledger row was wrong or the fix incomplete.

**Gate 5 — Change-control routing.** Wire-visible behavior (new flag, changed
route/event/shape) starts in `contract/SPEC.md` + conformance and propagates
out (spec-first). Visible UX changes need owner ack before being treated as
settled (precedent: PR #249's inline thinking row shipped flagged "owner ack
requested"). Commit/PR conventions, branch model (`develop`, not `main`):
**gact-change-control**. *If your fix skipped the spec →* it is not done, even
if merged.

### Campaign success criteria (all must hold)

- [ ] Parity ledger: zero unexplained rows across emulator + at least one real clio
- [ ] Every explained row names an issue, proof path, or explicit non-goal
- [ ] Gates 1–5 all pass, with dated evidence artifacts
- [ ] No new client-side semantics/filters were introduced anywhere in the diff
- [ ] Anything owner-gated (3c timing, 3d decision, visible UX) is explicitly awaiting ack, not silently decided

## Provenance and maintenance

Facts above dated 2026-07-06 drift. One-line re-verification commands (repo root):

| Claim | Re-verify with |
|---|---|
| Decoded Go flag set (33 standard + 20 x_clio) | `git grep -n "json:\"" -- emulator/pkg/gact/types.go` (CapabilityFlags block) |
| Matrix rows = 53, classes intact | `python .claude/skills/gact-interface-parity-campaign/scripts/parity_ledger.py --backend emulator=http://127.0.0.1:7777` |
| Enforcement tests exist + green | `go test ./tui/internal/ui -run "TestDoctorCapabilityRows|TestCapabilityMatrixDoc" -count=1` |
| Emulator flag values / port 7777 default | boot emulator; `curl.exe -s http://127.0.0.1:7777/v1/capabilities` |
| README 28/30 claim | `git grep -n "28 of 30" README.md` vs a live clio capabilities fetch |
| clio session_summary/attachments truthfully false | live clio fetch + SPEC §3.3 note (`git grep -n "clio #760/#782" contract/SPEC.md`) |
| #232/#233/#237 open, checklist state | `gh issue view 232` / `233` / `237` (remember: fixes merge to `develop`; issue state misleads) |
| #233 phase 1 merged (PR #249) | `gh pr view 249 --json state,mergedAt` |
| Web has no matrix/tests (Phase 3b still open) | `git grep -ln "doctorCapabilityRows\|CapabilityMatrix" -- apps/` (expect no output — no matrix equivalent) |
| Web gating points list | `git grep -ln "CapabilityFlags\|capabilities\[" -- apps/web/src apps/core/src` |
| `gact capabilities` / `gact conformance` CLI | `tui/cli_backend_metadata.go`, `tui/cli_diagnostics.go`, dispatch in `tui/cli_dispatch.go` |
| x_clio_files_content semantics fork (Phase 2 row 4 example) | Read `apps/core/src/wire/capabilities_types.ts` comments vs the Go struct + matrix row |
