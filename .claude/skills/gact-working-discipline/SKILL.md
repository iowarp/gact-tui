---
name: gact-working-discipline
description: How an AI session conducts itself on gact-tui — autonomy rules (work to completion, never stop mid-task to ask an answerable question), the read-the-evidence doctrine (Read logs/HTML/screenshots directly; no premature grep filters), run-the-real-app as part of done, the protected-resources table (what you must never kill, delete, commit, or modify), the genericity + server-first doctrine, evidence honesty, and permission-prompt semantics. Load at the START of any session here, especially autonomous/overnight work; load again before deciding to stop and ask the user, before killing a process or deleting files, and whenever tempted to add a client-side filter for one backend's quirk.
---

# gact-working-discipline

Doctrine, not a runbook: this is how a session behaves, not how to run things
(that is gact-run-and-operate) or how to debug them (gact-debugging-playbook).

Terms used throughout: **clio** = the canonical agent backend
([iowarp/clio-agent](https://github.com/iowarp/clio-agent)) — say "clio" or
"the agent backend" in prose, not "the sidecar". **Surfaces** = the three
clients: TUI (`tui/`), web (`apps/web`), desktop (`apps/desktop`).
**SSE** = Server-Sent Events, the streaming half of the GACT wire contract.
**The emulator** = `emulator/`, a scriptable fake backend implementing the
contract.

---

## 1. Autonomy: work to completion

The single costliest failure in this project's history was not a bug. It was
an agent stopping mid-task during an overnight autonomous run to ask an
unnecessary question — the answer sat unread for hours and ~4 hours of work
window were lost (owner, 2026-07-06). Standing project memory says the same:
**no checkpoints — a task is done or not done**. Do not stop to report
progress; do not present "option A / option B / do everything" menus (default
to the comprehensive scope); do not ask for confirmation the repo can give you.

**The 30-minute test** — apply before every would-be question:

> Can I find this out myself with under 30 minutes of reading or a cheap
> experiment (read the doc, read the code, boot the emulator, run the test,
> take the screenshot)? **Then do that instead of asking.**

The repo is unusually self-answering: `contract/SPEC.md` for wire questions,
`docs/system-cleanup-2026-07.md` for program sequencing,
`docs/agent-operational-memory.md` for live-run rules, GitHub issues/PRs for
status (never root markdown files), the sibling gact-* skills for everything
else.

### The ONLY legitimate reasons to stop and ask

| Stop for | Examples | Why |
|---|---|---|
| Destructive / irreversible actions | `git push --force`, history rewrite (the iowarp/gact-tui#235 `filter-repo` rewrite is owner-coordinated), deleting user data or session state, publishing packages | Cannot be undone by the next session |
| Tagging / publishing a release | pushing any `v*` tag, GitHub release, store publish | "The release tag is a HUMAN action" — verbatim rule in the release skill; CI builds the matrix off the tag |
| Genuine scope change | the task as stated turns out to require rewriting a different subsystem, or contradicts a standing rule | The owner set the scope; only the owner changes it |

Everything else — ambiguous wording, missing detail, "should I also fix X",
"is this the right file" — is answered by reading or experimenting.

### Owner-visible UX changes: flag, don't block

A change to what the user *sees or means* (not just how it's built) does NOT
require stopping mid-task. The precedent is PR
[iowarp/gact-tui#249](https://github.com/iowarp/gact-tui/pull/249) (merged
2026-07-02): it changed thinking prose from a "⎿ thinking available · Ctrl+E"
affordance to an inline ● row, and shipped with an explicit
**"Visible UX change (owner ack requested)"** paragraph in the PR body plus a
note that the revert is easy. Copy that pattern:

1. Make the change reversible (small, isolated commit).
2. Label it in the PR body: what changed visually, screenshot before/after,
   "owner ack requested", how to revert.
3. Keep working.

---

## 2. Read the evidence (the anti-filter doctrine)

Owner rule, 2026-07-06, verbatim intent: *it is hard to build filtering to
detect errors or changes when you do not know those errors or changes.* Regex
and grep pipelines only find failure signatures you already know. Unknown
failures — the ones that matter — slide straight through them. This has
repeatedly cost real time on this project.

| Do | Don't |
|---|---|
| Use the **Read tool** on the log file, the rendered HTML artifact, the screenshot PNG — eyes on the whole thing | Pipe logs through `grep`/`Select-String`/python filters as the *first* look |
| Read the rendered transcript HTML and compare visually against `apps/web/RENDERING_SPEC.md` + `apps/web/CANONICAL-CONVERSATION.md` | Treat grep/count summaries as proof for rendering fixes — root `TODO.md` line 19 codifies this ban verbatim |
| Grep **after** the failure signature is known, to count/locate further instances | Grep to *discover* what's wrong |
| If the file is huge and context is tight: **spawn a subagent whose whole job is to Read it end-to-end and summarize** | Pre-filter the file to "save context" — the filter is where unknown errors die |

The same rule applies to screenshots: Read the PNG and look at it. Border
corners, colors, truncation, duplicated rows — none of these are grep-able.

---

## 3. Run the real app: part of "done"

Green tests are **necessary, never sufficient**. Standing memory: *launch and
screenshot the running UI; don't trust green tests.* A green suite has
coexisted with visibly broken rendering more than once here (the web
transcript bugs of late June 2026 all had passing tests).

Definition of done for any change that touches what a user sees:

| Surface | Minimum evidence |
|---|---|
| TUI (`tui/`) | Fresh VHS screenshot via the `tui-screenshot` skill or `make screenshots`; Read the PNG; add/refresh the curated capture in `screenshots/` (CLAUDE.md working rule 2) |
| Web (`apps/web`) | Drive the real page (e.g. `cd apps/web; npm run demo:earthscope-render`), then Read the saved HTML and screenshots |
| Desktop | Launch the dev build and screenshot; note (as of 2026-07-06) the Rust crate's `*_tests.rs` never run in CI, so "CI green" says nothing about desktop |

For live-backend evidence rules (permission states, synthesis tail, session
archiving) see gact-validation-and-qa; for how to launch each surface see
gact-run-and-operate.

---

## 4. Protected resources

Facts marked **[this machine]** are specific to this Windows box
(D:/Libraries/Documents/projects/gact-tui) and must not be generalized.

| Resource | Rule | Why / source |
|---|---|---|
| `127.0.0.1:17960` **[this machine]** | NEVER kill, restart, or repurpose it. It is the shared developer clio runtime. Validation uses an owned clio on an owned port (convention: 17801 from source) with isolated config/state dirs | `docs/agent-operational-memory.md` ("rediscovered too many times") |
| The clio-agent checkout — `D:\Libraries\Documents\projects\clio-agent` **[this machine]** (docs also cite `/home/jcernuda/clio-agent`, the same rule from a Linux box) | Read and execute only from gact-tui work. Never edit it here; it belongs to the clio-agent development flow | `docs/agent-operational-memory.md` |
| `research/` | Read-only reference clones by convention. Gitignored (`.gitignore` line 2) and may be entirely absent from a checkout — that is normal | `.gitignore`; CLAUDE.md layout (which describes the convention, not tracked content) |
| `docs/handoff-*.md` | Do not delete. (`docs/handoff-2026-06-10.md` is described as untracked in older docs; it has been tracked since release 0.8.4 — the don't-delete rule stands, the "untracked" claim is stale) | `docs/agent-operational-memory.md`; `git ls-files` |
| `.clio/` at repo root | Never commit. It is live clio session state and, as of 2026-07-06, it is **NOT gitignored** — `git status` shows `?? .clio/`, so a careless `git add .` commits real session data | `git status --porcelain`; runtime state, not source |
| `visual_loop/` run outputs (`tui_audit_*/`, `*.jsonl`, `*.png`, `*.log`), `tmp/` | Never commit; regenerable run artifacts (gitignored, with two whitelisted replay fixtures) | `.gitignore` lines 68–87; CLAUDE.md |
| The six pre-existing flat skills (`.claude/skills/{tui-screenshot,tui-test,release,cleanup-after-run,clio-web-deploy,live-web-session}.md`) | Do not modify them from library work; they are a separate, earlier generation | Library authoring boundary |
| Release tags / publishing | Prepare and verify only; the tag push is a human action | `.claude/skills/release.md` line 6 |
| Ports 17800 vs 17801 **[this machine]** | 17800 = conventional `clio start` / desktop sidecar / docker; 17801 = instrumented from-source dev clio. Don't conflate; don't kill what you didn't start | gact-run-and-operate has the full port map |

When you must kill a clio you own, match on the full command line (process
name + port), never on bare `python.exe` — see the cleanup steps in
gact-run-and-operate.

---

## 5. Genericity doctrine: no backend semantics in shared client code

GACT is a **generic** interface to many agent backends (clio, opencode, crush,
goose, claudecode, the emulator). Encoding one backend's output semantics into
shared client code — dedup, prose filters, "this text is scaffolding" rules —
breaks every other backend and has already produced this repo's worst
architecture saga:

- `dedupeRepeatedText` was built on a wrong reading of clio's `dspy.extract`
  semantics, could drop real content, and made live rendering diverge from
  reload. It was deleted in commit e442b485 `refactor(web): retire client-side
  text dedup so live == reload` (2026-07-01), with the genuine backend
  double-emit fixed at the source (clio#736).

Standing rules (owner-confirmed 2026-07-06):

1. **Never add a new client-side compensation** for a backend quirk. If the
   backend emits it wrong, the fix is a backend issue + server fix.
2. The compensations that still exist (`dedupToolThought`, `clioScaffolding`,
   the TUI normalization pipeline) are **temporary, labeled, and awaiting
   their server fix** —
   [clio#767](https://github.com/iowarp/clio-agent/issues/767), single-writer
   TurnTranscript. The dedup removal WILL happen. Do not extend them, do not
   copy the pattern.
3. `dspy.extract` ≈ the return synthesis is **expected**, not a duplicate —
   do not re-dedup it (that was the retired mistake).

---

## 6. Server-first sequencing

Root-cause fixes go where the bug lives — usually the server. Two corollaries:

**Sequencing gates are real.** `docs/system-cleanup-2026-07.md` §Sequencing:
client prose filters may only be deleted *after* clio#767 lands server-side;
epic iowarp/gact-tui#233 (TUI parity) phases wait on
iowarp/gact-tui#232 settling the authoritative streaming channel. Deleting a
compensation before its server fix re-creates the exact live≠reload failure
the 2026-07 audit called out. Check the gate state before acting (commands in
Provenance below).

**Wrong-blame is a named failure mode.** Backend issue clio#689 was opened
from `_UnsupportedSessionAgent` evidence and retracted — the cause was
gact-tui harness misconfiguration. Rule: `_UnsupportedSessionAgent` and
similar live-gate failures are **harness misconfiguration until proven
otherwise**; do not open a backend issue unless the same known-good command
line fails *outside* the UI (`docs/agent-operational-memory.md`,
`docs/handoff-2026-06-17-web-desktop-polish.md` lines 1369–1413). Related
standing memory: the ALCF token is maintained by a keeper process — never
propose re-auth as a fix.

**Fresh-build-before-revert.** Commit 3fb9ba24 wholesale-reverted a correct
render rewrite (d186ac97) chasing a regression report that was a stale-build
cache artifact; ad8a9e79 reverted the revert ~80 minutes later. Before
reverting anything based on a "regression" report: rebuild fresh, reproduce
against the fresh build, then decide. Full story in gact-failure-archaeology.

---

## 7. Evidence honesty

| Rule | Meaning |
|---|---|
| Report failures **with the output** | Paste the failing command and its actual stderr/log excerpt, not a paraphrase |
| Skipped ≠ passed | A skipped or not-run test is a failure for reporting purposes (CLAUDE.md working rule 1) |
| Label the unverified | Anything you did not run/read yourself gets an explicit "unverified" tag in your report |
| No silent fallback — in code **and in reporting** | Code surfaces a structured reason when something is unavailable (cleanup-program ground rule 1); your report does the same — never quietly narrow scope or substitute a weaker check and present it as the asked-for one |
| Capability truth | If a capability flag says true, a user must actually be able to invoke it. House doctrine since the v0.3.1 plan: "the release slips before the truth does"; every claim ends verified-with-evidence or blocker — there is no third state |

---

## 8. Permission prompts during UI validation

Permission prompts are intentional product semantics, not friction
(`docs/agent-operational-memory.md`):

- **Keep permissions enabled** when validating any UI, so approval, denial,
  timeout, and blocked states are exercised — and **screenshot those states**;
  they are part of the product surface.
- Disable permissions only for an explicitly-labeled, separate non-permission
  benchmark pass, and say so in the evidence.

---

## 9. Skill maintenance duty

Skills drift; that is expected, not scandalous. When you catch any skill in
`.claude/skills/` contradicting the repo, **fix the skill** (for the gact-*
library: re-run its "Provenance and maintenance" commands and correct the
text). Known drift already caught, as examples of the failure mode:

- `tui-screenshot.md` cites `/home/jcernuda/tui/loop-test` — a Linux path from
  another machine — and predates `make screenshots`.
- `live-web-session.md` cites `capture-earthscope.mjs`, which does not exist;
  the live equivalents are under `apps/web/scripts/`.
- `docs/agent-operational-memory.md` still calls `docs/handoff-2026-06-10.md`
  untracked; it has been tracked since 2026-06-18.

A skill that silently disagrees with reality is worse than no skill — the
no-silent-fallback rule applies to documentation too. (Exception: the six flat
pre-existing skills are outside this library's write boundary — note the drift
in your report instead of editing them.)

---

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| How changes are classified, gated, branched, committed, reviewed | gact-change-control |
| Something is broken and you need triage steps | gact-debugging-playbook |
| The history of a past failure/revert before proposing a fix | gact-failure-archaeology |
| How to launch the emulator/TUI/clio/web/desktop, ports, cleanup | gact-run-and-operate |
| What counts as evidence, the test/golden inventory, adding tests | gact-validation-and-qa |
| The wire contract, capabilities, dialects | gact-wire-protocol-reference |
| The cross-surface parity campaign itself | gact-interface-parity-campaign |

This skill tells you how to *behave* while doing any of those.

---

## Provenance and maintenance

Volatile facts in this skill and how to re-verify them (PowerShell, from the
repo root):

```powershell
# .clio/ still untracked-and-not-ignored? (Section 4)
git status --porcelain | Select-String "clio"
git check-ignore -v .clio; if (-not $?) { "NOT ignored - hazard stands" }

# clio#767 sequencing gate still open? (Sections 5-6)
gh issue view 767 --repo iowarp/clio-agent --json state,title

# PR #249 owner-ack precedent unchanged? (Section 1)
gh pr view 249 --repo iowarp/gact-tui --json state,mergedAt,title

# Cited commits still resolve
git log --oneline -1 e442b485; git log --oneline -1 3fb9ba24; git log --oneline -1 ad8a9e79; git log --oneline -1 d186ac97

# Live-run hard rules doc (17960, permissions, wrong-blame) unchanged?
Get-Content docs\agent-operational-memory.md

# Sequencing doc unchanged?
Get-Content docs\system-cleanup-2026-07.md

# TODO.md read-the-HTML doctrine still present?
Select-String -Path TODO.md -Pattern "grep/count"

# This-machine clio checkout still where Section 4 says
Test-Path D:\Libraries\Documents\projects\clio-agent
```

Dated claims to re-check on drift: `.clio/` untracked status, the not-in-CI
status of desktop Rust tests, port conventions 17800/17801/17960, and whether
the client-side compensations named in Section 5 still exist (they are
scheduled for deletion once clio#767 lands).
