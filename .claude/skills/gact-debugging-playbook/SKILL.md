---
name: gact-debugging-playbook
description: >
  Load this when something in gact-tui is broken, "looks wrong", regressed, or behaves
  differently across backends/surfaces and you need to find out why. Triggers: a UI
  regression report; an SSE event that "does nothing"; works-on-emulator-breaks-on-clio
  (or vice versa); _UnsupportedSessionAgent in a live gate; VHS hanging on Windows;
  golden tests failing en masse; make test green but CI red; a clio source edit that has
  no effect; the wrong backend answering; the emulator ignoring --scenario; blueprint MCP
  "Connection closed"; a config.json value a flag refuses to override. Start here BEFORE
  proposing a fix, opening a backend issue, or reverting anything.
---

# GACT Debugging Playbook

Symptom → likely cause → discriminating experiment → fix, for this repo's known failure
modes. Every row cites the incident that put it here. Repo root on this machine:
`D:\Libraries\Documents\projects\gact-tui`. PowerShell is the primary shell; `make`
targets run in Git Bash.

---

## Rule zero: READ the evidence

This is the owner's standing doctrine, and its violation is one of the two costliest
recurring failure modes in this project's history (the other is acting on stale builds).

1. **Use the Read tool to actually read the log file, the rendered HTML artifact, or the
   screenshot.** Do not reach for bash/python/regex pattern-matching as the first move.
   Pattern filters only detect errors you already know about — *"it is hard to build
   filtering to detect errors or changes when you do not know those errors or changes."*
   Unknown failures slip straight through a grep.
2. **Grep only AFTER you know the signature.** Once reading the evidence has shown you the
   exact error string, grep/count to measure its extent. Never the other way around.
3. **If the file is too big for your context, send a subagent to Read it and summarize.**
   Do not substitute a keyword filter for a reading.
4. **For transcript-rendering work, green tests and grep counts are not proof.** The
   repo's own doctrine (root `TODO.md`, evidence section): "Do not treat grep/count
   summaries as sufficient proof for transcript rendering fixes; read the rendered HTML
   artifact and compare visually against `apps/web/RENDERING_SPEC.md` and
   `apps/web/CANONICAL-CONVERSATION.md`."

Where the evidence lives (as of 2026-07-06):

| Evidence | Location |
|---|---|
| clio backend logs (owned dev instance) | wherever you redirected them at launch, e.g. `<evid>/clio.out.log`, `<evid>/clio.err.log` (see `.claude/skills/clio-web-deploy.md`) |
| clio stage-by-stage stream audit | `CLIO_STREAM_AUDIT_LOG` / `CLIO_SSE_EVENT_LOG` files (must be set at clio launch) |
| Rendered web HTML | `apps/web/screenshots/**/*.html` artifacts written by the drive scripts in `apps/web/scripts/` |
| TUI rendered frames | `visual_loop/tui_audit_*/b_tui_rendered.txt`, `b_tui_frames.jsonl` (untracked run outputs) |
| Curated screenshots | `screenshots/` (index: `screenshots/README.md`), `apps/web/screenshots/` |
| Raw SSE off any backend | `curl.exe -N -H "Accept: text/event-stream" http://127.0.0.1:<port>/v1/events` |

---

## Quick triage index

| # | Symptom | First suspect |
|---|---|---|
| 1 | UI regression reported, but the code looks right | **Stale build** — rebuild + hard reload before touching git |
| 2 | `_UnsupportedSessionAgent` in a live gate | **Harness misconfiguration** — never backend/model blame |
| 3 | SSE handler compiles and runs but silently does nothing | Payload envelope nesting (`payload.payload`) |
| 4 | Works against emulator, breaks against clio (or vice versa) | Two-dialect wire problem |
| 5 | VHS hangs on Windows | ttyd 1.7.7; or `Wait` without `+Screen` |
| 6 | Golden tests explode en masse | Raw-ANSI goldens + a style change; or TERM/color-profile drift |
| 7 | `make test` green but CI red | Makefile module-coverage gaps + gofmt gate |
| 8 | clio source edit has no effect | Editable install — restart the clio process |
| 9 | Wrong backend answered / connected to the wrong thing | Port confusion + config layering |
| 10 | Emulator ignores `--scenario` | Flag is reserved; behavior = boolean flags + keyword routing |
| 11 | Blueprint MCP "Connection closed" / "Cannot find home" | uvx cache (this-machine) |
| 12 | Suspecting the ALCF token | Don't — a keeper process maintains it (this-machine) |
| 13 | `--backend` (or another flag) can't force a value over config.json | `config.Resolve` default-equals-unset trap |
| 14 | Conforming backend's events silently dropped by the TUI | Strict SSE line-prefix parser |
| 15 | Execution timeline vanished for a session | Ledger prune rules — only two legal prune paths |

Before deep-diving any known symptom, also check ["is it already fixed?"](#before-debugging-is-it-already-fixed) below.

---

## 1. UI regression reported but the code looks right → STALE BUILD

**Symptom.** Someone (or a screenshot) reports a UI regression — missing dots, wrong
boxes, old fonts — but reading the code shows the feature intact.

**Likely cause.** The report was generated from a stale binary or a cached web bundle,
not from HEAD.

**The incident.** `3fb9ba24 revert(web): undo d186ac97 render rewrite — restore canonical
presentation` (2026-07-01 05:53) wholesale-reverted a full day of presentation work
chasing a "handoff box / no dots" report. Eighty minutes later `ad8a9e79 revert: restore
d186ac97 presentation work (undo mistaken 3fb9ba24)` undid it: the report "was almost
certainly a stale-build cache artifact (same as the search-render cache issue)". Two
stale-cache incidents are named in that commit body. The reverted work (`d186ac97
fix(web): extract renders in the flow (streaming), not folded onto the return`) is what
ships today.

**The rule (owner-confirmed).** Verify every regression report against a fresh build
BEFORE reverting or "fixing" anything. A revert is a destructive act; a rebuild is free.

**Discriminating experiment — TUI** (Git Bash; `make` stamps the revision, a bare
`go build` does not):

```sh
cd /d/Libraries/Documents/projects/gact-tui
make build-tui
./tui/gact version          # prints "revision: <hash>"
git rev-parse --short=12 HEAD
```

If the revision line (plus a `-dirty` suffix when the tree is dirty) does not match
HEAD, everything observed so far was observed on the wrong binary. If you installed via
`make dev-install`, run `make verify-dev-install` — it fails unless both the shell
`gact` and clio's launcher `gact` symlinks resolve to this checkout at current HEAD.

**Discriminating experiment — web** (Git Bash or PowerShell):

```sh
cd /d/Libraries/Documents/projects/gact-tui/apps
pnpm --filter @clio/web build      # tsc + vite build — fresh bundle
pnpm --filter @clio/web preview    # serves :4173; run in background
```

Then **hard-reload the browser** (Ctrl+Shift+R, or a fresh Playwright context). A plain
reload can serve the cached bundle — that is exactly the artifact class that caused
3fb9ba24. Only if the symptom reproduces on a verified-fresh build does it become a real
regression; then fix it *surgically* (ad8a9e79's word), not by wholesale revert.

---

## 2. `_UnsupportedSessionAgent` in a live gate → harness misconfiguration FIRST

**Symptom.** A live EarthScope/NDP gate fails with `_UnsupportedSessionAgent` (a child
expert requested tools not present in the session's composed tool set).

**Likely cause.** YOUR harness, not the backend, not NDP, not the model.

**The incident.** `iowarp/clio-agent#689` was opened from exactly this evidence and
retracted as a gact-tui harness/configuration mistake
(`docs/handoff-2026-06-17-web-desktop-polish.md`, "Correction" section). The standing
order there: "Do not open another backend issue for this symptom unless the same exact
known-good command line fails outside the UI."

**Checklist** (from `docs/agent-operational-memory.md` — work it top to bottom before
any other hypothesis):

- [ ] Wrong **workspace binding** — is the session created against the prepared,
      known-good workspace? (The #689 recovery proved a *freshly created* workspace on a
      running backend is NOT equivalent to the prepared one.)
- [ ] Wrong **blueprint install scope** — is the marketplace blueprint installed/bound in
      the owned backend's active config/discovery scope?
- [ ] Wrong **cwd** at backend launch.
- [ ] Missing **MCP tool composition** for the child experts.
- [ ] Accidentally resolving a **repo-local `.clio` override** — an untracked `.clio/`
      directory at this repo's root exists and can hijack blueprint resolution; the ops
      memory calls a repo-local relative-path override "a test harness smell".

**Non-proof.** `/v1/tools` and `/v1/mcp/handshake` are NOT proof that child-expert tools
are composed. The handshake is only a readiness probe; it does not wire tools into the
per-session expert executor. Useful proof is a real workspace-bound session with the
active blueprint starting the declared MCP servers and child experts calling the
expected prefixed tools.

Also from the same ops memory: never kill or repurpose the shared developer CLIO runtime
at `127.0.0.1:17960` — validate on an owned backend, owned port, isolated state dirs.

---

## 3. SSE handler silently does nothing → payload envelope nesting

**Symptom.** You added or edited an SSE event handler; it compiles, the event arrives
(visible in a wire capture), and nothing happens. No error anywhere.

**Likely cause.** You read `e.Payload["field"]` directly. The SSE `data:` line is an
envelope — a JSON object `{type, occurred_at, payload}` — so the event's actual fields
live one level down.

**Ground truth** — `tui/internal/ui/live_events.go` (the doc comment at the top of
`applySSE` says it verbatim): "handlers must read `e.Payload["payload"][...]`", and the
switch does exactly that:

```go
pl, _ := e.Payload["payload"].(map[string]any)
```

**Discriminating experiment.** In your handler, log/inspect `e.Payload` keys. If you see
exactly `type`, `occurred_at`, `payload`, you are one level too high. Getting this wrong
compiles fine and no-ops silently — a type assertion on a missing key just yields the
zero value.

**Fix.** Unwrap once (`pl, _ := e.Payload["payload"].(map[string]any)`) and read fields
from `pl`. Follow the existing handlers in `live_events.go` — new UI code goes into the
existing seam-named file clusters, not new files (cleanup-program ground rule; see
gact-change-control).

---

## 4. Works against emulator, breaks against clio (or vice versa) → the two-dialect problem

**Symptom.** A streaming feature behaves on one backend and not the other — thinking
text doesn't stream, deltas are dropped, turn attribution is wrong.

**Likely cause.** The emulator and clio speak observably different dialects of the same
contract. Both are documented in `contract/SPEC.md`; a client that only handles one
dialect breaks on the other.

Verified drift points (as of 2026-07-06):

| Axis | Emulator | clio (per `contract/SPEC.md`) |
|---|---|---|
| Thinking-part delta key | `thinking_append` (`emulator/internal/scenario/scenario.go` `streamText`: `key = "thinking_append"` when field is thinking) | `text_append` — SPEC §7.5: "clio streams thinking parts with `text_append`, NOT `thinking_append`"; `thinking_append` and `input_json_append` are "never emitted by" clio |
| `message.part.delta` payload | `{message_id, part_id, delta}` only (see `streamText` in scenario.go) | `{turn_id, message_id, part_id, stream_source, signature_field_name, delta}` (SPEC event table) |
| `message.part.completed` | emitted by `completePart` | carries **authoritative `final_text`** — clients MUST replace buffered deltas with it; a streamed part whose text cleans to empty never gets `part.completed` |

The TUI deliberately handles BOTH delta keys (`tui/internal/ui/live_message_parts.go`
checks `thinking_append`; `tui/cli_stream.go` likewise). Follow that pattern.

**Discriminating experiment.** Capture the raw wire from each backend and diff the
shapes — do not reason from memory:

```powershell
# Emulator (start it first: Git Bash, `make run-emulator`, port 7777)
curl.exe -N -H "Accept: text/event-stream" http://127.0.0.1:7777/v1/sessions/<SID>/events
# clio (owned dev instance)
curl.exe -N -H "Accept: text/event-stream" http://127.0.0.1:17801/v1/sessions/<SID>/events
```

Read the two captures (Rule zero) and compare the delta payloads for the failing event
type. On the clio side you can also set `CLIO_SSE_EVENT_LOG` at launch for a persistent
capture.

**Fix routing.** If the difference is wire-visible and not yet in `contract/SPEC.md`,
this is a spec-first change: SPEC + conformance suite first, then emulator/adapters/
clients (project rule 5; see gact-wire-protocol-reference for the dialect catalog and
gact-change-control for gating). Do NOT paper over a dialect gap with a client-side
semantic filter — GACT is a generic interface to many agents, and imposing one agent's
semantics on the client breaks the others (owner doctrine; the dedup saga below).

**Related trap (server-first sequencing).** `e442b485 refactor(web): retire client-side
text dedup so live == reload` removed `dedupeRepeatedText` because it encoded one
backend's (misread) semantics client-side, could drop real content, and made live
diverge from reload. Never reintroduce client-side dedup/filtering that belongs on the
server; genuine double-emits get fixed at the source (the e442b485 commit body points at
the upstream backend issue "#736" — clio-agent's tracker, not this repo's).

---

## 5. VHS hangs on Windows → ttyd 1.7.7 / missing `+Screen`

**Symptom.** `vhs some.tape` on this Windows machine never finishes, or a `Wait` times
out on a TUI that is visibly showing the expected text.

**Two distinct causes:**

1. **ttyd 1.7.7 (the WinGet package) is incompatible with VHS v0.10** — that ttyd
   frontend initializes xterm's DOM renderer while VHS waits for canvas layers, so VHS
   hangs (`screenshots/README.md`, "Windows VHS"). Fix: run tapes through the pinned
   wrapper, which downloads and pins ttyd **1.7.2** into `.tools\vhs-windows\`:

   ```powershell
   cd D:\Libraries\Documents\projects\gact-tui
   .\scripts\vhs-windows.ps1 .\tui\<name>.tape -Backend http://127.0.0.1:7777
   ```

   The wrapper also rewrites bash-authored tapes for Windows at runtime: `Set Shell
   "bash"` → `cmd`, `/tmp/gact` → `gact`, `VAR=x cmd` Type-lines → chained `set`
   commands, and substitutes `$GACT_BACKEND`. Never run bare `vhs` on this machine.

2. **`Wait /regex/` only matches the LAST line of the screen.** A bordered TUI's last
   line is `╰────╯`, so a plain `Wait` times out even when the text is on screen. Use
   `Wait+Screen /regex/` (matches anywhere on screen). `.claude/skills/tui-screenshot.md`:
   "this has burned us before"; existing tapes (`tui/screenshot.tape`,
   `tui/rework_rename.tape`, ...) all use `Wait+Screen`.

**Also know:** tapes hardcode their backend port in the typed command (e.g.
`tui/canonical_render.tape` types `GACT_BACKEND=http://127.0.0.1:7811 ./gact`), so
`make screenshots PORT=...` does NOT retarget them — the tape's own port must have an
emulator listening. And VHS's default `Wait` timeout is 15s; use `Wait+Screen@30s` for
slow paths (`notes/pitfalls.md`).

---

## 6. Golden tests explode en masse → raw-ANSI goldens + style change

**Symptom.** Dozens/hundreds of golden-file tests fail at once after a seemingly small
change.

**Likely causes, in order:**

1. **You changed a shared style.** Goldens under `tui/internal/ui/testdata/` are raw
   ANSI — any lipgloss color/border/padding tweak changes escape sequences in every
   golden that renders through it. This is expected, not a catastrophe. Isolate styling
   changes into their own PR (`.claude/skills/tui-test.md` gotcha), eyeball a
   representative diff (Rule zero — read the golden diff, don't just count failures),
   then regenerate: `go test ./... -update` from `tui/` and commit the goldens.
2. **Environment drift, not your change.** Tests that don't pin the terminal render
   differently per machine. The determinism checklist (`notes/testing.md`): fixed
   `WithWindowSize`, `tea.WithColorProfile(colorprofile.ANSI256)`,
   `tea.WithEnvironment([]string{"TERM=xterm-256color"})`, buffer-backed input/output.
   If failures reproduce only on one machine/CI and the goldens weren't touched, suspect
   an unpinned test, and fix the pinning — never the golden.

**Discriminating experiment.** Read one failing golden diff. Pure escape-code churn
around unchanged text = style change (case 1). Different content/layout = real
regression. Same test passing locally and failing in CI = pinning (case 2).

Never `t.Skip` to get green (project working rule 1). Golden tests do not catch color
accuracy, fonts, or timing — for those, finish with a real screenshot (tui-screenshot
skill; see gact-validation-and-qa for the evidence bar).

---

## 7. `make test` green but CI red → Makefile module-coverage gaps

**Symptom.** Local `make test` passes; the `CI` workflow fails on the same commit.

**Likely cause.** `make test` does not cover everything CI covers. Verified against the
Makefile and `.github/workflows/ci.yml` as of 2026-07-06:

| Gate | Covers | Misses |
|---|---|---|
| `make test` | emulator, tui, contract/conformance, adapters/{opencode,crush,goose} | **adapters/claudecode** |
| `make test-race` | ... adapters/{opencode,crush,claudecode} | **adapters/goose** |
| `make vet` | emulator, tui, contract/conformance, adapters/{opencode,crush} | **adapters/{goose,claudecode}** |
| CI `build-test` job | **every** module listed in `go.work` (it greps `go.work` for the list): all seven, vet + build + test `-count=1` | — |
| CI `gofmt` step | all tracked `*.go` files — unformatted code fails CI even though `make test` never checks formatting | — |

So the two classic local-green/CI-red causes are: (a) a break in `adapters/claudecode`
(invisible to `make test`), and (b) unformatted code (`make fmt` fixes; CI only checks).

**Discriminating experiment** (Git Bash — mirrors CI exactly):

```sh
cd /d/Libraries/Documents/projects/gact-tui
gofmt -l $(git ls-files '*.go')          # any output = CI gofmt gate fails
for m in $(grep -oE '\./[^ ]+' go.work); do
  (cd "$m" && go vet ./... && go build ./... && go test ./... -count=1) || echo "FAIL: $m"
done
```

Also note: `go test ./...` from the repo ROOT does not span the workspace members (the
root is a `go.work` workspace, not a module) — always per-module or via make/the loop
above. And CI skips entirely on doc/media-only changes (`paths-ignore` for `**.md`,
`**.png`, `**.gif`, `screenshots/**`, `docs/**`), so "CI passed" on a docs commit proves
nothing about code. The full mirror of the release gate is
`bash scripts/release-verify.sh`.

---

## 8. clio source edit has no effect → restart the process

**Symptom.** You edited clio-agent source (external repo,
`D:\Libraries\Documents\projects\clio-agent` on this machine) and the running backend's
behavior is unchanged.

**Cause.** clio is an editable uv install; the running process imported the old modules
at startup. `.claude/skills/clio-web-deploy.md` states it twice: "After ANY clio source
edit → restart clio (editable install loads at import time)."

**Fix.** Restart the clio process (teardown per `.claude/skills/cleanup-after-run.md`,
bring-up per `.claude/skills/clio-web-deploy.md` or gact-run-and-operate), then poll
`http://127.0.0.1:17801/v1/health` until `"overall_status": "ready"` (agent build takes
~20–40s). Then hard-reload any connected web page to re-establish SSE.

**Discriminating experiment.** If you suspect you're testing a stale process: check the
process start time against your edit time:

```powershell
Get-CimInstance Win32_Process -Filter "Name like '%clio-agent-gact%'" |
  Select-Object ProcessId, CreationDate, CommandLine
```

---

## 9. Wrong backend answered → port confusion + config layering

**Symptom.** The TUI/web/CLI talks to something, but not the backend you meant — stale
sessions appear, your test backend sees no traffic, an emulator answers a clio question.

**The port map (this-machine conventions, as of 2026-07-06):**

| Port | What | Notes |
|---|---|---|
| 7777 | emulator default (`make run-emulator`) | TUI's built-in default backend is `http://localhost:7777` |
| 7811 (and others) | hardcoded inside individual VHS tapes | see row 5 |
| 4173 | web `pnpm --filter @clio/web preview` | point at clio via `?backend=http://127.0.0.1:17801` |
| 17800 | conventional clio (`clio start`, desktop sidecar, docker, web splash auto-probe default `PURE_WEB_DEFAULT_BACKEND`) | |
| 17801 | instrumented from-source dev clio (all live-run skills) | |
| 17960 | shared developer CLIO runtime | **never kill or repurpose** (`docs/agent-operational-memory.md`) |

**The layering.** Backend resolution everywhere in the TUI (interactive AND all CLI
subcommands, via `resolveCLIBackend` in `tui/cli_backend.go`, since `5be7b74a fix: honor
config.json backend_url in CLI subcommands (#230) (#243)`):

```
built-in default (http://localhost:7777)  <  config.json backend_url  <  GACT_BACKEND env  <  --backend flag
```

Config file discovery: `$GACT_CONFIG` exact path, else `$XDG_CONFIG_HOME/gact/config.json`,
else `~/.config/gact/config.json`. An unreadable config file warns to stderr with
`reason=config_load_error` — read your stderr.

**Discriminating experiment.**

```powershell
# Who is actually listening where?
Get-NetTCPConnection -LocalPort 17801,17800,7777 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
# Identify the owner
Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object CommandLine
# What does each answer as?
curl.exe -s http://127.0.0.1:17801/v1/health
```

Then check which layer won: is `GACT_BACKEND` set in this shell? What does
`~/.config/gact/config.json` say? Was `--backend` passed? (And see row 13 for the trap
where the flag CANNOT win.) In the web app, the `?backend=` query param decides; without
it the splash auto-probes 17800 — a clio on 17801 is silently missed.

---

## 10. Emulator ignores `--scenario` → reserved flag

**Symptom.** You pass `--scenario <something>` to `emulator-server` expecting different
behavior; nothing changes.

**Cause.** The flag exists (`emulator/cmd/emulator-server/main.go`) but the scenario
name is marked "Reserved" in `emulator/internal/server/server.go` (Config.Scenario doc
comment) — it does not select scripts. Actual behavior is chosen by:

1. **~20 boolean demo/failure flags** at startup (`--permission-stress`,
   `--agent-failures`, `--session-create-failures`, `--provider-edge-states`,
   `--empty-tools`, `--cancel-failures`, ... plus seeding: `--seed-workspaces`,
   `--seed-sessions ws_id=N`, `--seed-messages ses_id=N` — N is turn PAIRS), and
2. **Keyword routing on the user message text** inside
   `emulator/internal/scenario/default_script.go`: "delete"/"rm "/"drop "/"truncate" →
   dangerous-permission flow; "split"/"with help"/"subagent" → subagent script;
   " diff"/" edit"/" patch"/"propose" → diff script; "earthscope sac demo"/"san diego
   sac"/"seismic waveform demo" → EarthScope/SAC fixture; etc. Read that file's header
   comment for the current routing table.
3. `--replay-file <file>` streams a captured SSE wire file instead of any script.

**Fix.** Don't fight `--scenario`. Type the routing keyword in the message, or pass the
boolean flag, or replay a capture. Malformed `--seed-*` input is a boot-time
`log.Fatalf` — the emulator refusing to start IS your error message.

---

## 11. Blueprint MCP "Connection closed" / "Cannot find home" → uvx cache

**This-machine operational fact** (from project operational memory, as of 2026-07; the
pinned version drifts). When a blueprint's MCP server dies at startup with "Connection
closed" or "Cannot find home", the uvx-cached `clio-kit` install is broken. Refresh it:

```powershell
uvx --refresh clio-kit@2.2.3 mcp-server <name>
```

Match the version pin to whatever the blueprint's MCP entries currently declare. Do this
only when MCP actually misbehaves — not as routine hygiene
(`.claude/skills/cleanup-after-run.md`).

---

## 12. Suspecting the ALCF token → stop

**This-machine operational fact.** A keeper process maintains the ALCF token. Do not
propose re-auth as a fix, and do not blame token expiry for live-gate failures. This
misdiagnosis has been made and corrected before (project operational memory: "Stop
blaming the ALCF token"). If an ALCF-backed run fails, go back to row 2 (harness
checklist) and to the actual backend logs (Rule zero).

---

## 13. A flag equal to the built-in default cannot override config.json → `config.Resolve` trap

**Symptom.** `config.json` has `"backend_url": "http://127.0.0.1:17801"`. You run
`gact --backend http://localhost:7777` expecting the flag to win. It doesn't — the TUI
goes to 17801.

**Cause (by design, documented in code).** `config.Resolve` in
`tui/internal/config/config.go`: "A flag that equals the fallback is treated as 'not
explicitly set' so env/file get a chance to override (Go's flag library returns the
default when the flag isn't passed; we can't otherwise tell the two apart)." Since the
built-in default IS `http://localhost:7777`, passing it explicitly is indistinguishable
from not passing it. Same applies to every Resolve-routed setting (theme, workspace...).

**Fix / workaround.** To force the default value over a config file, use the env layer
(`GACT_BACKEND=http://localhost:7777`, which beats the file) or point `GACT_CONFIG` at
an empty/other config. Do not "fix" Resolve's semantics ad hoc — the layering is relied
on by ~38 CLI subcommand files via `resolveCLIBackend` (see gact-config-and-flags).

---

## 14. Conforming backend's events silently dropped → strict SSE line-prefix parser

**Symptom.** A new backend/adapter streams SSE that other clients accept, but the TUI
sees nothing for some or all events.

**Cause.** The TUI's hand-rolled parser (`tui/internal/client/sse.go`, field-matching
switch) requires a space after the colon — it matches `data: `, `event: `, `id: ` and
silently ignores spec-legal `data:foo` — and it does not concatenate multi-line `data:`
fields. Known, tracked spec-conformance gap under iowarp/gact-tui#234 (as of 2026-07-06,
open).

**Discriminating experiment.** Capture the raw stream (`curl.exe -N ...`, row 4) and
READ it: if the backend emits `data:` with no space or splits JSON across multiple
`data:` lines, this is your bug.

**Fix routing.** Spec-first (rule 5): the fix belongs in the client parser, driven
through `contract/SPEC.md` + conformance expectations — not in the backend, which is
allowed to emit either form. Cross-check gact-wire-protocol-reference.

---

## 15. Execution timeline vanished → ledger prune rules

**Symptom.** A session's execution timeline (the per-turn event ledger) is empty or
truncated after a sidebar refresh or workspace switch.

**Cause & rule.** The per-session ledger is bounded (cap 2000, trim to 1500, drop-oldest
with a structured `execution.ledger.trimmed` audit event) and may be pruned in exactly
two cases: `session.cleared`, or backend-confirmed session deletion. Pruning from
refreshed session *lists* is forbidden — lists are workspace-scoped/archived-filtered
views, and `lastSeenSeqIDBySession` suppresses SSE replay, so the loss is irreversible
in-process. This burned once already: `57496b29 fix(tui): bound the execution event
ledger; prune only on explicit deletion (#244)` (issue iowarp/gact-tui#231).

**Discriminating experiment.** Look for `execution.ledger.trimmed` /
`execution.ledger.pruned` audit events (normal bounded behavior) versus a code path that
deletes ledger entries on list refresh (a regression of #231). Regression tests live in
`tui/internal/ui/execution_ledger_cap_test.go`.

---

## Before debugging: is it already fixed?

The 2026-07 cleanup program (umbrella iowarp/gact-tui#237) landed 12 commits on
`develop` dated 2026-07-02 that fix symptoms you may still find reported in older docs
and issues. If you observe one of these, FIRST confirm your build actually contains the
fix (row 1) — as of 2026-07-06 these exist on `origin/develop` but NOT on
`origin/main`/v0.9.4:

| Symptom you might chase | Already fixed by |
|---|---|
| Every `/compact` 404s against clio | `a42a19ee` — compact via `POST /compact {focus}`, not `/summarize` (iowarp/gact-tui#224) |
| CLI subcommands ignore config.json backend_url | `5be7b74a` (iowarp/gact-tui#230) |
| Unbounded execution ledger memory growth | `57496b29` (iowarp/gact-tui#231) |
| SSE drop shows a fatal error modal instead of reconnecting | `b4eb1e37` (iowarp/gact-tui#227) |
| TS wire-type drift (invented enum values, wrong payload shapes) | `c66b885f` (iowarp/gact-tui#248) |

Check with: `git log --oneline origin/develop -15` and `git branch --contains <hash>`.

---

## Cross-cutting discipline

- **Don't stop to ask.** During autonomous work, an agent stopping mid-task to ask an
  unnecessary question has cost more wall-clock time than any single bug (owner: an
  overnight run lost ~4 hours to one such stop). Work the playbook to completion; stop
  only on a real blocker. See gact-working-discipline.
- **Wrong blame is expensive.** Two of this project's costliest failures were
  *misdiagnoses*: the stale-build wholesale revert (row 1) and the retracted backend
  issue (row 2). Before naming a culprit outside your own harness/build, you need
  evidence that survives rows 1 and 2.
- **No silent fallback.** Whatever you fix, failures must surface a structured reason —
  never substitute defaults, swallow errors, or fake success (cleanup-program ground
  rule; `resolveCLIBackend`'s `reason=config_load_error` warning is the house pattern).

## When NOT to use this skill

- **You need to run/boot things, not diagnose them** (start emulator/clio/web/desktop,
  ports, artifact cleanup) → **gact-run-and-operate**.
- **You want the full history of an investigation/revert/dead end** → **gact-failure-archaeology**.
- **You need the wire contract itself** (endpoints, envelope, turn lifecycle, dialect
  catalog) → **gact-wire-protocol-reference**.
- **You need to measure something** (capture scripts, interpretation guides) →
  **gact-diagnostics-and-tooling**; for rigorous proof recipes (wire-capture
  differential, byte-parity, stale-build discrimination as a formal method) →
  **gact-proof-and-analysis-toolkit**.
- **You're deciding what counts as done/evidence** → **gact-validation-and-qa**.
- **Bubbletea/VHS/golden authoring how-to** (not a failure) → **gact-bubbletea-reference**.
- **Web renderer/RENDERING_SPEC questions** → **gact-web-rendering-reference**.
- **Config/flag inventory** → **gact-config-and-flags**; build/toolchain setup →
  **gact-build-and-env**.
- **Session conduct rules** (autonomy, protected resources) → **gact-working-discipline**.

## Provenance and maintenance

All claims verified against the repo on 2026-07-06 (HEAD `c66b885f` on `develop`).
Re-verify anything load-bearing before relying on it:

| Claim | Re-verify with |
|---|---|
| Revert-saga commits/bodies | `git log -1 3fb9ba24; git log -1 ad8a9e79; git log -1 d186ac97` |
| `payload.payload` envelope | Read `tui/internal/ui/live_events.go` (top comment + `applySSE`) |
| Dialect drift (thinking_append vs text_append) | `grep -n thinking_append emulator/internal/scenario/scenario.go` and `grep -n thinking_append contract/SPEC.md` |
| ttyd pin + tape rewriting | Read `scripts/vhs-windows.ps1` (default `TtydVersion = "1.7.2"`) and `screenshots/README.md` "Windows VHS" |
| Makefile coverage gaps | Read `Makefile` targets `test`/`test-race`/`vet` vs `go.work` `use` list and `.github/workflows/ci.yml` |
| `config.Resolve` trap | Read `tui/internal/config/config.go` (`Resolve` doc comment) |
| Emulator `--scenario` reserved + keyword routing | `emulator/internal/server/server.go` (Config.Scenario comment); `emulator/internal/scenario/default_script.go` header |
| SSE parser strictness (#234 status) | Read `tui/internal/client/sse.go` prefix switch; `gh issue view 234 --repo iowarp/gact-tui` |
| Ledger prune rules | `git log -1 57496b29`; `tui/internal/ui/execution_ledger_cap_test.go` |
| Harness-misconfig checklist | Read `docs/agent-operational-memory.md`; retraction story in `docs/handoff-2026-06-17-web-desktop-polish.md` ("Correction" section) |
| Cleanup-program fixes present in your build | `git branch --contains a42a19ee` etc. |
| clio-kit uvx pin (this-machine, drifts) | check the blueprint's MCP entries for the current `clio-kit@<ver>` |
| Port conventions (this-machine) | `.claude/skills/clio-web-deploy.md`, `apps/web/src/routes/splashModel.ts` (`PURE_WEB_DEFAULT_BACKEND`) |
