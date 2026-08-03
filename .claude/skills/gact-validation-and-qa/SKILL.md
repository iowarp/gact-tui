---
name: gact-validation-and-qa
description: What counts as evidence in gact-tui and how to produce it. Load this when deciding whether a change is "tested enough" or an issue can be closed, when tests are green but you are not sure that means anything, when adding tests at any layer (Go golden/teatest, conformance, vitest/Playwright), when refreshing golden files (-update-views), when running or extending the conformance suite, when a screenshot or visual_loop manifest is required, or when someone claims "CI passed so we're done". Keywords - evidence bar, golden test, conformance, 501, drift checks, -update-views, screenshot required, capability matrix, t.Skip, green does not mean, visual_loop, manifest, strict-live.
---

# gact-validation-and-qa — what counts as evidence here

This skill defines the project's evidence bar: which kinds of proof exist, when
each is required, the exact commands to produce them, and — just as important —
what a green result does NOT prove. It is written for a session running on this
Windows machine (`D:\Libraries\Documents\projects\gact-tui`, PowerShell primary,
Git Bash available). Machine-specific facts are labeled "this machine".

Definitions used throughout:

- **Golden test** — a Go test that renders a view to text and compares it
  byte-for-byte against a checked-in `testdata/*.golden` file.
- **Conformance suite** — `contract/conformance`, a stdlib-only Go module that
  hits any GACT backend over real HTTP and asserts the wire shapes match
  `contract/SPEC.md`.
- **teatest** — `github.com/charmbracelet/x/exp/teatest/v2`, a PTY simulator
  that drives a real Bubbletea program deterministically in a test.
- **VHS** — charmbracelet's terminal recorder; `.tape` scripts drive the real
  TUI binary and emit PNG/GIF captures.
- **Manifest** — a JSON receipt written by a `visual_loop/` capture script
  proving a capture came from an owned live clio backend (not a placeholder).

## When NOT to use this skill

| You actually want | Load instead |
|---|---|
| To run the emulator/TUI/clio/web/desktop, ports, cleanup | gact-run-and-operate |
| Build/toolchain/CI mechanics, why a make target fails on Windows | gact-build-and-env |
| To diagnose something that is broken or regressed | gact-debugging-playbook |
| History of a past investigation/revert ("was this tried?") | gact-failure-archaeology |
| Bubbletea/teatest/VHS authoring details and idioms | gact-bubbletea-reference |
| Wire-contract semantics you are asserting (SSE, envelope, dialects) | gact-wire-protocol-reference |
| First-principles proof recipes (wire-capture differential, byte parity) | gact-proof-and-analysis-toolkit |
| Measurement scripts and interpretation guides | gact-diagnostics-and-tooling |
| Whether/how a change may land at all, commit/PR style | gact-change-control |
| Cross-surface capability parity work | gact-interface-parity-campaign |
| Session conduct: autonomy, evidence honesty as behavior | gact-working-discipline |

---

## 1. Doctrine (owner-confirmed, overrides habit)

1. **Green tests never close a UI issue.** The closing evidence for anything
   user-visible is the real product driven and its rendered output inspected —
   a fresh screenshot for TUI work, the rendered page for web work. "The tests
   pass" is a precondition, not a conclusion.
2. **READ the evidence; do not filter it.** Use the Read tool on log files,
   rendered HTML, temporal reports, and screenshots. Do not write bash/python
   regex filters to "check for errors" — pattern filters only find errors you
   already predicted, and this project's history includes real failures missed
   exactly that way. If the file is too large for your context, spawn a
   subagent whose only job is to read it fully and summarize.
3. **Live must equal reload.** A transcript rendered from the live SSE stream
   must match the same transcript re-fetched from the server. Client-side
   dedup/filtering that makes live look right is banned — GACT is a generic
   client for many agents, and one agent's semantics on the client breaks the
   others (see commit e442b485 "refactor(web): retire client-side text dedup so
   live == reload", and gact-architecture-contract).
4. **Never `t.Skip` to make a build green** (root CLAUDE.md working rule 1).
   A skip that hides a failure is a lie; a skip gating on unavailable external
   resources (real `claude` CLI) is acceptable but means that surface is
   UNTESTED — say so in your report instead of counting it as green.
5. **Fresh build before believing a regression.** Before treating a "it broke"
   report as real, rebuild the binary you are testing and confirm its revision
   (`gact version` must show current HEAD; `make dev-install` +
   `make verify-dev-install` enforce this on Linux/Git Bash). Stale binaries
   have produced wrong-blame investigations here before (see
   gact-failure-archaeology).

---

## 2. The evidence-bar hierarchy

Ranked weakest → strongest. Each level assumes the ones below it are green.
"Where evidence lands" is where a reviewer can later find the proof.

| # | Level | What it proves | When required |
|---|---|---|---|
| 1 | Unit + golden tests (per Go module; vitest for apps) | Logic and rendered-view text are as coded | Every change; every commit |
| 2 | Conformance suite vs emulator | Wire shapes match contract/SPEC.md on the reference backend | Any wire-visible change (endpoints, SSE, capabilities) |
| 3 | `-race` runs | No data races in concurrent paths | Changes touching goroutines, SSE handling, shared state; before releases |
| 4 | VHS screenshots (emulator- or clio-backed) | The real binary renders correctly in a real terminal | Every change under `tui/` that affects anything visible (CLAUDE.md rule 2) |
| 5 | Real-app driven verification | The product actually works when a human-shaped driver uses it | Closing ANY UI issue; regression reports; release readiness |
| 6 | Live-clio manifest-backed captures (visual_loop) | Behavior against the real agent backend, with receipts proving liveness | Release gates; streaming/observability claims; anything the emulator cannot represent |

### Level 1 — unit + golden tests

PowerShell (this machine — run per module; the repo root is a `go.work`
workspace, not a module, and on Windows use `-p 1` to avoid flaky parallel
builds):

```powershell
cd D:\Libraries\Documents\projects\gact-tui\tui
go test -p 1 -count=1 ./...
cd ..\emulator; go test -count=1 ./...
```

All seven workspace modules at once — the canonical gate is the bash script
(Git Bash; this is what CI mirrors):

```bash
cd /d/Libraries/Documents/projects/gact-tui && bash scripts/release-verify.sh
```

`make test` also exists but has coverage holes — see §3. Apps (from `apps/`,
never the repo root):

```powershell
cd D:\Libraries\Documents\projects\gact-tui\apps
pnpm -r test        # vitest for core/web, node --test smoke for desktop
```

Evidence lands: terminal output only. Quote the final `ok`/summary lines in
your report; do not paraphrase.

### Level 2 — conformance vs emulator

```powershell
cd D:\Libraries\Documents\projects\gact-tui\contract\conformance
go test -count=1 ./...
```

Verified on this machine 2026-07-06: passes in ~16 s. The self-test
(`TestConformance_AgainstEmulator`) builds the emulator on the fly into a temp
dir if `emulator/emulator-server[.exe]` is absent, waits up to 5 s for
`/v1/health`, then runs the full suite. It `t.Skip`s only if both lookup AND
build fail — check the output for `SKIP`, don't assume it ran.

Evidence lands: terminal output. For wire changes, also state which sections
ran vs auto-skipped (capability-gated sections skip silently when the backend
doesn't claim the capability — a "pass" with the section skipped proves
nothing about it).

### Level 3 — race

No CI workflow runs `-race` (verified 2026-07-06 across
`.github/workflows/*.yml`). Race coverage is manual-only:

```bash
# Git Bash; note the module gaps in §3
make test-race
```

or targeted (PowerShell):

```powershell
cd D:\Libraries\Documents\projects\gact-tui\tui
go test -race -p 1 -count=1 ./internal/ui
```

### Level 4 — VHS screenshots

The `tui-screenshot` skill (flat file `.claude/skills/tui-screenshot.md`) is
the canonical recipe. Key facts:

- This machine: plain `vhs` hangs with WinGet's ttyd 1.7.7. Use the wrapper,
  which pins ttyd 1.7.2 and rewrites bash-oriented tapes for cmd:

```powershell
cd D:\Libraries\Documents\projects\gact-tui
.\scripts\vhs-windows.ps1 .\tui\screenshot_clio_e2e.tape -Backend http://127.0.0.1:17800
```

- In tapes use `Wait+Screen /regex/`, never `Wait /regex/` — `Wait` matches
  only the last line, which on a bordered TUI is `╰─╯`, so it times out.
- After rendering, **Read the PNG with the Read tool** and inspect it:
  border corners aligned, colors right, no truncation. Rendering a PNG you
  never looked at is not evidence.

Evidence lands: curated captures go in `screenshots/` and MUST be indexed in
`screenshots/README.md` (see §6). Ad-hoc verification PNGs can live in your
scratch area but must be read and described in the report/PR.

### Level 5 — real-app driven verification (the owner's bar for UI issues)

Drive the actual product, then read what it rendered:

- **TUI**: start a backend (emulator on :7777 or clio on :17800 — see
  gact-run-and-operate), run the freshly built `tui/gact.exe` against it via a
  VHS tape or interactively, and Read the resulting screenshot.
- **Web**: build/serve `@clio/web`, drive it with Playwright or a browser
  tool, and **read the rendered HTML/page text directly** (get_page_text /
  snapshot / saved HTML via the Read tool) — not a grep over it.
- Confirm the binary/bundle is fresh first (doctrine 5).

Playwright visual baseline for web (from `apps/`, expects the emulator on
:7777):

```powershell
cd D:\Libraries\Documents\projects\gact-tui\apps
pnpm --filter @clio/web test:visual
```

Evidence lands: `apps/web/screenshots/` — 20 stable-named PNGs (6 baselines +
14 v0.9.0 additions, list in `apps/CLAUDE.md`) must exist and be refreshed
after any web-UI-touching commit. Replacing a PNG with a fresher render is
expected; renaming or removing one is not.

### Level 6 — live-clio manifest-backed captures

The `visual_loop/` harness (Python + bash; largely Unix-flavored — its PTY
harness `import pty` is Unix-only; prefer WSL/Linux for these). Captures are
gated by owner-consent env vars (e.g. `CLIO_NDP_CAPTURE_OWN_BACKEND=1`) and
write JSON manifests with fields like `captured_from_owned_backend: true` that
the readiness checkers verify — placeholder manifests (`{}`) are rejected.
Never run capture scripts against a backend you don't own: several perform
real mutations by design.

The corpus gate (Python; works on this machine as `python`):

```powershell
cd D:\Libraries\Documents\projects\gact-tui
python visual_loop/check_visual_corpus.py --root .
```

As of 2026-07-06 on this machine this exits 1 (`verdict: FAIL`) because run
outputs under `visual_loop/screenshots/` are untracked/regenerable
(per root CLAUDE.md) and mostly absent from a fresh checkout. That is
expected state, not a regression — but it means you cannot cite "corpus check
passes" as evidence without first regenerating the captures it wants.

The temporal gate — proves LIVE streaming, which screenshots cannot
(a frozen TUI that settles correctly right before the final frame looks fine
in a screenshot):

```bash
python visual_loop/assert_live_observability.py \
  visual_loop/screenshots/live_observability_YYYYMMDD_HHMMSS.jsonl \
  --report visual_loop/screenshots/live_observability_YYYYMMDD_HHMMSS.temporal.md
```

Default `benchmark-hierarchy` mode requires the ordered sequence
route/delegate → child expert active → tool started → tool completed → parent
resumed, with observations leading `message.completed`; `--mode basic-tools`
is a weaker smoke. Read the generated `.temporal.md` with the Read tool.

---

## 3. What green does NOT mean

Every row verified against the repo on 2026-07-06.

| Green signal | What it does NOT prove | Ground truth |
|---|---|---|
| `make test` passed | adapters/claudecode tested | Makefile `test` target lists emulator, tui, contract/conformance, opencode, crush, goose — claudecode is absent |
| `make test-race` passed | adapters/goose race-tested | `test-race` includes claudecode but omits goose |
| `make vet` passed | goose/claudecode vetted | `vet` omits both goose and claudecode |
| CI green | race-clean | No workflow passes `-race`; race testing is manual-only |
| CI conformance green | clio conforms | CI's conformance run is the emulator self-test only. Emulator-green ≠ clio-green: two wire dialects coexist (see gact-architecture-contract / gact-wire-protocol-reference). Point the suite at a real clio to know. |
| python-adapter CI green | real Claude works through the adapter | CI runs only hermetic `tests/test_bridge.py tests/test_endpoints.py`; all `test_smoke_*.py` are `pytest.mark.skipif` when `claude` is not on PATH — and CI has no `claude` |
| adapters/claudecode tests green | the real-Claude smoke ran | `smoke_test.go` skips unless `GACT_REAL_CLAUDE_SMOKE=1` AND `claude` is on PATH. Manual run: `cd adapters/claudecode; $env:GACT_REAL_CLAUDE_SMOKE="1"; go test -p 1 -count=1 -run TestSmoke_RealClaude ./...` |
| `pnpm -r lint` / `pnpm -r typecheck` green | desktop code checked | `@clio/desktop` lint and typecheck are literal `echo … && exit 0` no-ops (it's a Rust crate), and no `cargo test` runs anywhere in CI. The `apps/desktop/sidecar-launcher` Go module is outside go.work: CI cross-compiles it (via `fetch-sidecar.sh` inside Tauri builds) but its `main_test.go` never runs in any workflow |
| apps CI green | native WebView E2E ran | `native-webview-proof` (real Tauri WebView, `test:webview`) is `workflow_dispatch`-only |
| "CI is green on this PR" | CI ran at all | ci.yml `paths-ignore` skips ALL CI for changes matching `**.md`, `**.png`, `**.gif`, `screenshots/**`, `docs/**` — a PR renaming a tape referenced from docs gets zero validation |
| Release/docker workflows succeeded | anything was tested | release.yml, docker.yml, desktop-release.yml run zero tests; the pre-release gate is a human running `scripts/release-verify.sh` + the `release` skill checklist |
| Everything above green | visual/live behavior correct | No visual_loop check, VHS render, or manifest gate runs in any CI workflow |

Rule of thumb: when reporting status, enumerate what was SKIPPED, not just
what passed. A green run with silent skips is the most dangerous artifact in
this repo.

---

## 4. Golden inventory and refresh discipline

### Inventory (as of 2026-07-06)

- `tui/internal/ui/testdata/` — 9 view goldens:
  `TestView_{ConnectingStage,ErrorStage,HelpOverlay,PaletteFiltered,PaletteOpen,PermissionBanner,ReadyEmpty,ReadyWithSessions,StreamingConversation}.golden`,
  plus `earthscope-la.wire.sse` (a captured real-wire SSE replay fixture).
- teatest-style goldens (raw ANSI, created via `-update`) follow the pattern
  in the `tui-test` skill (`.claude/skills/tui-test.md`); the live E2E in
  `tui/internal/ui/e2e_test.go` drives the real app against a freshly built
  emulator binary (built into `.tools/test-bin/`) rather than using goldens.

### Refresh

The view goldens use a custom flag defined in
`tui/internal/ui/app_view_test.go`: `-update-views` (NOT `-update`).

```powershell
cd D:\Libraries\Documents\projects\gact-tui\tui
go test -p 1 -count=1 -run 'TestView_' ./internal/ui -update-views
# then re-run WITHOUT the flag to confirm the refreshed goldens pass:
go test -p 1 -count=1 -run 'TestView_' ./internal/ui
```

### Discipline

1. **Never hand-edit a golden.** Regenerate, then Read the git diff of the
   golden file and confirm every changed line is an intended consequence of
   your change. An unexplained golden diff is a finding, not noise.
2. **Determinism pins.** View goldens are already normalized in-test: CRLF →
   LF, per-line trailing-whitespace trim, and `stripVolatile` masks
   `HH:MM:SSZ` clocks. teatest goldens are raw ANSI and only deterministic
   with a pinned color profile and TERM
   (`tea.WithColorProfile(colorprofile.ANSI256)`,
   `tea.WithEnvironment(...TERM=xterm-256color)`) — see the `tui-test` skill.
3. **Style-change isolation.** Because teatest goldens embed ANSI styling, a
   single lipgloss color tweak invalidates every golden that renders the
   style. Keep style/theme changes in their own PR so the golden churn is
   reviewable as exactly that.
4. A golden refresh in the same commit as a logic change must be called out
   in the commit body ("goldens refreshed because X now renders Y").

---

## 5. The conformance suite

Location: `contract/conformance` (stdlib-only module — no external deps, so
adapter authors can adopt it without inheriting the TUI dep graph). Files:
`conformance.go` (Options + Run), `core_checks.go`, `catalog_checks.go`,
`mutation_checks.go`, `sse_checks.go`, `drift_checks.go`, `v0_2.go`,
`reporter.go`, `client.go`, `README.md` (section tables).

### Rules that make it meaningful

- **Every section is ON by default.** `Options.Skip*` flags are explicit
  opt-outs so a backend never "passes" by accident.
- **The 501 rule: 501 from an un-skipped section is a FAILURE.** Silently
  tolerating 501 would defeat the suite. If a backend genuinely doesn't
  implement a section, skip it explicitly via Options — that decision then
  appears in code review.
- **Capability gating.** Cap-gated sections (Hooks, Policies, Tasks, Mcp,
  Providers, Files, Diffs, Messages_Search, the v0.2 suites, …) auto-skip
  when the backend's `/v1/capabilities` says false. Lying capabilities are
  themselves caught by `Drift_CapabilityTruth` (advertised single-route
  capabilities must actually have their route; probed via 404/501
  distinction).

### WARNING — drift checks MUTATE the session

The CLIO-232 drift-class checks (SPEC §15.8) run last:
`Drift_CapabilityTruth`, `Drift_SSEReplayAndShapes`, `Drift_CompactFocus`,
`Drift_RollbackEnvelope`. The SSE/compact/rollback ones mutate state — the
rollback check **deletes the newest message** and the compact check
**rewrites the ledger** (plus a title PATCH in the SSE drift check).
`Run()` gates the mutating ones on `suiteOwnsSession := sid != "" &&
opts.SessionID == ""` (conformance.go:306) — they only run against a session
the suite created itself. Consequences:

- Never point the full suite at a backend whose sessions you care about; the
  suite will happily create sessions and post messages on any backend.
- If you pass `Options.SessionID` (a pinned real session), the mutating drift
  checks silently DON'T run — so a "pass" on a pinned session proves nothing
  about rollback/compact envelopes.

### Running it against an arbitrary backend

There is no CLI runner or URL env var (verified 2026-07-06); you drive it
from a Go test via `conformance.Run(conformance.FromTest(t), baseURL,
Options{})`. Minimal harness against a live backend:

```go
// somewhere_test.go in any module that imports the suite
func TestLiveClioConformance(t *testing.T) {
    conformance.Run(conformance.FromTest(t), "http://127.0.0.1:17800",
        conformance.Options{
            // pin nothing: let the suite create its own session so the
            // drift checks run — ONLY against a backend you own.
        })
}
```

Sections use `t.Run`, so `-run 'TestLiveClioConformance/SSE'` re-runs one
section.

### Adding a section (spec-first — see gact-change-control)

1. Land the wire behavior in `contract/SPEC.md` first (CLAUDE.md rule 5).
2. Add a `SkipX bool` flag to `Options` in `conformance.go` with a comment
   naming the SPEC section and what the check locks.
3. Implement `checkX(t Reporter, c *conformClient, ...)` in the matching
   `*_checks.go` file (shape assertions only — semantics are the backend's
   job). If capability-gated, wire it inside the `fetchCapabilities` block in
   `Run()`; otherwise add it in section order.
4. Add the row to the tables in `contract/conformance/README.md`.
5. Run the emulator self-test; if the emulator doesn't implement the new
   section yet, that is emulator work to do — not a reason to soften the
   check (no silent fallback).

---

## 6. Visual acceptance

### screenshots/ index discipline

`screenshots/README.md` is the curated index: every entry there is a real
clio turn through the gact-tui binary against live clio (port 17800 in this
repo's dev setup) — no emulator stubs. Each row maps PNG → what it proves →
driver tape (`tui/screenshot_clio_*.tape`). **UI-touching work must add or
refresh an entry** (root CLAUDE.md rule 2). Adding a PNG without an index row
is incomplete work.

Re-record flow (bash, from README):

```bash
cd clio-agent && uv run --extra api clio-agent-gact --port 17800 &
curl -X PUT http://127.0.0.1:17800/v1/providers/lm -d '{...}'   # configure an LM
cd ../gact-tui/tui && go build -o gact . && cd ..
PATH="$PWD/tui:$PATH" GACT_BACKEND=http://127.0.0.1:17800 vhs tui/screenshot_clio_e2e.tape
```

This machine: use `.\scripts\vhs-windows.ps1 <tape> -Backend
http://127.0.0.1:17800` instead of bare `vhs` (§2 level 4).

Tape inventory as of 2026-07-06: 100 tapes under `tui/*.tape`, 177 under
`visual_loop/tapes/`. `make screenshots` (Git Bash) renders every tui/ tape
against `http://localhost:7777` by default.

### visual_loop corpus and manifests

- `visual_loop/COVERAGE.md` — maintained tape/screenshot inventory; update it
  when adding/renaming/retiring visual-loop tapes.
- `visual_loop/MISSING_CAPTURES.md` — generated backlog; refresh with
  `python visual_loop/check_visual_corpus.py --root . --write-deferred-report visual_loop/MISSING_CAPTURES.md`
  (the corpus check fails if it's stale relative to COVERAGE.md).
- Strict gates for release evidence:
  `--require-git-tracked` (required non-GIF artifacts must be committed) and
  `--require-strict-live-pass` (≥1 strict live-observability report with
  `verdict: PASS`).
- The corpus check is a filesystem-health gate, NOT image diffing. It never
  replaces reading the screenshots.

### RENDERING_SPEC comparison for transcript changes

Any change to conversation-transcript rendering — on web, desktop, OR TUI —
must be checked against `apps/web/RENDERING_SPEC.md` (the rules) and
`apps/web/CANONICAL-CONVERSATION.md` (the entire approved EarthScope run
rendered out, grounded in the real wire). Render the same conversation and
compare against the canonical doc by reading both. See
gact-web-rendering-reference for the renderer architecture.

---

## 7. How to add tests, per layer

Placement rule for all TUI tests: the `tui/internal/ui` package split is
pending (iowarp/gact-tui#234) — new tests go next to the seam-named file
cluster they exercise (e.g. `catalog_browser_*`, `conversation_*`,
`command_palette_*`), never into an unrelated god file (no-accretion rule,
iowarp/gact-tui#237).

### 7a. Golden view test (Go, tui/internal/ui)

The helpers already exist in `app_view_test.go` (`assertGolden`,
`renderAtSize`, `stripVolatile`). Minimal new test:

```go
func TestView_MyNewState(t *testing.T) {
    a := New("http://test.local")
    // ...put the App into the state under test (set fields / feed msgs)...
    got := stripVolatile(renderAtSize(a, 80, 24))
    assertGolden(t, got)
}
```

First run with `-update-views` to create
`testdata/TestView_MyNewState.golden`, Read the golden to confirm it renders
what you intended, commit it, then run without the flag.

### 7b. teatest E2E (Go, real program loop)

Follow `tui/internal/ui/e2e_test.go`: build the emulator to a stable path
(`.tools/test-bin/` — a stable path avoids repeated Windows-firewall prompts
on this machine), start it on a free port, then:

```go
tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(140, 40))
// drive: tm.Type("..."); tm.Send(tea.KeyPressMsg{...})
teatest.WaitFor(t, tm.Output(),
    func(b []byte) bool { return strings.Contains(string(b), "expected text") },
    teatest.WithDuration(10*time.Second),
    teatest.WithCheckInterval(40*time.Millisecond))
_, _ = io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(3*time.Second)))
```

Never `time.Sleep` to wait for UI state — always `teatest.WaitFor`. Full
scaffolding discipline (color-profile pinning, golden creation via `-update`)
is in the `tui-test` skill; component idioms in gact-bubbletea-reference.

### 7c. Conformance section

See §5 "Adding a section". The skeleton of a check:

```go
// core_checks.go (or the *_checks.go file matching the endpoint family).
// Pattern copied from checkHealth: c.get / c.postJSON return
// (*http.Response, []byte, error); decode the body yourself.
func checkMyEndpoint(t Reporter, c *conformClient) {
    ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
    defer cancel()
    resp, body, err := c.get(ctx, "/v1/my_endpoint")
    if err != nil {
        t.Fatalf("GET /v1/my_endpoint: %v", err)
    }
    if resp.StatusCode != 200 {
        t.Fatalf("GET /v1/my_endpoint: status %d body %s", resp.StatusCode, body)
    }
    var got struct {
        Items []struct{ ID string `json:"id"` } `json:"items"`
    }
    if err := json.Unmarshal(body, &got); err != nil {
        t.Fatalf("my_endpoint JSON decode: %v (body=%s)", err, body)
    }
    if got.Items == nil {
        t.Errorf("items must be non-nil (empty array, not null)")
    }
}
```

Shape-only assertions — semantics belong to the backend under test.

### 7d. vitest (apps/core, apps/web)

Unit tests live in `apps/core/tests/*.test.ts` and web-side `*.test.*` files;
Playwright visual specs in `apps/web/tests/visual/*.spec.ts`.

```powershell
cd D:\Libraries\Documents\projects\gact-tui\apps
pnpm --filter @clio/core test          # vitest run
pnpm --filter @clio/web  test:visual   # Playwright; emulator on :7777 first
```

Minimal vitest test (`apps/core/tests/my_thing.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { myThing } from "../src/my_thing";

describe("myThing", () => {
  it("does the documented thing", () => {
    expect(myThing("in")).toBe("out");
  });
});
```

Keep fixtures wire-grounded: prefer captured real payloads (like
`earthscope-la.wire.sse` on the TUI side) over hand-invented shapes.

---

## 8. Acceptance thresholds (the bar for "done")

A change is acceptable only when ALL of the following hold:

1. **All tests pass — including the ones make forgets.** Run
   `scripts/release-verify.sh` (Git Bash) or the per-module loop over all
   seven go.work modules; `make test` alone is insufficient (§3). No new
   `t.Skip`/`it.skip` was added to get there.
2. **Capability matrix has no unexplained non-full rows.**
   `docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md` maps every decoded capability flag
   to a support class (`full`/`partial`/`gated`/`none`); every row not `full`
   must name a proof path, issue, or explicit non-goal. This is
   test-enforced: `TestDoctorCapabilityRowsCoverDecodedCapabilityFlags`
   (tui/internal/ui/doctor_capability_rows_test.go) forces every decoded flag
   to have a classified row, and
   `TestCapabilityMatrixDocNonFullRowsCarryDisposition`
   (tui/internal/ui/doctor_capability_matrix_test.go) forces dispositions on
   non-full rows. Both verified passing on this machine 2026-07-06. This is
   the enforcement edge of the project's core thesis — capability-honest
   clients on every surface (see gact-interface-parity-campaign).
3. **UI change ⇒ fresh screenshot, read and indexed.** TUI: rendered via
   VHS, inspected via the Read tool, indexed in `screenshots/README.md` if
   curated. Web: the stable-named PNGs under `apps/web/screenshots/`
   refreshed via `test:visual`.
4. **Skips enumerated.** The report states explicitly which suites were
   skipped/not-run (real-claude smokes, race, live-clio conformance,
   visual_loop gates) rather than implying total coverage.
5. **Wire-visible change ⇒ SPEC + conformance updated first** (root CLAUDE.md
   rule 5; commit 59d136d2 "docs(contract): reconcile SPEC.md to clio
   reality; conformance asserts the drift classes" is the pattern to follow).

---

## Provenance and maintenance

Facts here were verified against the repo on 2026-07-06. Re-verify before
relying on the volatile ones:

| Claim | Re-verify with |
|---|---|
| `make test`/`test-race`/`vet` module gaps | Read `Makefile` lines 44–65 |
| CI has no `-race`, paths-ignore list, python hermetic subset | Read `.github/workflows/ci.yml` |
| Desktop lint/typecheck are echo no-ops | Read `apps/desktop/package.json` scripts |
| Conformance section list, 501 rule | Read `contract/conformance/README.md` |
| Drift-check mutation + `suiteOwnsSession` gate | Read `contract/conformance/conformance.go` (Run tail, ~line 300) |
| `-update-views` flag name | `grep -n "update-views" tui/internal/ui/app_view_test.go` |
| Golden inventory (9 view goldens + wire fixture) | `ls tui/internal/ui/testdata/` |
| Tape counts (100 tui/, 177 visual_loop/) | `(Get-ChildItem tui\*.tape).Count`; `(Get-ChildItem visual_loop\tapes\*.tape).Count` |
| Conformance self-test passes locally | `cd contract\conformance; go test -count=1 ./...` |
| Matrix enforcement tests pass | `cd tui; go test -p 1 -count=1 -run 'TestDoctorCapabilityRowsCoverDecodedCapabilityFlags\|TestCapabilityMatrixDocNonFullRowsCarryDisposition' ./internal/ui` |
| Corpus check exits 1 on fresh checkout | `python visual_loop/check_visual_corpus.py --root .; $LASTEXITCODE` |
| GACT_REAL_CLAUDE_SMOKE gate | `grep -n GACT_REAL_CLAUDE_SMOKE adapters/claudecode/smoke_test.go` |
| Python smoke skipif | Read `adapters/claude-agent-sdk-server/tests/test_smoke.py` header |
| ttyd pin 1.7.2 in Windows VHS wrapper | Read `scripts/vhs-windows.ps1` |
| Web screenshot filename list (20 PNGs) | Read `apps/CLAUDE.md` "Visual proof requirements" |
| Cited commits | `git log --oneline -1 e442b485` ; `git log --oneline -1 59d136d2` |
