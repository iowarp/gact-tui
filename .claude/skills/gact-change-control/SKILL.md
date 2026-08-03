---
name: gact-change-control
description: Load before making ANY change to gact-tui — code, docs, adapters, protocol, UI, or release prep. Tells you how changes are classified and gated here (spec-first for wire changes, screenshot-required for UI, server-first for clio-coupled work), the non-negotiable rules with the incidents behind them, the develop/main branch model and why GitHub issue state misleads, which docs are current vs stale, and the commit/PR house style. Triggers: "should I commit this", "where does this change start", "can I close this issue", "which branch", "is this doc current", "how do I write the commit message", spec/SPEC.md edits, opening a PR, touching contract or adapter code.
---

# gact-change-control — how changes are classified, gated, and reviewed in gact-tui

Audience: an AI session or engineer with zero context, working in
`D:\Libraries\Documents\projects\gact-tui` on this Windows machine (PowerShell primary).
Everything below was verified against the repo and GitHub on **2026-07-06**. Volatile facts
are date-stamped; re-verification commands are at the end.

Definitions used throughout:

- **Wire-visible**: any behavior another process can observe over the REST+SSE protocol —
  endpoints, JSON shapes, SSE event names/payloads, capability flags, status enums.
- **Conformance suite**: the test module at `contract/conformance/` that asserts a backend
  implements `contract/SPEC.md`.
- **clio**: the canonical agent backend, [iowarp/clio-agent](https://github.com/iowarp/clio-agent)
  (separate repo; on this machine at `D:\Libraries\Documents\projects\clio-agent`). In prose say
  "clio" or "the agent backend", not "the sidecar" (code symbols named sidecar stay as-is).
- **Squash-merge**: GitHub compresses a PR's commits into one commit on the base branch; the PR
  number is appended to the subject.

---

## 1. Change classification — find your row FIRST

Every change falls into one of these classes. The class dictates the required sequence and
gates. When a change spans classes (common), satisfy every applicable row.

| Class | You are in it if... | Required sequence | Gate before merge |
|---|---|---|---|
| **Wire-visible protocol change** | You touch endpoints, SSE events, JSON payload shapes, enums, capability flags — in emulator, adapters, TUI client, or web/desktop transport | `contract/SPEC.md` + conformance suite FIRST, then emulator, then adapters, then clients (CLAUDE.md rule 5) | Conformance tests pass; every hand-copied type layer updated (see warning below) |
| **UI change** | Anything under `tui/` that renders, or `apps/web`/`apps/desktop` visuals | Implement → fresh screenshot / rendered evidence → owner ack if UX semantics visibly change | A fresh screenshot in `screenshots/` (TUI) or `apps/web/screenshots/` (web); NOT green tests alone |
| **clio-coupled change** | The fix compensates for, filters, or depends on clio server behavior | Server first: the clio-side fix lands before the client compensation is removed/added | Check the gating clio issue is actually closed (e.g. clio#767, still OPEN as of 2026-07-06) |
| **Adapter change** | `adapters/{opencode,crush,goose,claudecode}` or `adapters/claude-agent-sdk-server` | Spec defines the shape; adapter conforms to it — never the reverse | Conformance + adapter module tests; Python adapter: `uv run pytest` (no CI covers it as of 2026-07-06 — see iowarp/gact-tui#235) |
| **Docs-only change** | Only `.md`, `docs/`, `screenshots/` content | Direct; note CI skips builds for these paths (`.github/workflows/ci.yml` `paths-ignore`) | Still bound by "no new root-level report files" (§3) |
| **Release** | Version bumps, tag prep, release notes | Follow the existing `release` skill (`.claude/skills/release.md`) exactly | **The tag is a HUMAN action** — prepare and verify only (§3) |

### 1a. Wire-visible protocol change — the full runbook

The order is non-negotiable (CLAUDE.md rule 5: "Spec first. Wire-visible behavior changes
start in `contract/SPEC.md` and the conformance suite, then propagate to emulator, adapters,
and clients").

1. Edit `contract/SPEC.md` to state the new/changed shape.
2. Add or update conformance assertions in `contract/conformance/` (drift-class assertions
   live in `drift_checks.go` there — added by PR iowarp/gact-tui#247).
3. Propagate to `emulator/`, then each adapter, then the TUI client (`tui/internal/client`)
   and the TS layer (`apps/core`).
4. Run the gate:

```powershell
# from D:\Libraries\Documents\projects\gact-tui (Git Bash equivalents: same make targets)
make test    # unit + integration for every go.work module, incl. contract/conformance
make vet
```

**The incident behind the rule — the #232 drift program.** The spec was never updated while
the implementation evolved, and because wire types are hand-copied across FOUR layers
(clio's Python `types.py` → spec → Go `emulator/pkg/gact` → TS `apps/core`), every checked
enum had drifted. Commit `c66b885f` ("fix: sync wire layers to the codified shapes — crush
flat message.created, TS enum/payload drifts (#248)") catalogs the damage: `SessionStatus`
missing `waiting_user`/`cancelled` with an invented `finished`; an invented `RoutingMode`
`manual`; a `SessionUpdatedPayload` that was an emulator-only diff shape; a
`SessionCompactedPayload` with zero key overlap with the server; the crush adapter alone
nesting `message.created` under a `message` key. The owner's 2026-07-01 direction decision
(recorded in `docs/system-cleanup-2026-07.md`): **reality leads, spec documents, conformance
enforces** — reconcile the spec to today's clio implementation, except where the
implementation is self-contradictory, in which case pick the coherent behavior and codify it.
Epic iowarp/gact-tui#232 tracks the remaining convergence work (type codegen, type ownership
out of the emulator package, etc. — still open as of 2026-07-06).

**Warning that survives until #232 finishes:** the Go TUI imports its protocol types from
`emulator/pkg/gact` (yes, the test emulator) and the TS types are hand-copied. Until codegen
lands, a wire change is not done when the spec and one client compile — you must sweep all
four type layers or you have manufactured the next drift.

### 1b. UI change — evidence, not description

CLAUDE.md rule 2: changes under `tui/` end with a fresh screenshot — "Don't describe the
change — show it." Green unit tests never close a UI issue (owner rule, confirmed
2026-07-06): drive the real product and read the rendered output.

- **TUI**: use the existing `tui-screenshot` skill (`.claude/skills/tui-screenshot.md`) —
  build the binary, drive it with a VHS tape, `Screenshot` a PNG, then **Read the PNG with
  the Read tool** and look at it. The repo-wide pipeline is `make screenshots` (renders every
  tape under `tui/` into `screenshots/`; `screenshots/README.md` is the curated index —
  UI-touching work must add or refresh an entry there). Tape trap the skill documents: use
  `Wait+Screen /regex/`, not `Wait /regex/` (the last line of a bordered TUI is `╰─╯`).
- **Web/desktop**: capture the rendered page (Playwright screenshot or saved HTML) and READ
  it — do not grep it for expected strings and call that verification (owner rule: pattern
  filters miss the errors you did not predict).

**Owner ack for visible UX semantics.** If the change alters what a user *sees or means*
(not just fixes a defect), request explicit owner acknowledgment in the PR body and label the
change as revertible. Precedent: PR iowarp/gact-tui#249 (merged 2026-07-02) shipped thinking
prose as an inline `●` row replacing the old `⎿ thinking available · Ctrl+E` affordance and
carried the line "**Visible UX change (owner ack requested)** ... Easy to revert to the
affordance style if preferred." Copy that pattern verbatim: state the change, request ack,
state the revert path.

**Regression reports against a fresh build.** Before reverting UI work because "it looks
broken", rebuild from clean and reproduce. Incident: commit `3fb9ba24` (2026-07-01)
wholesale-reverted the render-presentation work in `d186ac97` on a "handoff box / no dots"
report; 80 minutes later `ad8a9e79` reverted the revert — the report was a stale-build cache
artifact (the second such incident; the first was the search-render cache issue named in that
commit body). Owner calls fresh-build-before-revert "kind of" a rule; treat it as one.

### 1c. clio-coupled change — server-first, and the genericity rule

Two distinct rules, both owner-confirmed 2026-07-06:

1. **Server-first sequencing.** `docs/system-cleanup-2026-07.md` (sequencing note): clio#767
   (single-writer TurnTranscript) must remove the text/`tool_call.thought` duplication at the
   source; **only then** can the web/TUI prose filters (`dedupToolThought`,
   `dedupeRepeatedText` remnants, `clioScaffolding`, the TUI normalization pipeline) be
   deleted rather than kept as compensations. As of 2026-07-06, clio#767 is OPEN — do not
   start those deletions. Check first:

   ```powershell
   gh issue view 767 --repo iowarp/clio-agent --json state,title
   ```

2. **The genericity rule (deeper than sequencing).** GACT is a *generic* interface to many
   agent backends. NEVER inject dedup, filtering, or semantic interpretation into generic
   client code when it encodes one agent's behavior — it breaks every other backend and
   creates live-vs-reload divergence. Incident: `dedupeRepeatedText` was built on a wrong
   reading of clio's dspy.extract semantics, could drop real content, and ran only on settled
   messages (so live rendering diverged from reload); it was deleted in `e442b485`
   (2026-07-01, "retire client-side text dedup so live == reload" — the commit body records
   it "could drop real content") with tests asserting the no-dedup contract, and the genuine
   double-emit was sent back to the server (clio #736).
   The remaining client filters WILL be removed once clio#767 lands — do not add new ones.

### 1d. Docs-only change

- CI (`.github/workflows/ci.yml`) skips Go builds for `**.md`, `docs/**`, `screenshots/**`,
  images — a docs commit will not exercise tests. That is not a license to skip local checks
  when your "docs" change touches anything executable (Makefile, tapes, scripts).
- Durable status goes to GitHub issues/PRs; one-shot reports to `docs/archive/` or the
  issue thread. See §4 for which docs are current.

### 1e. Release

Follow `.claude/skills/release.md` (the pre-existing flat skill — read it in full before any
release work). Its hard boundaries are restated in §3 because they are absolute.

---

## 2. Change-control checklist (run for every PR)

1. Classify the change against §1; satisfy every applicable row.
2. `make test` (and `make test-race` for concurrency-touching Go changes), `make vet`,
   `make fmt`. Do NOT run bare `go test ./...` from the repo root and trust it as the full
   gate — use the make targets, which iterate every `go.work` module.
3. UI touched → fresh screenshot committed/refreshed (§1b).
4. Wire touched → SPEC.md + conformance updated FIRST, all four type layers swept (§1a).
5. clio-coupled → gating clio issue verified closed, or the change explicitly keeps the
   compensation (§1c).
6. New UI code placed in an existing seam-named file cluster (`catalog_browser_*`,
   `conversation_*`, `command_palette_*`, ...) — not a new god file (§3, "no accretion").
7. Commit message in house style (§5); branch per §4.
8. Visible UX semantics changed → owner-ack paragraph in the PR body (§1b).

---

## 3. Non-negotiables — rule, rationale, incident

These are absolute. Do not route around them, and do not treat grandfathered violations in
the tree as precedent.

| Rule | Rationale | The incident behind it |
|---|---|---|
| **No silent fallback.** Failure/unavailability must surface a structured reason — never substitute defaults, swallow errors, or fake success | Silent degradation hides broken capabilities from users and from the next debugging session | Positive model: PR #238 (`a42a19ee`) fixed compact's 404 by calling the real `/compact` route, and its legacy-route fallback **reports** `compact_route_missing_legacy_summarize` instead of silently rerouting |
| **No accretion / no new god files.** New UI code goes into existing seam-named file clusters | `tui/internal/ui` is one flat package — 625 top-level `.go` files as of 2026-07-06 — with every component holding `app *App`; the split is pending as iowarp/gact-tui#234 (zero PRs so far). Every file added outside a seam deepens the object the split must untangle | The package itself is the incident; its predecessor `*App` god object took a 40-commit campaign (June 2026 rework) to dismantle 947→27 methods |
| **Tests must pass. Never `t.Skip` to go green** | A skipped test is a hidden failure; CLAUDE.md rule 1 counts skips as failures | House doctrine (CLAUDE.md); no known violation — keep it that way |
| **Real implementations only.** A stub returning `501 Not Implemented` is fine; an endpoint that pretends to work is not | Capability honesty is the project thesis: if `/v1/capabilities` flags it true, a user must be able to invoke it | Doctrine recorded in `docs/archive/PLAN-v0.3.1.md`: "the release slips before the truth does"; every capability ends verified-with-screenshot or blocker — "There is no third state" |
| **Genericity: no one-agent semantics in generic client code** | GACT must serve any conforming backend; baking in one agent's quirks breaks the others | `dedupeRepeatedText` retirement, `e442b485` (§1c) |
| **Server-first for clio compensations** | Deleting a client filter before the server stops double-emitting recreates the live≠reload failure class the 2026-07 audit called out | Sequencing note in `docs/system-cleanup-2026-07.md`; gate = clio#767 |
| **Conventional commits, self excluded** | `feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`; one change per commit when possible; do not add yourself (no `Co-Authored-By` trailers — verified 0 in the last 30 commits) | House style, user's global CLAUDE.md |
| **Never push a tag, publish a release, or upload artifacts without explicit human go-ahead** | A `v*` tag push triggers `.github/workflows/release.yml` (cross-platform binary build + GitHub Release) and the desktop auto-update pipeline signs and publishes `latest.json` that live clients poll — an agent-pushed tag ships software to users | Hard boundary in `.claude/skills/release.md`: "The release tag is a HUMAN action" |
| **Never commit CLIO branding assets into gact-tui** (and never the ndp-demo downloaded data into either repo) | gact-tui ships brand-neutral; CLIO branding lives in the clio-agent repo and is injected at build (`apps/brand.config.local.json` mechanism) | Genericization architecture; boundary restated in `release.md` §0 |
| **No new root-level report files** | Durable status lives in GitHub issues/PRs; reports go to `docs/archive/` or the issue. Root files like `TODO.md`, `STREAMING-DEMO-ISSUES.md`, `clio-mcp-ui-design-brief.md`, `codex-proposal-representation.md` are **grandfathered evidence, not precedent** | Hygiene epic iowarp/gact-tui#235; the pre-cleanup root held a 225 KB `PLAN.md` and 103 KB `STATUS.md` work-log pair, archived by `af0e1710` (PR #246) |
| **Fresh build before revert** | Two UI-regression reports have already been stale-build artifacts | `3fb9ba24` → `ad8a9e79` revert-of-revert saga (§1b) |

---

## 4. Branch and release model — and why GitHub issue state misleads

### The model

- **`develop`** is the integration branch. All PRs base on `develop`.
- **`main`** is the release branch and the repo default. Promotion happens via a
  develop→main **merge PR** (verified: PR #211 → v0.9.0, PR #212 → v0.9.1, PR #223 → v0.9.4).
- Tags: `v0.9.2`/`v0.9.3` were hotfix tags cut directly on develop-side commits
  (`a66eabf8`, `d73c6e61`, desktop arm64 sidecar fixes) rather than on promotion merges;
  both are now ancestors of `origin/main`. Treat direct-on-develop tagging as an owner-only
  hotfix exception, not a pattern.
- A `v*` tag push triggers the release workflow (§3). Never push tags.

### State as of 2026-07-06 (evening; timestamps in UTC)

- `origin/main` = `3c904685` (merge of PR #223, v0.9.4, 2026-07-02).
- `origin/develop` = `c1e96579` (PR #249, parity phase 1) — **12 commits ahead of
  `origin/main`**. The entire 2026-07 cleanup program (PRs #238–#249) exists only on
  develop; a hotfix cut from main would resurrect every audit P0 bug.
- **This-machine fact:** the local checkout's `main` is 84 commits behind `origin/main`
  (parked at v0.8.4-era) and local `develop` was 1 behind `origin/develop`. Never reason
  about "what the code does" from a local branch without checking freshness first:

```powershell
git rev-list --left-right --count develop...origin/develop   # want 0<TAB>0
git rev-list --left-right --count main...origin/main
```

  (If you are read-only, compare against `gh api repos/iowarp/gact-tui/branches/develop`
  instead of fetching.)

### Why `gh issue list` misleads (read this before triaging or closing anything)

Two mechanisms, both live:

1. **`Fixes #NNN` never auto-closes here.** GitHub auto-close only fires when a PR merges
   into the *default* branch (`main`). Fix PRs base on `develop`, so their `Fixes #` links
   sit inert until a develop→main promotion — issues stay open long after the fix merged.
2. **Manual sweeps close issues that are NOT yet released.** The eight audit P0s
   (iowarp/gact-tui#224–#231) were fixed on develop 2026-07-02 (PRs #238–#244, #247/#248)
   but stayed open for four days; on 2026-07-07T02:01Z the owner closed all eight manually
   ("Fixed by PR #NNN — merged and verified reachable from `develop` ... Phase 0 sweep
   (#237)"). At that moment `origin/main` still did not contain the fixes.

Consequences:

- An OPEN issue may already be fixed on develop — check the issue timeline and
  `git log origin/develop --grep "#NNN"` before redoing work.
- A CLOSED issue may not be fixed in any *release* — closure here means "reachable from
  develop", not "shipped". Verify with:

```powershell
gh issue view 224 --json state,closedAt --jq '"\(.state) \(.closedAt)"'
git log --oneline origin/main..origin/develop        # what is merged but unreleased
```

- **You do not close audit-program issues yourself.** Sweeps are an owner action tied to
  verification passes; your PR body carries the `Fixes #NNN` link and stops there.

### Open-program snapshot (as of 2026-07-06 — re-verify before relying on it)

- Umbrella iowarp/gact-tui#237 and epics #232–#236: OPEN. #234 (ui package split) has zero
  PRs. #235's git-filter-repo history rewrite + force-push is announced but unscheduled —
  when it lands, every local branch/clone is invalidated.
- clio side: clio#775 (umbrella) and clio#767 (TurnTranscript gate) OPEN.
- Newest work: iowarp/gact-tui#250 (clio↔human interaction channel).

---

## 5. Commit and PR house style (from the actual log)

### Commit subjects

Conventional type, optional scope, lowercase imperative summary; em-dashes and semantic
detail welcome; issue refs in parens at the end. Real examples from `git log`:

```
fix: compact sessions via POST /compact with focus key, not /summarize (#224) (#238)
fix(tui): bound the execution event ledger; prune only on explicit deletion (#244)
docs(contract): reconcile SPEC.md to clio reality; conformance asserts the drift classes (#247)
chore: repo hygiene — untrack run artifacts, archive root work-logs, truthful CLAUDE.md, CI gaps (#246)
```

The trailing `(#NNN)` pairs come from squash-merge (issue ref you wrote + PR number GitHub
appends). Note the caution from project memory: bare `#NN` auto-links to this repo's issues —
never use bare `#NN` for *internal/foreign* IDs (clio issues are written `clio#767` or as
full URLs; internal gap-tracker IDs as `gap-NN`).

### Commit bodies

The house standard is a *mechanism* body: what was wrong, why, what changed, per-surface
bullets. Model example, `a42a19ee` (abridged):

```
clio's GACT surface serves only POST /v1/sessions/{sid}/compact and reads
a 'focus' body key; the TUI was calling the nonexistent /summarize route
with an 'instructions' key, so every compact attempt 404ed.

- client: replace SummarizeSession with CompactSession(id, focus) ...
  and report the degradation via a structured fallback reason
  (compact_route_missing_legacy_summarize) instead of silently rerouting ...
- ui: requestCompactCmd uses CompactSession ...
- cli: gact summarize maps --instructions into focus ...
- doctor: session_summary capability row now names the real route.
```

No `Co-Authored-By` / AI-attribution trailers — the user's global rules exclude the agent
from commits, and the last 30 commits contain zero such trailers. (This overrides any
harness default that appends one.)

### PR bodies

- Base on `develop`. Link the issue with `Fixes #NNN` (knowing it will not auto-close — §4).
- State the verification story explicitly, including failed attempts. Model: PR #249's body
  records that adversarial review REJECTED the first cut (cached `diffActions` slice
  mutation walked click targets down the screen, y=15→21), that the repair started from the
  verifier's repro as a failing-first regression test, and that a counterfactual run against
  the pre-fix commit reproduced the bug. That is the evidence bar for "verified".
- Visible UX change → the owner-ack paragraph (§1b).

---

## 6. Docs of record — what is current, stale, or superseded

Rule: **durable status = GitHub issues and PRs.** One-shot reports → `docs/archive/` or the
issue thread. Never new root-level files.

Staleness map, verified 2026-07-06:

| Doc | Status | Notes |
|---|---|---|
| `docs/system-cleanup-2026-07.md` | **Current** | Pointer to the audit program; direction decision + sequencing note live here |
| `docs/FEATURES.md` | **Current** | Long-form feature reference (refreshed 2026-07-02) |
| `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` | **Current** (test-enforced) | Capability rows are asserted by tests; dated 2026-06-03, last touched 2026-06-24 |
| `docs/TUI_ONE_ZERO_RELEASE_CHECKLIST.md` | Current-ish | The 1.0 gate; its issue lists are June-era — re-check against GitHub |
| `docs/agent-operational-memory.md` | **Current** | Hard rules for live clio runs (contains at least one internally stale claim: it calls `docs/handoff-2026-06-10.md` untracked; that file has been tracked since 2026-06-18) |
| `docs/clio-interaction-channel-design.md` + `-implementation-plan.md` | **Current frontier — but UNTRACKED** as of 2026-07-06 (`git status` shows `??`) | The durable design for issue #250. Do NOT `git clean` them away; whether/where to commit them is an owner decision |
| `clio-mcp-ui-design-brief.md` (root) | **Superseded** | Its duplex-WebSocket recommendation was rejected; the interaction-channel design doc (REST+SSE only) replaces it |
| `docs/ZERO_NINE_READINESS.md` | Historical | Self-declares: "not the current 1.0 release gate" |
| `docs/handoff-2026-06-10.md`, `docs/handoff-2026-06-17-*.md`, `docs/overnight-real-ui-validation-2026-06-17.md` | Historical | 0.8.x-era work-logs; mine for incidents, not for current state |
| `docs/archive/` (PLAN.md, STATUS.md, LOOP.md, ...) | Historical | Archive README: "Nothing here is current" |
| `TODO.md` (root) | Historical | All 35 boxes checked (June 28); grandfathered root file |
| `STREAMING-DEMO-ISSUES.md`, `codex-proposal-representation.md` (root) | Historical/grandfathered | Honest ledgers of past problems; several items since resolved elsewhere |
| `CHANGELOG.md` (root) | **Stale — do not extend without a decision** | Last entry 0.2.1 (2026-04-27) vs tags through v0.9.4; reviving vs deprecating it is an open item under #235 |
| `README.md` (root) | Partially stale | Still badges "Contract: v0.2"; version story lives in git tags + PRs |
| `docs/man/gact.1` | Stale | Says "gact 0.2", May 2026 |

When you finish a one-shot analysis: put it in the relevant issue as a comment, or under
`docs/archive/` — never a new root `*.md`, never a new `docs/STATUS`-style journal.

---

## 7. When NOT to use this skill

| You actually want to... | Load instead |
|---|---|
| Debug a failure (triage a symptom, pick an experiment) | **gact-debugging-playbook** |
| Learn the wire contract details (endpoints, envelope, turn lifecycle, dialects) | **gact-wire-protocol-reference** |
| Run the stack (emulator, TUI, clio, web, desktop, ports, cleanup) | **gact-run-and-operate** |
| Set up the toolchain / build from scratch | **gact-build-and-env** |
| Decide what counts as evidence / add tests / golden discipline | **gact-validation-and-qa** |
| Understand WHY the architecture is shaped this way | **gact-architecture-contract** |
| Read the history of a past investigation or revert | **gact-failure-archaeology** |
| Actually cut a release (step-by-step verify gates) | the existing `release` skill (`.claude/skills/release.md`) — this skill only encodes its boundaries |
| Know how a session should behave (autonomy, evidence-reading) | **gact-working-discipline** |

This skill is the *process* layer: classification, gates, branch model, docs-of-record,
house style. It contains no how-to-run and no how-to-debug content.

---

## 8. Provenance and maintenance

All claims verified 2026-07-06 against the working tree, `git log`, and the GitHub API.
Re-verify the volatile ones before relying on them:

```powershell
# Branch divergence (develop ahead of main; local freshness)
git rev-list --left-right --count origin/main...origin/develop
git rev-list --left-right --count develop...origin/develop

# Audit-program issue states (P0s were closed 2026-07-07T02:01Z by manual sweep)
gh issue list --repo iowarp/gact-tui --label audit-2026-07 --state all --limit 20
gh issue view 767 --repo iowarp/clio-agent --json state    # server-first gate

# ui package size (the no-accretion baseline: 625 top-level .go files on 2026-07-06)
(Get-ChildItem tui\internal\ui\*.go | Measure-Object).Count

# Untracked frontier docs still untracked?
git status --porcelain docs/

# Tag list / release head
git tag | Select-Object -Last 5
gh api repos/iowarp/gact-tui/branches/main --jq .commit.sha

# House-style spot check (recent subjects + absence of self-attribution trailers)
git log --format='%s' -10
git log --format='%(trailers:key=Co-Authored-By)' -30

# Cited commits still resolve
git log -1 --format='%h %s' a42a19ee; git log -1 --format='%h %s' e442b485
git log -1 --format='%h %s' 3fb9ba24; git log -1 --format='%h %s' ad8a9e79
git log -1 --format='%h %s' c66b885f; git log -1 --format='%h %s' af0e1710
```

Known-drifting items to re-check on next major edit: #232/#234/#235 epic progress, clio#767
state, whether the interaction-channel docs got committed, whether a develop→main promotion
(v0.9.5+) landed, whether the #235 history rewrite was scheduled, CHANGELOG.md disposition.
