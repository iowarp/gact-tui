---
name: gact-proof-and-analysis-toolkit
description: First-principles proof recipes for gact-tui — load this when you need to PROVE a claim instead of asserting it. Triggers - duplicate/doubled text on any surface ("who emitted this byte?"), "is it really streaming or batch?", live render differs from reload, a regression report you are about to act on, _UnsupportedSessionAgent in a live gate, "does this backend really support X?", deciding whether a fix idea should be adopted or retired, or any investigation where you are tempted to say "probably" without numbers. Recipes - wire-capture differential, temporal-ordering assertion, live==reload parity, stale-build discrimination, harness-misconfig differential, capability-truthfulness probe, hypothesis discipline, idea lifecycle.
---

# GACT proof and analysis toolkit

Prove it, don't just claim it. This skill is the repo's collection of proof recipes: for each
class of claim ("the backend emitted this twice", "events streamed live", "this flag is honest",
"this regression is real"), a procedure whose output is evidence a skeptic can re-run — not a
narrative. Every recipe here has a worked example from this repo's actual history, including the
failures that happened when the recipe was skipped.

**Definitions used throughout** (defined once):

| Term | Meaning |
|---|---|
| SSE | Server-Sent Events — the one-way `text/event-stream` HTTP stream backends use to push events (`message.part.delta`, `tool.call.started`, ...) to clients. |
| clio | The canonical real backend (iowarp/clio-agent, a separate repo — on this machine at `D:\Libraries\Documents\projects\clio-agent`). In prose, say "clio", not "the sidecar". |
| emulator | This repo's scriptable GACT backend (`emulator/`), used for keyless deterministic proofs. |
| stream-audit | clio's stage-by-stage capture of a turn, enabled with `CLIO_STREAM_AUDIT_LOG=<path>` at clio launch (JSONL, one row per pipeline stage per delta). |
| sse-dump | clio's raw SSE event log, enabled with `CLIO_SSE_EVENT_LOG=<path>` at clio launch. |
| dspy.extract | clio's end-of-turn synthesis step. Its answer IS the return synthesis — it is NOT a duplicate of the last loop thought. Misreading this caused a whole retired architecture (see Recipe 8). |
| JSONL | One JSON object per line — the format of all capture/timeline artifacts here. |
| golden test | A test comparing rendered output byte-for-byte against a committed `testdata/*.golden` file. |

## The method (read this before any recipe)

Every investigation here follows the same discipline. Recipes 1–6 are instruments; this is how
you use them.

1. **State the mechanism, not the symptom.** "Text appears twice" is a symptom. "The backend
   stores the same `next_thought` on both a `text` part and `tool_call.thought`, and the client
   renders both" is a mechanism.
2. **Predict numbers BEFORE running the instrument.** Write down what the capture will show if
   your mechanism is true. Real example from the `●●` answer-doubling investigation: *"if
   `tool_observer` injects the duplicate, the stream-audit will show exactly ONE LLM emission of
   each `next_thought`, and the second copy will appear only on `tool_call.thought`, never as a
   second provider delta."* That prediction was confirmed and is now quoted in the code comment
   at `apps/web/src/components/transcriptDelegationModel.ts` (above `dedupToolThought`).
3. **One mechanism must explain ALL observations — including the negatives.** If your mechanism
   explains why session A doubles but not why session B doesn't, it is not yet the mechanism.
   Some investigations correctly end with "expected behavior, documented": the "two thinking
   blocks per finish step" report (`STREAMING-DEMO-ISSUES.md` item 21) turned out to be a real
   extra ReAct finish step — two genuinely different thinking blocks, not a bug.
4. **Run an adversarial refutation pass before adopting a conclusion.** Ask: what OTHER mechanism
   produces the same evidence? The costliest skip of this step in repo history: commit `3fb9ba24`
   (`revert(web): undo d186ac97 render rewrite`) adopted the mechanism "the rewrite broke the
   render" without refuting the alternative "you are looking at a stale build". The alternative
   was true. Recipe 4 exists because of this.
5. **Read the evidence with your eyes, not with a regex.** Owner-confirmed rule (2026-07-06): use
   the Read tool to actually READ log files, capture JSONL, and rendered HTML. Pattern filters
   only find errors you already predicted — "it is hard to build filtering to detect errors or
   changes when you do not know those errors or changes." Use `grep`/scripts to COUNT things you
   already understand (step 2's predicted numbers); use Read to DISCOVER what is there. If a
   capture is too large for context, spawn a subagent whose only job is to read it and summarize —
   do not substitute a keyword filter.

Recipe quick index:

| # | Recipe | Question it answers |
|---|---|---|
| 1 | Wire-capture differential | Which layer emitted / injected / dropped this byte? |
| 2 | Temporal-ordering proof | Did events appear DURING the turn, or batch-at-end? |
| 3 | Live == reload parity | Does a reloaded session render identically to the live one? |
| 4 | Stale-build discrimination | Is this regression real, or am I looking at an old build? |
| 5 | Harness-misconfig differential | Is the live gate failing because of the product or my setup? |
| 6 | Capability-truthfulness probe | Does the advertised capability flag match route reality? |
| 7 | (the method above) | Is my explanation actually proven? |
| 8 | Idea lifecycle | Should this idea be adopted, retired, or documented as expected? |

---

## Recipe 1 — Wire-capture differential

**When to use:** any "content appears twice / is missing / is garbled" report, on any surface.
Before blaming the model, the backend, or the client renderer, attribute the bytes: capture the
stream at every layer boundary and find the first layer where the content is wrong. This is also
the gate for the genericity doctrine — if the defect first appears server-side, the fix is
server-side; a client-side patch would impose one backend's quirk on every backend (see
gact-working-discipline).

**The capture points, outermost to innermost:**

| Layer | Instrument | How to enable |
|---|---|---|
| Provider → clio bridge | stream-audit rows `provider.raw_event` / `claude_code_sdk` (raw model deltas), `bridge.provider_aux` (provider thinking) | `CLIO_STREAM_AUDIT_LOG=<path>.jsonl` env var at clio launch |
| clio bridge → contract fields | stream-audit rows `bridge.contract_field` (each delta assigned to a DSPy field) | same log |
| clio → SSE wire | stream-audit rows `sse.normalized_emit`; plus the raw sse-dump | `CLIO_SSE_EVENT_LOG=<path>.jsonl` at clio launch |
| Wire → any client | raw `curl -N` capture of the SSE endpoint (below) | nothing to enable |
| Wire → TUI specifically | `run_tui_audit_session.py` artifacts: `a_clio_trace.jsonl` (backend SSE), `c_tui_received.jsonl` (what the TUI ingested), `b_tui_frames.jsonl` (what it rendered) | `python visual_loop/run_tui_audit_session.py` — NOTE: its defaults are Linux paths (`/home/jcernuda/clio-agent/...`); on this machine every path arg must be overridden |
| Wire → web specifically | `apps/web/scripts/probe-earthscope-sse.mjs` (raw SSE probe) and `audit-earthscope-sse.mjs` (normalized-event + leak-pattern audit) | `node apps/web/scripts/probe-earthscope-sse.mjs` with `CLIO_BACKEND_URL` set |

**Procedure (raw wire capture — verified on this machine 2026-07-06 against the emulator):**

```bash
# Git Bash. Build to a stable path (avoids repeated Windows firewall prompts), boot on a scratch port:
go build -o .tools/emulator-server.exe ./emulator/cmd/emulator-server
(./.tools/emulator-server.exe --port 7913 >/tmp/emu.log 2>&1 &)
sleep 2
SID=$(curl -s -X POST http://127.0.0.1:7913/v1/sessions -H 'Content-Type: application/json' \
      -d '{"workspace_id":"ws_default","title":"wire capture"}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST http://127.0.0.1:7913/v1/sessions/$SID/messages -H 'Content-Type: application/json' \
      -d '{"parts":[{"type":"text","text":"hello"}]}' > /dev/null
# Capture the raw stream (bounded):
curl -sN --max-time 6 http://127.0.0.1:7913/v1/sessions/$SID/events > /tmp/sse_capture.txt
# Count what you PREDICTED (step 2 of the method):
grep -o '^event: .*' /tmp/sse_capture.txt | sort | uniq -c | sort -rn
```

PowerShell: identical, but call `curl.exe` explicitly (bare `curl` is an alias for
`Invoke-WebRequest` in Windows PowerShell 5.1) and use `python -c` the same way. Against real
clio, substitute the backend base URL (`http://127.0.0.1:17801` for the from-source dev clio —
see gact-run-and-operate) and set the two `CLIO_*` log env vars at clio launch so the server-side
stages are captured too.

When this was run on 2026-07-06 against the emulator, one "hello" turn produced 96 events:
79 `message.part.delta`, 4 `message.part.completed`, 3 `message.part.added`, 2 `message.created`,
2 `message.completed`, 2 `cost.updated`, 1 each `tool.call.started` / `tool.call.completed` /
`session.status_changed` / `server.connected`. Then **Read the capture file itself** — the counts
confirm predictions; reading finds what you didn't predict.

**Differential step:** for the suspect content, assemble its text at each stage (for stream-audit,
concatenate `full_text` per `(agent_id, field)` — the four-quadrant procedure documented in
`.claude/skills/live-web-session.md`) and find the FIRST stage where the duplicate/corruption
appears. Everything upstream of that stage is exonerated.

**Worked example — the `●●` answer doubling** (`STREAMING-DEMO-ISSUES.md` item 8, root of the
whole dedup saga): the final answer rendered twice on the web transcript. Wire-capture
differential attributed the bytes: clio's own stream-audit showed the LLM emitted each
`next_thought` exactly once (clean, `duplicate_suppressed=false`); the second copy was injected
by clio's `tool_observer` onto `tool_call.thought`. Same text stored on BOTH a `text` part and
`tool_call.thought` → client renders both → `●●`. That attribution justified the correct split:
a server-side fix at the source (tracked as iowarp/clio-agent#736, still OPEN as of 2026-07-06)
plus a narrowly-scoped temporary client guard `dedupToolThought` in
`apps/web/src/components/transcriptDelegationModel.ts` whose code comment cites the stream-audit
evidence. Owner ruling (2026-07-06): that client dedup is temporary and its removal WILL happen
once the server emits clean parts — do not build on it, and do not add new client-side dedup
(see gact-failure-archaeology for the full saga).

**What counts as proof:** every suspect byte attributed to a named emitter at a named stage, with
predicted per-stage counts confirmed, and at least one negative confirmed (e.g. "the provider
stage shows exactly one emission"). "The client probably dedups wrong" is not proof;
"stream-audit row N shows tool_observer wrote the copy" is.

---

## Recipe 2 — Temporal-ordering proof (streamed live, not batch-at-end)

**When to use:** any claim of the form "the user could watch this happen live" — streaming
transports, thinking traces, tool lifecycle visibility, benchmark hierarchy demos. A settled
screenshot cannot prove liveness: a backend that buffers everything and bursts it 50 ms before
`message.completed` produces the identical final frame.

**Procedure:**

1. Capture a JSONL timeline of the turn (Recipe 1's capture points; for the TUI,
   `run_tui_audit_session.py`'s `c_tui_received.jsonl` records what the client actually received,
   with timestamps).
2. Run the temporal assertion (verified runnable on this machine — both `python` 3.14 and
   `python3` 3.12 are on PATH):

```bash
python visual_loop/assert_live_observability.py <capture>.jsonl \
  --mode benchmark-hierarchy \
  --report <capture>.strict.report.md
```

   `benchmark-hierarchy` mode FAILS unless the timeline proves this ordered sequence before turn
   completion: `route_or_delegate → child_expert_active → tool_started → tool_completed →
   parent_resumed`, with every matched observation preceding `message.completed` by at least
   0.25 s (`--min-live-lead-s`, default 0.25). The lead requirement exists precisely to defeat the
   posthoc-burst false pass. It also checks runtime-provenance agreement (the observed
   agents/tools/delegations match the runtime's own account). `--mode basic-tools` is the weaker
   smoke (only `tool_started`/`tool_completed`, no lead requirement).
3. **Read the report and the classified timeline** — the verdict line is the gate, the timeline
   is where you notice the things you didn't assert.

A real passing artifact is checked in at
`visual_loop/screenshots/live_observability_clio_semantic_live_events.strict.report.md`
(`verdict: PASS`, matched sequence at t=0.122s…4.132s, completion_t 4.626) — use it as the shape
reference for new reports.

**Worked example — SDK vs exec transport classification:** the claim "clio's claude_code provider
streams" was decided with per-agent delta counts, not vibes. The wire + stream-audit capture
showed, per agent, real token-by-token deltas — geospatial 26 text / 78 trace deltas, main
14 / 100, ndp 50 / 443 (`STREAMING-DEMO-ISSUES.md` item 3) — under the `sdk` transport, while the
`exec` transport delivered batch text with no thinking. Standing conclusion: use
`CLIO_CLAUDE_CODE_TRANSPORT=sdk` for streaming + thinking. Corollary doctrine from
`docs/agent-operational-memory.md`: "If a provider is reported as batch/non-streaming, verify the
real provider behavior before treating the label as truth" — classifier labels are hypotheses,
delta timelines are evidence.

**What counts as proof:** a PASS report from the temporal assertion over a capture of the real
turn (or equivalent per-delta timestamped counts), NOT a green screenshot, NOT a final transcript,
NOT the provider's self-declared classification.

---

## Recipe 3 — Live == reload parity proof

**When to use:** any transcript-rendering change, and any bug report of the form "it looked right
until I reloaded" (or the reverse). Project invariant: the same session rendered live and rendered
after reload must match — byte parity of the transcript projection is the target. Any client logic
that runs only in one of the two paths (only-when-settled, only-when-streaming) is a parity bug by
construction.

**Procedure (web):**

1. Drive a real session and capture both states with the demo driver, which snapshots each stage
   as `<NN-name>.transcript-core.html` — the transcript DOM with volatile media stripped
   (images replaced by `[image omitted]` + original src length, canvas/video/audio removed):

```bash
cd apps/web
node scripts/earthscope-render-demo.mjs   # env: CLIO_WEB_URL (default :4173), CLIO_BACKEND_URL (default :17800)
```

   Stages `01-modal` … `06-live-final`, then `07-reload` (page reloaded, same session);
   artifacts land in `screenshots/earthscope-render-demo/` under the cwd (override with
   `CLIO_EARTHSCOPE_OUT`). `record-web-demo.mjs` writes the same artifact set for scripted demos.
2. Diff the settled live capture against the reload capture:

```bash
cd screenshots/earthscope-render-demo
diff 06-live-final.transcript-core.html 07-reload.transcript-core.html   # Git Bash
```

   (PowerShell: `fc.exe` or `Compare-Object (Get-Content a) (Get-Content b)`.)
3. **Read both HTML files** (Read tool), not just the diff — a byte-identical pair can still both
   be wrong, and a noisy diff needs eyes to classify hunks.

**Procedure (TUI):** the TUI has both halves as env-gated dump tests in `tui/internal/ui`:

```bash
# Live path: replay the checked-in real wire capture through the SSE event path
cd tui
GACT_WIRE_DUMP=/tmp/live.txt go test ./internal/ui -run TestReplayEarthScopeWireRendersAgentView -count=1
# Reload path: render from a raw GET /v1/sessions/{sid}/messages payload only (no SSE ledger)
GACT_RELOAD_JSON=/tmp/messages.json GACT_RELOAD_DUMP=/tmp/reload.txt \
  go test ./internal/ui -run TestRenderReloadMessagesOnly -count=1
diff /tmp/live.txt /tmp/reload.txt
```

The wire fixture is `tui/internal/ui/testdata/earthscope-la.wire.sse` (a cleaned real capture);
`/tmp/messages.json` is a saved `GET /v1/sessions/{sid}/messages` response for the same session.

**Worked example — the dedup retirement:** `dedupeRepeatedText` ran ONLY when a turn was settled,
so a live turn showed text that vanished (or changed) on reload — live diverged from reload, and
it could drop real content because it was built on a wrong reading of dspy.extract semantics.
Retired in `e442b485` — "refactor(web): retire client-side text dedup so live == reload" — with
tests updated to assert the no-dedup contract. The TUI's version of the same class of bug:
`bc570e8e` — "fix(tui): render the canonical transcript from message.part.*, not SSE semantic
events" — the TUI rendered from an SSE-only ledger that does not exist on reload, so reloaded
sessions rendered flat while live rendered hierarchical.

**What counts as proof:** an empty diff between the settled-live and reload captures of the SAME
session, or a diff in which every hunk is individually explained and accepted (e.g. a permitted
volatile element). "They look the same" from memory is not proof. Byte parity is the standard the
parity campaign (see gact-interface-parity-campaign) is converging on — as of 2026-07-06 it is a
target, not a universally-achieved fact, so record the actual diff either way.

---

## Recipe 4 — Stale-build discrimination

**When to use:** BEFORE acting on any regression report — yours, the user's, or a screenshot's —
and especially before reverting anything. The question "is the code wrong?" has a cheaper
predecessor: "is the artifact I'm looking at built from the code I think it is?"

**Procedure:**

1. Rebuild the surface from the exact working tree:
   - web: `cd apps && pnpm --filter @clio/web build` — then restart/reload the preview.
     `vite preview` serves the `dist/` directory; a stale `dist` plus a browser cache is exactly
     the trap that fired here. Hard-reload the browser (Ctrl+Shift+R).
   - TUI/emulator: `make build` (builds `emulator/emulator-server` and `tui/gact` in their module
     dirs), or `go build ./...` from the root.
2. Prove artifact provenance, don't assume it: the TUI embeds its revision — `gact version` must
   report the current HEAD (this is exactly what `make verify-dev-install` asserts for the
   dev-install symlinks). For the web there is no version marker; the fresh-build + hard-reload
   step IS the provenance proof, so do it every time.
3. Reproduce the symptom on the proven-fresh artifact. Only a symptom that survives this step is a
   regression; capture it (screenshot / transcript-core.html) as the evidence attached to any fix
   or revert proposal.

Owner calibration (2026-07-06): fresh-build-before-revert is "kind of" a hard rule — the cost
asymmetry decides it. A rebuild costs minutes; the skipped rebuild below cost a workday and two
reverts.

**Worked example — the revert saga (2026-07-01):** a "handoff box / no dots" report came in
against the previous night's render work (`d186ac97`). Commit `3fb9ba24` ("revert(web): undo
d186ac97 render rewrite — restore canonical presentation") wholesale-reverted it within hours,
citing a list of visible regressions. ~80 minutes later, `ad8a9e79` ("revert: restore d186ac97
presentation work (undo mistaken 3fb9ba24)") reversed the revert: the report "was almost certainly
a stale-build cache artifact (same as the search-render cache issue)" — the second such incident.
The revert had itself regressed the single 14.5 px font, the dot semantics, the provider-thinking
display, and the inline plot. Full story in gact-failure-archaeology.

**What counts as proof:** the symptom reproduced on an artifact whose provenance is demonstrated
(revision string matches HEAD, or fresh build + hard reload performed in the same session), with
the reproduction captured. A regression report without this is an unverified claim — triage it,
don't act on it.

---

## Recipe 5 — Harness-misconfig differential for live gates

**When to use:** a live-backend gate (EarthScope/NDP benchmark, blueprint demo, marketplace
validation) fails — especially with `_UnsupportedSessionAgent`. The prior here is inverted from
normal debugging: on this machine, EarthScope/NDP works, so **first assume the gact-tui harness is
misconfigured**, not the product. (Doctrine source: `docs/agent-operational-memory.md`, written
because these points "have been rediscovered too many times".)

**What the symptom means:** `_UnsupportedSessionAgent` means a child expert requested tools that
were not present in the session's composed tool set. Quoting the doctrine doc: "It is not proof
that NDP, EarthScope, or the model is broken."

**Decision tree — check in this order, stop at the first hit:**

| # | Check | How |
|---|---|---|
| 1 | Wrong workspace binding | Is the session in the intended workspace (live EarthScope work uses `ws_ndp_demo`)? `GET /v1/sessions/{sid}` and compare `workspace_id`. |
| 2 | Wrong blueprint install scope / missing marketplace install | Is the real marketplace blueprint installed and bound into the OWNED backend's active config/discovery scope (not the shared one)? |
| 3 | Wrong cwd | Did the backend start from a directory that changes discovery? |
| 4 | Missing MCP tool composition | Did the active blueprint's declared MCP servers actually start in this session? |
| 5 | Repo-local `.clio` override | A `.clio/` directory with relative-path MCP entries silently overrides discovery — "a repo-local `.clio` relative-path override is a test harness smell". The shipped blueprint should use cwd-independent `uvx clio-kit@...` entries. Note the gact-tui repo root currently has an untracked `.clio/` from past probes. |
| 6 | MCP process itself broken | "Connection closed" / "Cannot find home" from a blueprint MCP server → stale uvx cache; refresh with `uvx --refresh clio-kit@<version> mcp-server <name>` (this-machine fact). |

**The proof standard (quote, `docs/agent-operational-memory.md`):** "Do not use `/v1/tools` or
`/v1/mcp/handshake` as proof that child-expert tools are composed. Useful proof is a real
workspace-bound session with the active blueprint starting the declared MCP servers and child
experts calling the expected prefixed tools." Those two endpoints answer a different, weaker
question than "is this session's tool set composed".

**Wrong-blame guardrails** (each one has burned time here): never blame the ALCF token — a keeper
process maintains it on this machine, so "re-auth" is not a fix; never touch the shared dev clio
runtime on `127.0.0.1:17960` — run your own clio on an owned port with isolated state (see
gact-run-and-operate); and before filing a clio-agent issue from a live-gate failure, this recipe
must have run to completion with every row checked.

**What counts as proof (of "the harness is fine, the product is broken"):** a session that passes
rows 1–6 above, evidenced by the session's own event stream showing the blueprint's MCP servers
starting and a child expert successfully calling at least one prefixed tool — and the failure
still reproducing. Only then does the blame cross the wire.

---

## Recipe 6 — Capability-truthfulness probe

**When to use:** deciding whether a backend really supports a feature; reviewing adapter or
emulator capability maps; investigating "the client shows a button that 404s" or "the client hides
a feature the backend has". The contract rule (SPEC §3.3) is bidirectional: a capability flag
advertised `true` must have a working route behind it, and `false` must mean the route returns
404/501.

**Procedure (automated):** the conformance suite's `Drift_CapabilityTruth` check
(`contract/conformance/drift_checks.go`, `checkCapabilityTruth`) probes each advertised
single-route flag in `capRouteProbes` (session_summary, attachments_upload, session_export,
search_messages, scheduled_sessions, session_tasks, hooks, metrics, memory) and fails if a
flag advertised `true` gets 404/501 from its route. A 4xx/5xx OTHER than 404/501 from a registered
route still passes — validation errors prove the route exists. The `false ⇒ 404/501` direction is
the suite-wide gating convention. Caution: the drift checks include session-MUTATING checks
(rollback, compact); `Run()` only executes those when the suite created its own session
(`opts.SessionID == ""`) — never pin a real session you care about into `Options.SessionID`.

**Procedure (manual curl probes — verified on this machine 2026-07-06 against the emulator):**

```bash
# Git Bash (PowerShell: use curl.exe). Emulator booted on :7913 as in Recipe 1.
curl -s http://127.0.0.1:7913/v1/capabilities | python -m json.tool   # READ the flag map
# Flag advertised true (metrics) — must NOT be 404/501:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7913/v1/metrics                     # → 200
# Flag advertised false (scheduled_sessions) — MUST be 404/501:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7913/v1/sessions/$SID/schedules    # → 404
```

Both directions returned exactly those codes when run for this skill. Against clio, same probes
on the clio base URL.

**Worked example:** this check exists because the flags actually lied once — clio advertised
`session_summary` and `attachments_upload` with no routes behind them (iowarp/clio-agent#760,
"P0: /v1/capabilities lies", now CLOSED); the drift check's own comment says it "would have caught
the session_summary / attachments_upload over-claim". The drift-check family landed in this repo
via `59d136d2` ("docs(contract): reconcile SPEC.md to clio reality; conformance asserts the drift
classes", PR iowarp/gact-tui#247, part of epic iowarp/gact-tui#232).

**What counts as proof:** per-flag status codes recorded in both directions (true⇒non-404/501,
false⇒404/501), or a passing `Drift_CapabilityTruth` run. The flag map alone proves nothing —
that is the entire point. Capability honesty is the foundation of the cross-surface parity
campaign (gact-interface-parity-campaign): a client can only be capability-honest if the flags
themselves are.

---

## Recipe 8 — Idea lifecycle (hunch → evidence → adoption or documented retirement)

**When to use:** you have a fix/architecture idea. This recipe is how ideas earn their way into
`develop` — or earn a documented grave that prevents resurrection.

**The lifecycle:**

1. **Hunch** — state the mechanism it addresses (method step 1).
2. **Experiment on owned infrastructure** — an owned clio backend on an owned port and/or a
   branch. Never experiment on the shared runtime or a session you don't own (Recipe 5
   guardrails; conformance mutating-check caution in Recipe 6).
3. **Predicted-numbers evidence** — run the relevant recipe (1–6) with predictions written first.
4. **Adversarial refutation** — method step 4; actively try to break your own conclusion
   (stale build? harness misconfig? does it hold on reload? on the other surfaces?).
5. **Adopt via change control** (see gact-change-control: spec-first for wire-visible changes,
   screenshot for UI, server-first for clio-coupled semantics) — **or retire it in writing**:
   the retirement commit/doc must state the wrong assumption so the idea cannot quietly return.
   "Explained, not a bug" (document + close) is also a valid terminal state.

**Worked retirement — `dedupeRepeatedText`:** born from treating the dspy.extract answer as a
duplicate of the finish `next_thought`. It was wrong semantics (the extract IS the return
synthesis), could drop real content, and broke live==reload (Recipe 3). Retired in `e442b485`
with the reasoning written into the commit body, tests flipped to assert the no-dedup contract,
and a memory note that explicitly prevents re-adding it. That is what a complete retirement looks
like: code deleted, contract asserted, rationale recorded where the next person will trip over it.

**Worked adoption-with-expiry — `dedupToolThought`:** adopted only after Recipe 1 attributed the
duplicate to a server-side injector, scoped to exactly that mechanism, with the evidence quoted in
the code comment — and paired with the server-side issue (iowarp/clio-agent#736) whose fix
obsoletes it. Status as of 2026-07-06: #736 is OPEN, the guard is still in
`apps/web/src/components/transcriptDelegationModel.ts`, and the owner has ruled its removal WILL
happen. An adopted client workaround without a linked server issue and an expiry condition is a
lifecycle violation.

**Worked "explained, not a bug"** — the double thinking block (`STREAMING-DEMO-ISSUES.md`
item 21): investigation showed two genuinely different SDK thinking blocks from an extra ReAct
finish step. Terminal state: documented in the ledger, no code change.

---

## When NOT to use this skill

- **You need to find what's broken, not prove a claim** — start with gact-debugging-playbook
  (symptom→triage). It will route you back here when a claim needs proving.
- **You want the history of a past investigation/revert/dead end** — gact-failure-archaeology is
  the chronicle; this skill only carries the excerpts that anchor each recipe.
- **You need to run the pieces** (boot clio/emulator/web, ports, env, teardown) —
  gact-run-and-operate.
- **You need the wire contract itself** (endpoints, envelope, event shapes, dialects) —
  gact-wire-protocol-reference; architecture rationale and invariants —
  gact-architecture-contract.
- **You want the standing measurement scripts with interpretation guides** (latency, readiness
  checkers, corpus gates) — gact-diagnostics-and-tooling. This skill is about one-off proofs;
  that one is about instruments you re-run.
- **You're deciding what evidence a task needs before merge** (evidence-bar hierarchy, what green
  doesn't mean, golden inventory) — gact-validation-and-qa.
- **You're executing the cross-surface parity campaign** — gact-interface-parity-campaign uses
  Recipes 3 and 6 as its gates; the campaign plan lives there.
- **Session conduct rules** (autonomy, read-the-evidence as a working habit, protected
  resources) — gact-working-discipline.

## Provenance and maintenance

All facts verified against the repo on 2026-07-06 (branch `develop`). Machine-specific facts
(ports 17801/17960, `D:\...\clio-agent` path, uvx cache fix, ALCF token keeper, Python versions)
are labeled "this machine" and hold only on Alice's Windows box. Re-verify volatile items with:

```bash
# Cited commits still exist / say what this skill claims:
git log --format='%h %s' -1 e442b485; git log --format='%h %s' -1 3fb9ba24
git log --format='%h %s' -1 ad8a9e79; git log --format='%h %s' -1 d186ac97
git log --format='%h %s' -1 bc570e8e; git log --format='%h %s' -1 59d136d2
# dedupToolThought still present (removal expected once clio-agent#736 lands):
grep -n "dedupToolThought" apps/web/src/components/transcriptDelegationModel.ts
gh issue view 736 --repo iowarp/clio-agent --json state -q .state
# Temporal-assertion flags unchanged:
python visual_loop/assert_live_observability.py --help
# Capability probe list unchanged:
grep -n "capRouteProbes" -A 12 contract/conformance/drift_checks.go
# Dump-test names / env gates unchanged:
grep -rn "GACT_WIRE_DUMP\|GACT_RELOAD_JSON" tui/internal/ui/*_test.go
# Demo-driver stages (06-live-final / 07-reload) unchanged:
grep -n "dumpPage(" apps/web/scripts/earthscope-render-demo.mjs
# Source docs for Recipes 1/2/5 still in place:
git ls-files STREAMING-DEMO-ISSUES.md docs/agent-operational-memory.md .claude/skills/live-web-session.md
```

If any of these drift, fix the skill in the same change — a wrong proof recipe is worse than none.
