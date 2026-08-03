---
name: gact-failure-archaeology
description: The chronicle of every major gact-tui investigation, dead end, rejected fix, and revert — symptom, root cause, evidence, status, and the standing rule each one produced. Load this BEFORE proposing a fix that touches rendering, dedup/filtering, markdown, the execution ledger, releases, reverts, or version strings; before reverting anything; before opening a backend (clio-agent) issue; or whenever a "fix" idea feels obvious — several obvious fixes here were already tried and rejected. Keywords: revert, regression, duplicate text, dedup, markdown renderer, stale build, live vs reload, ledger, prune, release failure, wrong blame, bit-rot, version marker.
---

# gact-failure-archaeology — what already went wrong, and why

This is the project's institutional memory of failure. Each entry records a real
incident: **Symptom → Root cause → Evidence → Status → Standing rule**. The rules at
the bottom of each entry are not suggestions — they exist because someone (usually an
AI agent) already burned hours or days learning them.

**How to use this skill:** before implementing a fix, scan the index table below. If
your planned change resembles a rejected fix (client-side dedup, a second markdown
renderer, routing live rendering through the persisted path, pruning on list refresh,
a wholesale revert of UI work), STOP and read the matching entry in full. Verify any
volatile claim with the commands in "Provenance and maintenance".

All commit hashes below were verified with `git show -s <hash>` on 2026-07-06.
Cross-repo facts (clio-agent side) are labeled as such. Issue references
`iowarp/gact-tui#NNN` are this repo; `iowarp/clio-agent#NNN` is the backend repo.

## Index: does your situation match a past failure?

| You are about to... | Read entry |
|---|---|
| Revert a change because a regression was reported | 1 |
| Dedup / filter / fold "duplicate" text on a client (web, TUI, desktop) | 2 (and 1) |
| Touch markdown rendering, add a renderer, restore code highlighting | 3 |
| Change how the live transcript is built vs the reloaded transcript | 4 |
| Infer session deletion from a session list; prune caches on refresh | 5 |
| Assess whether the audit P0 bugs are fixed | 6 |
| Commit binaries/media; rebase or rely on long-lived clones | 7 |
| Modify `.github/workflows/apps.yml` or cut a desktop release | 8 |
| Blame the backend for a live-gate failure (`_UnsupportedSessionAgent` etc.) | 9 |
| Follow a script/file referenced in an older skill or doc | 10 |
| Debug a hanging `shell_bash` tool on Windows | 11 |
| Trust a version string on the wire or in a package doc | 12 |
| "Rescue" an unmerged branch, or judge branches by ancestry alone | 13 |
| Run a long autonomous task; grep logs for errors | 14 |

---

## Entry 1 — The render-rewrite revert saga (the stale-build ghost)

**Symptom.** 2026-06-30/07-01, apps/web. A report of "handoff box / no dots" — the
assistant-turn presentation appeared to have regressed after a render rewrite.

**What happened, in commit order (all same ~34 hours):**

(Jargon: **dspy.extract** is the clio backend's answer-synthesis step — its output
IS the substance of the turn's return. **SSE** = Server-Sent Events, the protocol's
one-way event stream.)

| Commit | When | What |
|---|---|---|
| `85e07a6c` "fix(web): fold dspy.extract into the return; reload permission + autoscroll fixes" | 06-30 21:47 | Folded the dspy.extract output onto the return block |
| `d186ac97` "fix(web): extract renders in the flow (streaming), not folded onto the return" | 06-30 23:06 | Undid the fold same night: the return only exists at turn END, so folding extract onto it meant thinking could not stream. Also carried presentation work: single 14.5px font, grey/orange dot semantics, cleaned provider-thinking display, inline plot image |
| `3fb9ba24` "revert(web): undo d186ac97 render rewrite — restore canonical presentation" | 07-01 05:53 | **Wholesale revert** chasing the "handoff box / no dots" report |
| `ad8a9e79` "revert: restore d186ac97 presentation work (undo mistaken 3fb9ba24)" | 07-01 07:12 | Revert of the revert, ~80 minutes later |

**Root cause.** Two distinct failures. (a) The regression report driving `3fb9ba24`
was — per the `ad8a9e79` commit body — "almost certainly a stale-build cache artifact
(same as the search-render cache issue)": the reporter was looking at an old build,
not at `d186ac97`'s output. The wholesale revert destroyed a night of real
presentation work to fix a ghost. (b) Underneath it, dspy.extract semantics were
misread twice in one day (fold → unfold): the extract output *looks like* a duplicate
of the loop's final thought, tempting agents to fold or dedup it.

**Evidence.** Commit bodies of the four hashes above (`git show -s --format=%B <hash>`).
`d186ac97`'s work is current on develop and origin/main (via PR merge
iowarp/gact-tui#223).

**Status.** Settled. `d186ac97` presentation stands.

**Standing rules.**
- **Fresh-build-before-revert.** Before reverting anything on the strength of a UI
  regression report, rebuild from the exact current source and reproduce the
  regression on that fresh build. Two incidents (this one and the search-render cache
  issue named in `ad8a9e79`) were stale-build ghosts. Owner confirmation 2026-07-06:
  verify regression reports against a fresh build before reverting.
- **dspy.extract IS the return synthesis.** It renders in-flow, streaming. Do not fold
  it onto the return; do not dedup it against the final loop thought
  (extract ≈ last-loop is *expected*). It is hidden behind the return's
  "show details" affordance, not deleted.
- If a genuine residual regression exists, fix it **surgically** — never wholesale-revert
  a commit that carries unrelated good work.

---

## Entry 2 — dedupeRepeatedText retirement (client-side dedup is architecturally wrong)

**Symptom.** apps/web showed doubled answer text (`●●` doubling); a client-side
`dedupeRepeatedText` helper (plus near-duplicate helpers) was added to suppress it.
Later: reloaded transcripts diverged from live ones, and real content was sometimes
dropped.

**Root cause.** The dedup was born from the same wrong reading of dspy.extract as
Entry 1 — treating the extract answer as a duplicate of the finish `next_thought`.
Per the `e442b485` commit body: "the dedup was not just unnecessary but wrong: it
could drop real content, and it ran ONLY when settled — making a reloaded turn diverge
from the live one."

**Evidence.** `e442b485` (2026-07-01) "refactor(web): retire client-side text dedup so
live == reload" — deleted the helpers and added tests asserting the no-dedup contract.
Genuine backend double-emits were pushed to the source: iowarp/clio-agent#736
(cross-repo; the commit body writes bare "#736").

**Status.** dedupeRepeatedText is gone (settled). BUT other prose filters still exist
client-side (`dedupToolThought`, `clioScaffolding`, the TUI
`live_message_normalization.go` pipeline) — their deletion is **open**, explicitly
gated server-first on iowarp/clio-agent#767 (single-writer TurnTranscript). See
`docs/system-cleanup-2026-07.md`. Owner confirmation 2026-07-06: the dedup removal
WILL happen; do not start it client-first.

**Standing rules.**
- **No client-side dedup or semantic filtering — ever.** This is not just a
  sequencing rule; it is architectural: GACT is a *generic* interface to many agent
  backends. Injecting one agent's semantics (clio's dspy quirks) into a client breaks
  every other backend. Semantics belong on the server.
- **Server-first sequencing.** Duplicate-content bugs are fixed at the emitting
  backend; the client renders the wire faithfully. Deleting the remaining client
  filters before iowarp/clio-agent#767 lands would recreate the live ≠ reload
  divergence.
- Live render and reload render must be built by the same logic (`live == reload`).

---

## Entry 3 — Markdown unification: three renderers → one incremental smd renderer

**Symptom.** apps/web had THREE markdown renderers coexisting: a hand-grown 7-file
`InlineMarkdown` cluster (built feature-by-feature in a single day, 2026-05-28 — an
O(n²) full-reparse-per-token streamer), a finalize-only `MemoMarkdown`, and a
plain-text-while-streaming `StreamingMarkdown` (plain→formatted flip on finalize).

**Root cause.** Accretion: each renderer was the locally-easy answer to one streaming
problem, and nobody deleted the previous one.

**Evidence.** `8e3e925b` (2026-07-01) "refactor(web): unify markdown on one
incremental smd renderer + strip leaked markers" — replaced all three with ONE
incremental renderer (`apps/web/src/components/Markdown.tsx`, `streaming-markdown`/smd)
that appends DOM nodes as tokens arrive: no reparse, no flip. Follow-up fixes same
day: `8df44812` (intraword underscore emphasis), `a9abaf32` (font pin), `a07807da`
(surface the streaming tail live).

**Status.** Settled.

**Standing rules.**
- **Exactly one markdown renderer, append-only.** Never reintroduce a second renderer
  or any O(n²) reparse-per-token streamer, whatever streaming problem you are solving.
- **The accepted cost is recorded and intentional:** fenced code lost hljs
  (highlight.js) syntax highlighting and the copy button (`8e3e925b` body calls it "a tradeoff of the single
  lib"). Restoring them by bolting on another renderer recreates the deleted
  architecture. If they ever come back, it must be *inside* the single smd path.

---

## Entry 4 — Live view routed through the persisted path ("done WRONG")

**Symptom.** Web live vs reload duplication ("running-reload dedup"). The attempted
fix routed the LIVE view through the persisted/settled rendering path.

**Root cause.** Wrong trade: the persisted path only knows settled blocks, so the
"fix" **killed live streaming**. `STREAMING-DEMO-ISSUES.md` records it under the
"⚠️ Done WRONG — needs rework" heading (item numbered 10, "D — running-reload dedup,
'persisted-authoritative'"): "I routed the LIVE view through the persisted path to
stop the dup → it killed live streaming (persisted = settled blocks). Wrong trade."

**Correct architecture (as written in that ledger and still the target):**
**live = normalized path** (streams deltas), **persisted = reload only**, and the
normalized view is **seeded from `/messages` on join** — complete + no dup + streams.
This one rework subsumes thinking-does-not-stream (A1), completion-aware filtering
(A2-live), live markdown, and the live == reload byte-parity requirement.

**Evidence.** `STREAMING-DEMO-ISSUES.md` (root, last committed in `45df9dc1`,
2026-07-01). Web-side progress: `09240c4c` / `e97b1cc2` (2026-07-01) unified all web
transcript rendering through one path. TUI-side: parity phase 1 landed as `c1e96579`
(PR iowarp/gact-tui#249, merged 2026-07-02, on origin/develop) — one transcript
projection, synced semantic allow-list.

**Status as of 2026-07-06.** Partially done, **open**. Epic iowarp/gact-tui#233 is
still open; phase 2 is gated on the iowarp/gact-tui#232 authoritative-streaming-channel decision and
on iowarp/clio-agent#767. Note `STREAMING-DEMO-ISSUES.md` itself is a 2026-07-01
snapshot — trust the issues for current state, the ledger for the failure story.

**Standing rule.** Never route the live view through the persisted/settled path to
solve a duplication or parity problem. Live streams the normalized channel and seeds
from `/messages` on join; parity is achieved by making both sides build from the same
normalized truth, not by degrading live to settled.

---

## Entry 5 — Execution-ledger prune bug: "absent from list ≠ deleted"

**Symptom.** (a) The TUI's per-session execution event ledger grew without bound and
survived `/clear` (iowarp/gact-tui#231). (b) The FIRST fix attempt introduced a worse
bug: it pruned ledgers for any session absent from a refreshed session list.

**Root cause of the bad first fix.** Session lists are **filtered views** — every
list fetch is workspace-scoped and archive-filtered. Toggling the archived sidebar
view (or any workspace-scoped refresh) made live sessions "absent", pruning their
ledgers **irreversibly in-process** (per-session high-water marks suppress SSE replay
on revisit). The PR #244 adversarial review caught this before it shipped.

**Evidence.** `57496b29` (2026-07-02) "fix(tui): bound the execution event ledger;
prune only on explicit deletion (#244)". The squashed body contains both halves: the
bound (cap 2000 events, amortized trim to 1500, structured
`execution.ledger.trimmed` audit event) and the repair (prune ONLY on a confirmed
`sessionDeletedMsg` from `deleteSessionCmd`, with a structured
`execution.ledger.pruned` audit event, reason `session_deleted`; regression tests
assert filtered/empty refreshes leave live ledgers intact).

**Status.** Settled on develop. The generalization is recorded on
iowarp/gact-tui#232 (2026-07-02 comment): the protocol has **no `session.deleted`
SSE event**, so out-of-band deletions are currently unobservable — a spec gap, open.

**Standing rules.**
- **Any "not in the latest list ⇒ deleted" inference over sessions is unsound.** Act
  on explicit deletion signals only.
- Cache eviction that cannot be undone in-process (replay-suppressed state) needs a
  confirmed trigger, never a heuristic one.
- Trims/prunes emit structured audit events — silent eviction violates the
  no-silent-fallback ground rule.

---

## Entry 6 — The eight audit P0s (2026-07 nine-reviewer audit)

One line each. All fixes merged to **develop** on 2026-07-02; as of 2026-07-06 they
are **NOT on main** (origin/main is still the PR #223 merge, `3c904685`; develop is
12 commits ahead). The issues themselves were bulk-closed 2026-07-07T02:01Z (UTC).
A hotfix cut from main today would resurrect every one of these bugs.

| Issue | Symptom (verified title) | Fix commit (develop) |
|---|---|---|
| iowarp/gact-tui#224 | compact/summarize always fails against clio — TUI calls `/summarize`, which does not exist | `a42a19ee` (PR #238): POST `/compact` with `focus` key; 404-degrade carries structured reason |
| iowarp/gact-tui#225 | web ignores every clio `session.updated` — sidebar/rename/mode changes never live-update | `dc3d90ca` (PR #239) |
| iowarp/gact-tui#226 | stale session-snapshot race — switching sessions can render the previous session's transcript (and its pending permission) | `95df2025` (PR #240) |
| iowarp/gact-tui#227 | TUI SSE read-error is a dead end — no reconnect, full-screen error (clean EOF reconnects fine) | `b4eb1e37` (PR #241): jittered-backoff reconnect |
| iowarp/gact-tui#228 | desktop supervisor leaks the old clio process tree on restart/update (doc claims it reaps) | `b2f93704` (PR #242) |
| iowarp/gact-tui#229 | `message.created` payload nesting fork — flat vs nested across spec/server/adapters/clients | `59d136d2` (PR #247, spec codifies flat) + `c66b885f` (PR #248, crush adapter + TS synced) |
| iowarp/gact-tui#230 | gact CLI subcommands ignore config.json `backend_url` (only the interactive TUI honors it) | `5be7b74a` (PR #243) |
| iowarp/gact-tui#231 | TUI execution event ledger grows without bound and survives `/clear` | `57496b29` (PR #244) — see Entry 5 |

**Standing rule.** "Issue closed" and "fix released" are independent facts here:
fixes live on develop; main lags until the next develop→main promotion PR. Check
`git branch --contains <fix-hash>` before assuming a binary or branch has the fix.

---

## Entry 7 — The 669MB pack and the pending history rewrite

**Symptom.** The git pack is enormous — iowarp/gact-tui#235 (open epic) titled
"Repo hygiene & media policy: 669MB pack -> <100MB". Measured on this machine
2026-07-06: `git count-objects -vH` → **size-pack: 687.43 MiB**. Historical blobs:
visual_loop run artifacts (~417MB), apps (~247MB), screenshots (~80MB), a 10MB
emulator-server binary (figures from the issue body — unverified independently).

**Root cause.** Run artifacts, media, and binaries were committed over months
(the April–May autonomous-loop era especially).

**Evidence.** iowarp/gact-tui#235; the "stop the bleeding" slice landed as
`af0e1710` (2026-07-02, PR #246): untracked 301 visual_loop run-artifact files,
archived root work-logs, truthful CLAUDE.md, CI gap fixes.

**Status as of 2026-07-06.** Open. The remaining plan is a **git filter-repo history
rewrite with a coordinated force-push** — announced in the epic, **unscheduled**.
When it lands, every clone and long-lived local branch is invalidated.

**Standing rules.**
- Never commit run outputs (`visual_loop/tui_audit_*/`, logs, session dumps), media
  regenerables, or binaries. They are the reason a history rewrite is needed at all.
- Do not build anything that depends on gact-tui commit hashes being stable
  (pins, submodule refs, hash-keyed caches) until the rewrite has happened.
- Warning specific to this machine: `tui/.go-cache/` (untracked, NOT gitignored,
  origin unknown, present as of 2026-07-06) — a careless `git add .` commits a build
  cache. Add paths explicitly.

---

## Entry 8 — The 0.7.0 desktop release failures (now encoded as workflow comments)

**Symptom.** The clio-desktop 0.7.0 release (June 2026) failed three separate ways.
Each failure is now a load-bearing comment in `.github/workflows/apps.yml`
(all three verified present 2026-07-06):

| Failure | Root cause | Where encoded |
|---|---|---|
| Release notes duplicated **7×** ("What's Changed" stacked) | Every matrix job (8 desktop + 1 web) generated notes | apps.yml ~lines 429–432 and 496–499: `generate_release_notes: false` per job; the `finalize-notes` job generates notes exactly ONCE after all assets attach |
| All 4 bundled jobs failed: `tauri.bundled.conf.json` "does not exist" | The tauri CLI resolves `--config` relative to its CWD, which `pnpm --filter` sets to `apps/desktop` — NOT to `src-tauri/` | apps.yml ~lines 361–365: `--config src-tauri/tauri.bundled.conf.json` (path prefix mandatory) |
| Bundled AppImage build failed (`build_appimage.sh`) | A half-gigabyte embedded Python runtime inside AppImage's compressed read-only squashfs is the wrong vehicle | apps.yml ~lines 276–279: AppImage is **lite-only** on Linux; bundled overrides to `deb,rpm` |

**Status.** Settled — but only as long as the comments and their guarded lines
survive edits.

**Standing rules.**
- Treat those apps.yml comments as tested code. Do not "clean them up" or simplify
  the matrix includes they guard.
- Release notes are generated exactly once (`finalize-notes`); never re-enable
  per-job note generation.
- Any `--config` passed through `pnpm --filter @clio/desktop` resolves from
  `apps/desktop/` — always write the `src-tauri/` prefix.
- Also relevant: BOTH `apps.yml` (release + release-web + finalize-notes) and
  `desktop-release.yml` (signed updater draft) fire on the same `clio-desktop-v*`
  tag — the final release page is the composite. Test release changes on a
  throwaway tag mentally before assuming single-workflow behavior.

---

## Entry 9 — The clio#689 wrong-blame retraction (`_UnsupportedSessionAgent`)

**Symptom.** A live EarthScope gate on 2026-06-17 saw `main -> geospatial` fail
immediately with `_UnsupportedSessionAgent`, even though the marketplace blueprint
was installed and `/v1/mcp/handshake` looked ready. A backend bug was filed:
iowarp/clio-agent#689.

**Root cause.** The gact-tui test harness had not reproduced the known-good
deployment (branch, environment, workspace source, registry/source install path,
session blueprint binding). The issue was **closed/retracted as a gact-tui
harness/configuration mistake**. Key correction from the clio team:
`/v1/mcp/handshake` is only a **readiness probe** — it does not wire tools into the
per-session expert executor; the working proof must create/bind the session against
the workspace and active blueprint.

**Evidence.** `docs/handoff-2026-06-17-web-desktop-polish.md`, sections
"Correction: EarthScope Live Harness Misconfiguration" and "Latest Continuation:
EarthScope Harness Recovery Notes"; hard rules restated in
`docs/agent-operational-memory.md`.

**Status.** Settled, with a written prohibition: "Do not open another backend issue
for this symptom unless the same exact known-good command line fails outside the UI."

**Standing rules.**
- `_UnsupportedSessionAgent` means **harness misconfiguration until proven
  otherwise**. Same family: do not blame the ALCF token for auth-ish failures —
  a keeper process maintains it.
- Before filing ANY backend issue from a live-gate failure: reproduce the failure
  with the known-good command line **outside the UI**. If it works outside the UI,
  the bug is yours.
- Wrong-blame issues are expensive twice: the wasted backend-team round-trip, and
  the real bug staying unfixed. This class of "wrong-blame live gates" is one of the
  two costliest failure modes in project history (owner statement, 2026-07-06).

---

## Entry 10 — The capture-earthscope.mjs ghost (skills citing never-committed files)

**Symptom.** `.claude/skills/live-web-session.md` (line 84) instructs the reader to
use a "capture-earthscope.mjs" driver script. The file does not exist anywhere in
the repo, and `git log --all -- '*capture-earthscope*'` returns nothing — it was
**never committed**. An agent following the skill verbatim hunts for a phantom.

**Root cause.** The skill was written against a scratch working tree; the scratch
script was never committed, and the skill was never re-verified against the repo.

**Evidence.** Grep for `capture-earthscope` hits only the skill file itself
(verified 2026-07-06). The committed equivalents live in `apps/web/scripts/`:
`audit-earthscope-sse.mjs`, `probe-earthscope-sse.mjs`, `earthscope-render-demo.mjs`,
`record-web-demo.mjs`, `watch-session.mjs`, `verify-transcript-render.mjs`
(`watch-session.mjs` matches the skill's conventions: backend `127.0.0.1:17801`,
workspace `ws_ndp_demo`).

**Status.** Open (the stale reference is still in that flat skill file as of
2026-07-06; the flat pre-existing skills are not to be edited by skill-library work).

**Standing rules.**
- Documentation/skills may only cite files that are **committed** — verify with
  `git ls-files <path>` before writing or following a reference.
- When a runbook names a missing file, look for the committed successor before
  recreating anything (here: `apps/web/scripts/`).

---

## Entry 11 — shell_bash Windows hang: stdin=DEVNULL (cross-repo fact)

**Symptom.** On Windows, clio's `shell_bash` tool executions hung until timeout.

**Root cause (clio-agent side — labeled cross-repo; not verifiable from this repo).**
clio-agent's `shell_server.py` spawned shells that inherited the sidecar's stdin;
the inherited stdin hung PowerShell children until the turn timed out. Fix:
spawn with `stdin=DEVNULL`.

**Evidence.** This repo's `STREAMING-DEMO-ISSUES.md` item 1 records it as the
original blocker, fixed and verified (`timed_out:false`). The fix itself lives in
iowarp/clio-agent.

**Status.** Settled (in clio-agent).

**Standing rules.**
- A hanging tool execution on Windows is a **process-inheritance** suspect (stdin,
  console handles) before it is a backend-logic suspect.
- Related validated setting from the same demo push: on Windows use
  `windows_backend: powershell` (WSL-bash corrupted paths), and the claude_code
  `sdk` transport (the `exec` transport batches — no streaming/thinking).

---

## Entry 12 — Stale "0.1" version markers: wire version strings cannot be trusted

**Symptom.** The contract moved to v0.2 long ago (SPEC.md is v0.2; the emulator's
`ContractVersion` const is `"0.2"` in `emulator/internal/server/handlers.go:15`),
yet "0.1" markers persist all over (all verified 2026-07-06):

| Location | Stale marker |
|---|---|
| `tui/internal/client/client.go:1,21` | package doc: "client for a GACT v0.1 backend" |
| `emulator/cmd/emulator-server/main.go:1` | "runs the GACT v0.1 emulator HTTP server" |
| `adapters/crush/server.go:105` | `ContractVersion: "0.1"` **on the wire** |
| `adapters/opencode/server.go:93` | `ContractVersion: "0.1"` **on the wire** |
| `adapters/claude-agent-sdk-server/.../server.py:40` | `CONTRACT_VERSION = "0.1"` **on the wire** |

**Root cause.** Version strings are hand-copied prose with no test tying them to
behavior, so they fossilize. The adapters genuinely implement a v0.1-era subset,
but nothing distinguishes "deliberately v0.1-scoped" from "forgot to bump".

**Status.** Open (whether adapters get bumped to 0.2 and wired to run conformance
is an undecided question under iowarp/gact-tui#232's convergence work).

**Standing rules.**
- **Never gate a feature on `contract_version`** (or a package-doc version). The
  only reliable feature signal is the capability flag map from
  `GET /v1/capabilities` — which is truthful in both directions per spec and
  conformance (flag true ⇒ route registered; false ⇒ 404/501).
- When reading code comments that state a version, treat them as
  possibly-fossilized; verify against `contract/SPEC.md` and the conformance suite.

---

## Entry 13 — The ACP adapter branch: complete, never merged, bit-rotting

**Symptom.** `origin/feat/acp-adapter` holds a single commit `b677dde1` (2026-06-24)
"feat(adapters): add generic ACP→GACT v0.2 bridge adapter" — a **complete** 1,442-line
backend-agnostic bridge fronting any ACP-v1 agent (ACP = Agent Client Protocol,
agent-over-stdio) with the GACT REST+SSE wire: `adapters/acp/{server,http,translate,
transport,ids}.go` + `cmd/gact-acp-adapter` + a go.work entry. It was never merged:
`git cherry develop origin/feat/acp-adapter` shows `+ b677dde1`, and `adapters/` on
develop has no `acp/` directory (both verified 2026-07-06).

**Root cause of the rot risk.** The wire shapes it translates have already changed
under it — `c66b885f` (PR #248) altered message.created/TS payload shapes on develop.
Every further protocol-convergence commit widens the gap.

**Status.** **Open decision** — merge (after rebasing onto post-#248 shapes), or
delete. No linked issue exists. Do not silently adopt code from the branch into new
work without resolving the decision through change control (see gact-change-control).

**Standing rules.**
- Judge branch liveness with `git cherry` / tree-diff, **not** ancestry: several
  gact-tui branches look unmerged but are content-merged via squashes
  (e.g. `feat/233-parity-projection` ≡ `c1e96579`). Do not "rescue" those.
  Conversely `feat/acp-adapter` and `feature/language-extension` (Greek TUI locale)
  are truly unmerged.
- Complete-but-unmerged work decays against a moving wire contract; escalate the
  merge-or-delete decision rather than letting it rot further.

---

## Entry 14 — Meta-failures: the agent's own process (owner-reported)

These are process failures of AI sessions on this project, reported directly by the
owner on 2026-07-06. There is no single repo artifact to cite; they are labeled
owner-reported and are treated as doctrine (full treatment in
gact-working-discipline).

**14a. Stopping mid-task to ask an unnecessary question.** During overnight /
meeting-day autonomous work, an agent stopped to ask a trivial clarifying question
and idled — **4 hours lost**. Owner: this was the single biggest time sink in the
project, bigger than any code bug.
**Standing rule:** in an autonomous run, work to completion; stop only on a real
blocker (destructive ambiguity, missing credential, contradictory hard constraints).
"Done or not done" — no checkpoint reports, no menu-of-options questions.

**14b. Pattern-filtering evidence instead of reading it.** Agents repeatedly built
bash/python/regex filters to scan logs and rendered HTML for errors. Filters only
find failures you already anticipated; the misses were exactly the *unknown* errors
("it is hard to build filtering to detect errors or changes when you do not know
those errors or changes" — owner, 2026-07-06).
**Standing rule:** use the Read tool to actually READ log files, rendered HTML, and
captured evidence. If the file is too large for your context, spawn a subagent to
read and summarize it — do not fall back to grep-for-what-I-expect. Green tests and
clean grep output never close a UI issue; drive the real app and look at what it
rendered (see gact-validation-and-qa).

---

## The distilled rulebook (one line each)

1. Fresh build + reproduce before ANY revert; revert surgically, never wholesale over unrelated work. (E1)
2. dspy.extract is the return synthesis: in-flow, streamed, never folded, never deduped. (E1, E2)
3. No client-side dedup/filters/semantics — server-first, because GACT is generic across backends. (E2)
4. One markdown renderer, incremental append-only; hljs/copy-button loss is the accepted price. (E3)
5. Live = normalized streaming path seeded from `/messages` on join; never render live through the persisted path. (E4)
6. Session lists are filtered views: absent-from-list ≠ deleted; prune only on explicit deletion signals, with audit events. (E5)
7. Fix-merged-to-develop ≠ released: check `git branch --contains` before trusting a binary. (E6)
8. Never commit run artifacts/media/binaries; expect a history-rewrite force-push (unscheduled as of 2026-07-06). (E7)
9. apps.yml release comments are tested code — notes generated once, `--config src-tauri/...`, AppImage lite-only. (E8)
10. `_UnsupportedSessionAgent` = your harness until the known-good command line fails outside the UI; never wrong-blame the backend or the ALCF token. (E9)
11. Cite only committed files in docs/skills; verify with `git ls-files`. (E10)
12. Windows tool hangs: suspect stdin/handle inheritance first. (E11)
13. Never feature-gate on version strings; capability flags are the only truth. (E12)
14. Judge branches by `git cherry`, not ancestry; escalate merge-or-delete on rotting complete work. (E13)
15. Autonomous means autonomous: no mid-run questions except real blockers; READ evidence files, don't regex them. (E14)

## When NOT to use this skill

- **You have a live failure right now and need triage** → gact-debugging-playbook
  (symptom→experiment tables). This skill explains *why* the traps exist; that one
  gets you unstuck.
- **You need the full working-session doctrine** (autonomy, evidence honesty,
  protected resources) → gact-working-discipline.
- **You are designing a proof that a fix works** (wire-capture differential,
  byte-parity, stale-build discrimination) → gact-proof-and-analysis-toolkit.
- **You want to know what counts as evidence / how to add tests** →
  gact-validation-and-qa.
- **You are classifying or gating a change** (what needs review, branch model,
  commit conventions) → gact-change-control.
- **You need protocol details** (endpoints, envelope, drift classes) →
  gact-wire-protocol-reference.
- **You are running the stack** (ports, emulator, clio, cleanup) →
  gact-run-and-operate.

## Provenance and maintenance

Everything above was verified against the repo on **2026-07-06** (issue states via
GitHub API the same day; the P0 bulk-close timestamps read 2026-07-07T02:01Z UTC).
Re-verify volatile facts before relying on them:

```powershell
# Any commit hash + subject cited above
git show -s --format='%h | %ad | %s' --date=format:'%Y-%m-%d' <hash>

# Are the develop-only fixes released to main yet? (12 ahead as of 2026-07-06)
git fetch origin; git rev-list --left-right --count origin/main...origin/develop

# Does a given branch contain a fix?
git branch -r --contains 57496b29

# Issue / epic states (P0s closed 2026-07-07 UTC; epics 232-236, 250 open as of 2026-07-06)
gh issue view 233 --repo iowarp/gact-tui --json state,title
gh issue view 235 --repo iowarp/gact-tui --json state,title

# Pack size (687.43 MiB on 2026-07-06; history rewrite pending under #235)
git count-objects -vH | Select-String size-pack

# ACP branch still unmerged?
git cherry develop origin/feat/acp-adapter        # '+ b677dde1' = still unmerged

# Stale 0.1 wire markers still present?
Select-String -Path adapters/crush/server.go,adapters/opencode/server.go -Pattern '"0\.1"'
Select-String -Path adapters/claude-agent-sdk-server/src/gact_claude_sdk/server.py -Pattern 'CONTRACT_VERSION'

# capture-earthscope ghost still cited?
git grep -n capture-earthscope

# Streaming-rework ledger (2026-07-01 snapshot; item 'D' = done WRONG)
git log -1 --format='%h %ad' -- STREAMING-DEMO-ISSUES.md
```

If a re-verification contradicts an entry, update the entry's **Status** line and
date-stamp the change — do not delete the incident history.
