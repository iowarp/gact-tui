# clio ↔ human interaction channel — implementation & verification plan

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-07-03 |
| **Scope** | Design → implementation → real-run verification of the four interaction semantics across three repositories |
| **Companion — design/rationale** | `docs/clio-interaction-channel-design.md` (the *what* and *why*) |
| **Prior art** | `clio-mcp-ui-design-brief.md` (June 27; superseded on transport & phasing) |
| **External specs** | MCP Apps (SEP-1865); MCP elicitation + Multi Round-Trip Requests (SEP-2322, 2026-07 RC); Claude Agent SDK user-input |

This document is the execution spec. It defines the deliverables, the acceptance criteria, the
real-run verification methodology, and the orchestration by which the work is produced. It
assumes the architecture settled in the design companion and does not re-argue it; §3 restates
only what is needed to make the deliverables and acceptance criteria unambiguous.

---

## 1. Purpose

Deliver, and verify against a real running stack, a single cohesive capability: a **bidirectional
structured interaction channel** between the agent and the human, comprising four semantics —
`choice`, `form`, `url`, `show` — implemented across `clio-agent`, `gact-tui`, and `clio-kit`,
and proven end-to-end with a live LLM (Claude Code / Haiku) rather than against the emulator alone.

The unit of success is **real-run evidence per semantic**, not a green test suite. The emulator
and conformance suite are necessary but not sufficient; final acceptance is a driven turn against
the integrated stack.

## 2. System context

Three repositories, one shared spine.

| Repository | Role in this work | Language / toolchain |
|---|---|---|
| **clio-agent** (orchestration root) | Backend: tool executor, elicitation handling, capability translation, answer-submission endpoint, the boot/web skills, provider integration | Python / uv, FastMCP, Claude Agent SDK (one provider of several) |
| **gact-tui** (submodule) | Wire contract + conformance (the spine), emulator, Go TUI, web frontend | Go workspace (7 modules), pnpm web workspace |
| **clio-kit** (submodule) | MCP servers that produce `show` and `elicitation` — here, the EarthScope geo/station and `plot_timeseries` tools | Python / uv, FastMCP ≥ 3.x |

**Shared spine:** `gact-tui/contract/SPEC.md` + `contract/conformance`. All three repositories
implement against the settled spec; the spec is authored once and first (spec-first). This is what
keeps a three-repository effort a single entity rather than three drifting half-builds.

## 3. Architecture (restatement for acceptance clarity)

Full rationale is in the design companion. The load-bearing facts the deliverables depend on:

1. **Three primitives, separated by initiator** (not merged through any single SDK callback):
   - `ask_user_question` — **LLM-initiated**; a clio-native tool (shell_bash-shaped,
     provider-agnostic) whose executor parks the call and resumes on an out-of-band re-POST.
   - **permission / approval** — **host/policy-initiated**; the existing process-global gate,
     reused, not reinvented.
   - **MCP elicitation** — **server-initiated, mid-tool**; the SEP-2322 round-trip
     (`InputRequiredResult` → collect → re-issue), LLM-blind.
2. **No new turn-state machine.** Blocking interactions reuse the existing tool-call suspension
   and generalize the existing permission-response round-trip; non-blocking `show` artifacts ride
   "a later user message with attached state." The only new wire elements are: interaction
   **payload shapes**, a **"human-completable" flag** on a pending `tool_call`, and an
   **answer-submission endpoint**.
3. **Transport is REST + SSE, unchanged.** Interaction is modeled as the MRTR round-trip; there is
   **no** duplex/WebSocket lane.
4. **Payloads are opaque and self-describing** — the contract carries `{action, content}`;
   `content` is component-defined (natural language + optional structure/pixels). No universal
   "pointing" schema.
5. **Capability-gated per kind**, and elicitation support is a **derived, per-session** property
   that clio-agent translates from the frontend's GACT capabilities down to the MCP client
   capabilities it declares to clio-kit. Every producer has a real fallback; no silent fallback.

## 4. The four semantics — definitions and acceptance criteria

Each semantic is accepted only when its **real-run** criterion is met (§6), in addition to unit,
integration, and conformance coverage.

### 4.1 `choice` (AskUserQuestion)
- **Definition.** The LLM calls `ask_user_question` with 1–4 questions, each with a header, 2–4
  options (label + description), and a `multiSelect` flag. The turn suspends at the tool-call
  boundary; the human answers; the answer returns as the tool result; the loop resumes.
- **Acceptance.** A driven turn in which the agent asks, the driver answers, the tool completes
  with the selected label(s), and the agent visibly continues using the answer. A free-text
  ("Other") answer returns as content, not as a wire field.

### 4.2 `form` (elicitation, form mode)
- **Definition.** A clio-kit tool, mid-execution, returns `InputRequiredResult` carrying a
  flat-primitive `requestedSchema`. clio-agent surfaces the form (gated per-session), collects the
  answer, and re-issues the original call with `inputResponses`.
- **Acceptance.** A driven turn hitting a form elicitation that the driver fills and submits, the
  tool re-issues and completes, **and** a negative case where the session lacks form support and
  the producer returns `action: "decline"` with a structured reason (no silent fallback).

### 4.3 `url` (elicitation, URL mode)
- **Definition.** A server requests the human open an external URL for a sensitive interaction
  that must not pass through the client.
- **Acceptance.** A driven turn in which the full URL is shown, is **not** pre-fetched or
  pre-authenticated, is opened in a sandboxed context, and the response carries `action` only (no
  `content`). The security obligations are part of acceptance, not optional.

### 4.4 `show` (MCP-UI) — EarthScope, two surfaces
- **Definition.** A clio-kit tool returns a `ui://` HTML resource rendered in a sandboxed CSP
  iframe on the web frontend; the human interacts; the selection returns to the model as a
  self-describing payload attached to the next turn. The Go TUI renders the text fallback.
- **Surfaces (both EarthScope):**
  - **geo/station map** — the founding consumer; render stations, select one, submit; the
    selection round-trips to the model (`human → LLM`).
  - **`plot_timeseries`** — interactive chart (zoom, legend toggle, hover-snap) **and** the
    brush-a-window → re-render-to-static-export loop: the human brushes a time window and asks in
    natural language for a paper-ready static ("just this timeframe, north only, no title"); the
    agent re-invokes the tool with the refined params and returns the static artifact.
- **Acceptance.** For each surface: the resource **renders** in the LLM-visible web UI (map +
  stations / plotted series; absence of tiles or series indicates a CSP failure to resolve), and a
  human interaction **round-trips** to the model, which acts on it. Per project decision, `show`
  passes on "renders + selection round-trips" with **refinement notes** recorded; polish and MCP
  refinements are expected follow-ups, not blockers.

## 5. Work breakdown by repository

All deliverables are implemented against the settled spec (§7, phase Spec) and must leave their
repository building and passing its own tests.

### 5.1 gact-tui (the spine + client)
- `contract/SPEC.md`: the interaction section — the `interaction` payload kinds, the
  human-completable `tool_call` flag, the answer-submission endpoint (as a generalization of the
  permission-response path), the per-kind + elicitation capability flags. Additive/extensible;
  old clients degrade to text.
- `contract/conformance`: checks for the above, including capability↔route truth and the
  unknown-kind → placeholder + fallback rule.
- `emulator/`: implement all four round-trips so the channel is independently testable.
- `tui/internal/ui`: render `choice`/`form`/`url` natively; text fallback for `show`; wire the
  answer-submission path; refresh a screenshot.
- `apps/web`: sandboxed CSP iframe for `show`; `choice`/`form`/`url` renderers; the self-describing
  return payload including annotation-on-selection in a reusable component.

### 5.2 clio-agent (the backend)
- `ask_user_question` as a native tool whose executor parks the call and resumes on the
  answer-submission re-POST. **Not** a canUseTool-only bridge.
- MCP elicitation handling: SEP-2322 `InputRequiredResult` → collect → re-issue, with per-session
  capability translation (GACT caps → MCP client caps) and optimistic-declare + per-session gate.
- The answer-submission endpoint, generalizing the existing permission-response mechanism.
- Reuse of the existing permission gate for approvals.

### 5.3 clio-kit (the producers)
- EarthScope geo/station server: emit a `ui://` interactive station map fed the GeoJSON + bbox it
  already computes; retain the PNG as text fallback.
- `plot_timeseries`: emit an interactive `ui://` chart; accept `range` / `series` / `title` /
  `format` parameters so the agent can re-render a static export; report the brushed selection
  semantically (domain values, not pixels).
- One `form` and one `url` elicitation path, each with a real fallback branch when the client
  cannot render.

## 6. Verification & real-run methodology

Final acceptance is a driven turn against the **integrated, live** stack.

1. **Boot.** Invoke the clio-agent boot skill to launch clio + clio-kit with provider
   **Claude Code / Haiku** and a web server visible to the LLM. Haiku is a real LLM and removes
   the ALCF-token dependency for verification.
2. **Drive the human.** The human side of every interaction (`choice` answer, `form` fill, `url`
   accept, station click, plot brush) is played by the **same mechanism the existing scripts use
   to accept permissions**. This is a solved capability; there is no separate "can it click"
   problem.
3. **Per-semantic acceptance.** Drive one real turn per semantic (§4), capturing evidence
   (transcripts, logs, screenshots). `choice`/`form`/`url` pass on strict criteria; `show` passes
   on "renders + selection round-trips" with refinement notes.
4. **Fix loop.** On failure, fix the root cause in the correct repository (invariant-preserving),
   rebuild, **re-boot**, and re-verify. The boot is inside the loop so code fixes are re-exercised.
5. **Data.** The EarthScope surfaces are verified against real EarthScope station/timeseries data,
   not synthetic toys; the dataset path is a required input.

**Definition of done.** All four semantics show real-run evidence; `choice`/`form`/`url` fully
pass (including the negative no-support/decline path and the URL security obligations); `show`
renders and round-trips for both EarthScope surfaces with any residual items captured as
refinement notes; every repository builds and passes its own suite; the conformance suite is green.

## 7. Orchestration

The work is produced by a single multi-agent workflow rooted in clio-agent (script:
`clio-interaction-channel-e2e`). Phases:

| Phase | Purpose | Autonomy |
|---|---|---|
| **Ground** | Read-only survey of all three repos, the boot/web skills, and the permission-accept driver | Autonomous |
| **Spec** | Settle the wire as one entity; adversarial critique loop; write `SPEC.md` + conformance | Autonomous |
| **Implement** | clio-agent + gact-tui + clio-kit in parallel (isolated by submodule directory), keyed off the spec | Autonomous |
| **Verify** | Boot the real stack (Haiku); drive one real turn per semantic; fix → re-boot → re-check loop | Autonomous with **human-assisted unblocks** likely on boot, data, and `show` |

**Required inputs (must be supplied before launch):** the real boot skill name; the
permission-accept/drive mechanism; the EarthScope dataset path; the submodule layout. These are
configuration, not code, and are the only launch prerequisites.

The full orchestration script is in **Appendix A**.

## 8. Invariants (constraints on every deliverable)

1. No new turn-state machine; reuse tool-call suspension + the permission-response round-trip.
2. `ask_user_question` is a clio-native tool, provider-agnostic; not an SDK canUseTool bridge.
3. REST + SSE only; interaction is the SEP-2322 round-trip; no duplex lane.
4. Opaque, self-describing payloads; `content` is component-defined; no universal pointing schema.
5. Elicitation gated per-session, derived end-to-end; every producer has a real fallback; no
   silent fallback.
6. Capability-gate every kind (`interaction_choice`/`form`/`url`/`show` + model-vision); the TUI
   falls back to text on `show`.
7. Spec-first: wire changes land in `SPEC.md` + conformance before any implementation.
8. One cohesive entity; the EarthScope map is the founding `show` consumer, designed with the
   substrate — not a later phase.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `show` rendering fails on CSP/tiles/JS | Verify in the LLM-visible web context; "renders + round-trips" gate with refinement notes; CSP whitelist / inline-bundle per the design brief |
| Simulated human diverges from real UX | Autonomous verify proves the mechanism; a human UX pass is a distinct, recommended follow-up |
| Three toolchains + submodule wiring | Ground phase maps all build/boot commands; natural directory isolation avoids parallel-edit conflicts |
| Real-run flakiness / rate limits (Haiku) | Sequence-tolerant verify; fix loop bounded; human-assisted unblock accepted |
| Cross-repo drift | Single settled spec authored first; all repos key off it |

## 10. Out of scope / deferred

- **Darshan** I/O timeline and all other clio-kit `show` producers (pandas, hdf5, slurm, chronolog,
  …) — the substrate supports them; they are added later as independent consumers.
- Desktop frontend beyond inheriting the web renderer; the "open in browser" TUI hand-off.
- Production provider wiring (ALCF); verification uses Haiku.
- The pixel/VLM grounding path beyond what a self-describing payload needs; gated on model vision.

## 11. Open questions

1. Confirm the exact `InputRequiredResult` / SEP-2322 envelope against the pinned MCP spec.
2. Confirm FastMCP's proxy preserves `_meta.ui` on re-exposed tools (design brief §6 Q1).
3. Finalize the URL-mode security checklist (full URL shown, no pre-fetch/pre-auth, sandboxed open)
   as conformance assertions, not prose.

---

## Appendix A — orchestration workflow script

Run from the **clio-agent** root with `gact-tui` and `clio-kit` as submodules. Not launched by
this document. `CONFIG` holds the values only the operator knows (real skill names, dataset path,
submodule layout); `INVARIANTS` (§8) is injected into every agent so no sub-agent drifts back into
a rejected design. `show` verification covers **both** EarthScope surfaces — the geo/station map
and `plot_timeseries` (including the brush → static-export loop).

```js
export const meta = {
  name: 'clio-interaction-channel-e2e',
  description: 'Implement the agent↔human interaction channel across clio-agent + gact-tui + clio-kit and verify all four semantics against a real Haiku-driven run',
  phases: [
    { title: 'Ground',    detail: 'map all three repos, the boot/web skills, and the permission-accept driver' },
    { title: 'Spec',      detail: 'settle the wire as ONE entity; adversarial critique; write SPEC + conformance' },
    { title: 'Implement', detail: 'clio-agent + gact-tui + clio-kit in parallel, keyed off the spec' },
    { title: 'Verify',    detail: 'boot the real stack (Haiku) and drive a real turn per semantic; fix→reboot→recheck loop' },
  ],
}

// ── CONFIG: fill with the real clio-agent skill names / paths ────────────────
const CONFIG = {
  bootSkill:    '<clio-agent skill that boots clio + clio-kit with claude_code/Haiku + LLM-visible web server>',
  driveHuman:   '<mechanism/skill the scripts already use to accept permissions — reused here to answer/click>',
  provider:     'claude_code',            // Haiku, real LLM, cheap
  earthscope:   '<path/dataset for the EarthScope geo/station + plot_timeseries data>',
  submodules:   { gact: 'external/gact-tui', kit: 'external/clio-kit' }, // adjust to real layout
}

const INVARIANTS = `
NON-NEGOTIABLE INVARIANTS (any violation is a defect). Ref: external/gact-tui/docs/clio-interaction-channel-design.md
1. NO new turn-state machine. Blocking interactions reuse the EXISTING tool-call suspension and
   generalize the EXISTING permission-response round-trip. Non-blocking artifacts (show) ride "a
   later user message with attached state." Only new wire bits: payload shapes, a
   "human-completable" flag on a pending tool_call, and an answer-submission endpoint.
2. ask_user_question is a clio-native TOOL (shell_bash-shaped, provider-agnostic), NOT an SDK
   canUseTool bridge. clio is multi-provider. Executor parks the call, resumes on out-of-band re-POST.
3. Stay on REST+SSE. Model interaction as the MCP SEP-2322 round-trip. NO duplex/WebSocket lane.
4. Payloads are opaque + self-describing: contract carries {action, content}; content is
   component-defined (NL + optional structure/pixels). No universal "pointing" schema.
5. Elicitation is capability-gated PER SESSION, derived end-to-end (frontend GACT caps →
   clio-agent MCP client caps → clio-kit). Every producer has a REAL fallback. No silent fallback.
6. Capability-gate every kind (interaction_choice/form/url/show + model-vision). Go TUI renders
   choice/form/url natively, falls back to text on show.
7. Spec-first: wire changes land in external/gact-tui/contract/SPEC.md + conformance BEFORE any impl.
8. ONE cohesive entity, NOT render-only-then-bridge phases. EarthScope geo/station map is the
   founding show consumer that exercises the return direction and is designed WITH the substrate.
`

// ── Ground ──────────────────────────────────────────────────────────────────
phase('Ground')
const SURVEYS = [
  ['contract', `${CONFIG.submodules.gact}/contract/SPEC.md + /conformance: the Part model, ` +
    `capability gating, the tool-call lifecycle, the permission round-trip, SSE event shapes`],
  ['agent-exec', `clio-agent: the tool executor and provider layer (how a tool call is dispatched ` +
    `and awaited), the permission gate + how the existing skills ACCEPT permissions programmatically ` +
    `(the driver we reuse to play the human), and MCP-client capability negotiation`],
  ['agent-skills', `clio-agent: the boot/web skills — how to launch clio + clio-kit with ${CONFIG.provider}/Haiku ` +
    `and a web server the LLM can see; how a run is driven and observed end-to-end`],
  ['kit-earthscope', `${CONFIG.submodules.kit}: the geo/EarthScope server (render_feature_map & friends) ` +
    `AND plot_timeseries; its FastMCP version; whether MCP Apps (ui://) + elicitation are available`],
  ['frontends', `${CONFIG.submodules.gact}/tui/internal/ui and ${CONFIG.submodules.gact}/apps/web: the ` +
    `render seams where choice/form/url render and where a sandboxed CSP iframe (show) mounts`],
]
const map = await parallel(SURVEYS.map(([k, q]) => () =>
  agent(`Read-only survey. Map the CURRENT reality of: ${q}. Return concrete files, symbols, line ` +
        `refs, build/boot commands, and the exact seams a new feature attaches to. No changes.\n${INVARIANTS}`,
        { agentType: 'Explore', label: `ground:${k}` })))

// ── Spec (one entity, adversarially hardened, spec-first) ────────────────────
phase('Spec')
const DSCHEMA = { type:'object', required:['spec'], properties:{ spec:{type:'string'},
  parts:{type:'array',items:{type:'string'}}, endpoints:{type:'array',items:{type:'string'}},
  capabilities:{type:'array',items:{type:'string'}}, openQuestions:{type:'array',items:{type:'string'}} } }

let design = await agent(
  `Ground map:\n${JSON.stringify(map)}\n\nProduce the SETTLED wire design for the interaction ` +
  `channel as ONE entity: interaction payload kinds (choice/form/url/show), the human-completable ` +
  `tool_call marker, the answer-submission endpoint as a GENERALIZATION of the existing ` +
  `permission-response path, per-kind + elicitation capability flags (derived per-session), and the ` +
  `EarthScope geo/station-map + plot_timeseries show consumers that exercise the return direction. ` +
  `Ground every decision in the real files.\n${INVARIANTS}`, { schema: DSCHEMA, label: 'spec:design' })

for (let r = 0; r < 3; r++) {
  const crit = await parallel(
    ['anti-phasing/dead-code', 'invariant-compliance', 'extensibility & reconnect-replay']
    .map(lens => () => agent(
      `Adversarially critique this design through the "${lens}" lens. Hunt for: an invented turn ` +
      `state, SDK-locked ask_user_question, a needed duplex lane, broken per-session gating, silent ` +
      `fallback, or dead scaffolding.\nDesign:\n${JSON.stringify(design)}\n${INVARIANTS}`,
      { label: `spec:crit:${lens.slice(0,14)}`,
        schema:{ type:'object', required:['clean','issues'],
          properties:{ clean:{type:'boolean'}, issues:{type:'array',items:{type:'string'}} } } })))
  const issues = crit.filter(Boolean).flatMap(c => c.issues)
  if (!issues.length) { log(`spec clean after ${r+1} round(s)`); break }
  design = await agent(`Resolve ALL of these without violating any invariant:\n${JSON.stringify(issues)}` +
    `\nCurrent:\n${JSON.stringify(design)}\n${INVARIANTS}`, { schema: DSCHEMA, label: `spec:revise-${r+1}` })
}

const spec = await agent(
  `Write the concrete contract section in ${CONFIG.submodules.gact}/contract/SPEC.md AND the ` +
  `conformance checks in ${CONFIG.submodules.gact}/contract/conformance for this settled design. ` +
  `Additive/extensible only; old clients degrade to text. Edit the real files.\n` +
  `Design:\n${JSON.stringify(design)}\n${INVARIANTS}`, { label: 'spec:write', effort: 'high' })

// ── Implement (three repos in parallel; naturally isolated by submodule dir) ──
phase('Implement')
const REPOS = [
  ['clio-agent', `Implement the backend half in clio-agent: ask_user_question as a native tool whose ` +
    `executor parks the call and resumes on the answer-submission re-POST; MCP elicitation handling ` +
    `(SEP-2322 InputRequiredResult → collect → re-issue) with per-session capability translation; the ` +
    `answer-submission endpoint as a generalization of the permission-response path. Reuse the existing ` +
    `permission gate; do NOT add a canUseTool-only bridge.`],
  ['gact-tui', `In ${CONFIG.submodules.gact}: implement the emulator round-trips (so the channel is ` +
    `independently testable), the Go TUI (choice/form/url native + text fallback for show + the ` +
    `answer-submission path + a fresh screenshot), and apps/web (sandboxed CSP iframe for show, ` +
    `choice/form/url renderers, self-describing return incl. annotation-on-selection in a reusable component).`],
  ['clio-kit', `In ${CONFIG.submodules.kit}: (1) make the geo/EarthScope server emit a ui:// interactive ` +
    `station map (show) fed the GeoJSON + bbox it already computes, keeping the PNG as text fallback; ` +
    `(2) make plot_timeseries emit an interactive ui:// chart, accept range/series/title/format params so ` +
    `the agent can re-render a static export, and report the brushed selection SEMANTICALLY; ` +
    `(3) add one form + one url elicitation path with a REAL fallback branch when the client can't render.`],
]
const built = await parallel(REPOS.map(([name, task]) => () =>
  agent(`Spec is authoritative:\n${spec}\n\nImplement ONLY ${name}: ${task}\nBuild and run that ` +
        `repo's tests before returning; report build/test status.\n${INVARIANTS}`,
        { label: `impl:${name}`, effort: 'high' })))
log(`implemented: ${built.filter(Boolean).length}/${REPOS.length} repos`)

// ── Verify against a REAL run: boot → drive one turn per semantic → fix loop ──
phase('Verify')
const SEMANTICS = [
  ['choice', `Drive a real turn where the agent calls ask_user_question. Using ${CONFIG.driveHuman}, ` +
    `answer it. Confirm the tool completes with the answer and the loop resumes. Capture evidence.`],
  ['form',  `Drive a turn hitting a clio-kit elicitation FORM. Using ${CONFIG.driveHuman}, fill and ` +
    `submit. Confirm the tool re-issues and completes. Confirm the no-support path DECLINES with a ` +
    `structured reason (no silent fallback). Capture evidence.`],
  ['url',   `Drive a turn hitting an elicitation URL request. Confirm the security obligations: full ` +
    `URL shown, no pre-fetch/pre-auth, sandboxed open. Using ${CONFIG.driveHuman}, accept. Capture evidence.`],
  ['show-map', `EarthScope geo server returns the interactive station map. In the LLM-visible web UI, ` +
    `confirm it RENDERS (map + stations; watch for CSP/tiles). Using ${CONFIG.driveHuman}, click a ` +
    `station and submit; confirm the selection round-trips to the model and it acts. "Kinda works" ` +
    `is acceptable — record refinementNotes, do not fail on polish. Dataset: ${CONFIG.earthscope}. Screenshots.`],
  ['show-plot', `EarthScope plot_timeseries returns the interactive chart. Confirm it RENDERS (series, ` +
    `zoom, legend, hover-snap). Using ${CONFIG.driveHuman}, BRUSH a time window, then ask in NL for a ` +
    `paper-ready static "just this timeframe, north only, no title"; confirm the agent re-invokes with ` +
    `refined params and returns the static export. "Kinda works" acceptable — record refinementNotes. Screenshots.`],
]
const VSCHEMA = { type:'object', required:['semantic','pass','evidence'], properties:{
  semantic:{type:'string'}, pass:{type:'boolean'}, evidence:{type:'string'},
  failures:{type:'array',items:{type:'string'}}, refinementNotes:{type:'array',items:{type:'string'}} } }

let results = []
for (let round = 1; round <= 3; round++) {
  await agent(`Boot the full real stack: invoke the clio-agent skill ${CONFIG.bootSkill} with provider ` +
    `${CONFIG.provider} (Haiku) and the LLM-visible web server. Confirm clio + clio-kit are healthy and ` +
    `reachable. Report the endpoints.\n${INVARIANTS}`, { label: `verify:boot-${round}`, effort: 'high' })

  results = await parallel(SEMANTICS.map(([k, task]) => () =>
    agent(`Against the booted real stack, VERIFY the "${k}" semantic end-to-end:\n${task}\n` +
          `Return pass + evidence (+ failures / refinementNotes).\n${INVARIANTS}`,
          { label: `verify:${k}-${round}`, effort: 'high', schema: VSCHEMA })))

  const isShow = s => s === 'show-map' || s === 'show-plot'
  const failed = results.filter(Boolean).filter(r => !r.pass && !isShow(r.semantic))
  const showBad = results.filter(Boolean).filter(r => isShow(r.semantic) &&
    !(r.pass || /render|selection|round.?trip|static/i.test(r.evidence || '')))
  if (!failed.length && !showBad.length) { log(`real-run green (round ${round})`); break }

  const fixList = [...failed.flatMap(f => f.failures || []),
                   ...showBad.flatMap(s => s.failures || [`${s.semantic} did not render/round-trip`])]
  log(`round ${round}: fixing ${fixList.length} real-run failure(s)`)
  await agent(`These failed against the REAL run. Fix the ROOT cause in the correct repo (clio-agent / ` +
    `${CONFIG.submodules.gact} / ${CONFIG.submodules.kit}) without violating any invariant, then ensure ` +
    `each repo still builds + tests:\n${JSON.stringify(fixList)}\n${INVARIANTS}`,
    { label: `verify:fix-${round}`, effort: 'high' })
}

return {
  spec: spec.slice(0, 400) + '…',
  verified: results.filter(Boolean).map(r => ({ semantic: r.semantic, pass: r.pass,
    evidence: r.evidence, refinementNotes: r.refinementNotes || [] })),
}
```
