---
name: gact-diagnostics-and-tooling
description: How to MEASURE instead of eyeball in gact-tui. Load when you need hard evidence of what a backend or surface actually did — capture a raw SSE stream, diff /v1/capabilities between two backends, count the event shape of one turn, dump a session log or bug bundle, replay a captured wire file deterministically, prove live streaming order, or instrument the TUI's received/rendered frames. Keywords: gact log, gact conformance, dump-bundle, dashboard, sse capture, Last-Event-ID, --replay-file, capability diff, turn shape, audit JSONL, assert_live_observability, GACT_TUI_AUDIT.
---

# gact-diagnostics-and-tooling — measure, capture, then READ

Everything here was verified by running it on this machine (Windows 11, repo at
`D:\Libraries\Documents\projects\gact-tui`) against a locally booted emulator on
2026-07-06/07, unless explicitly labeled otherwise. Machine-specific facts are
marked **[this machine]**.

## Doctrine (owner rules, 2026-07-06 — these override habit)

1. **Capture to a file, then READ the file with the Read tool.** Do not hunt
   unknown failures with `grep`/`python` pattern filters — "it is hard to build
   filtering to detect errors or changes when you do not know those errors or
   changes." Pattern filters are for *counting things you already understand*
   (e.g. event-type histograms), never for *finding what's wrong*. If the file
   is too big for your context, send a subagent to Read and summarize it.
2. **Green tests never close a UI issue.** Evidence = the real app driven, plus
   the captured stream / rendered HTML / screenshot that shows it
   (see gact-validation-and-qa).
3. **Never point a mutating probe at a backend you don't own.** The conformance
   drift checks and several visual_loop capture helpers mutate or delete state
   by design. Emulators you booted are yours; a clio serving someone's demo is not.

## When NOT to use this skill

- **Starting/stopping backends, ports, teardown** → gact-run-and-operate.
- **What the wire contract MEANS** (envelope fields, turn lifecycle, dialects,
  capability semantics) → gact-wire-protocol-reference; deliberate-vs-accidental
  design questions → gact-architecture-contract.
- **A symptom you haven't triaged yet** ("it looks wrong", works-on-emulator-
  breaks-on-clio) → gact-debugging-playbook first; it will send you back here
  for the measurement step.
- **Choosing what counts as closure evidence / adding tests** → gact-validation-and-qa.
- **Full proof recipes** (wire-capture differential, stale-build discrimination,
  hypothesis→numbers→refutation method) → gact-proof-and-analysis-toolkit. This
  skill is the instrument catalog; that one is the methodology.
- **Driving the cross-surface parity campaign** → gact-interface-parity-campaign
  (it uses `capability-diff.ps1` from here as its primitive).
- **VHS tapes / screenshots / golden tests as such** → gact-bubbletea-reference
  and the `tui-screenshot` / `tui-test` skills.

## 0. Instrument map

| Question | Instrument | Section |
|---|---|---|
| What did this session's conversation contain? | `gact log <sid>` | §1 |
| What is every session doing right now? | `gact dashboard --format json` | §1 |
| Does this backend implement the contract? | `gact conformance` | §1 |
| I'm filing a bug — collect everything | `gact dump-bundle` | §1 |
| What exact bytes did the backend stream? | `curl -N` / `scripts/sse-dump.ps1` | §2, §3a |
| Deterministic re-run of a real captured turn | emulator `--replay-file` | §2 |
| Do two backends advertise the same capabilities? | `scripts/capability-diff.ps1` | §3b |
| What events does one turn produce on backend X? | `scripts/turn-shape.ps1` | §3c |
| What did the TUI receive vs render? | `GACT_TUI_AUDIT_*` hooks | §4 |
| Did streaming happen live (not a post-hoc burst)? | `assert_live_observability.py` | §5a |
| Is the visual evidence corpus complete/owned? | `check_visual_corpus.py` + manifests | §5b |
| What did the WEB transcript receive/render? | `apps/web/scripts/*.mjs` | §6 |

## 1. The `gact` CLI diagnostic surface

Build a fresh binary first (stale binaries are a documented wrong-blame source;
`.tools/` is gitignored, and building under `%TEMP%` triggers Windows firewall
prompts — **[this machine]** use the stable path):

```powershell
cd D:\Libraries\Documents\projects\gact-tui
go build -p 1 -o .tools\gact.exe .\tui
go build -p 1 -o .tools\emulator-server.exe .\emulator\cmd\emulator-server
.\.tools\gact.exe version   # confirm revision matches git HEAD before trusting any output
```

Every subcommand takes `--backend URL`; resolution is defaults < config.json <
`GACT_BACKEND` < `--backend` (`resolveCLIBackend` in `tui/cli_backend.go`, commit
5be7b74a "fix: honor config.json backend_url in CLI subcommands"). **Trap:** a
`--backend` value equal to the built-in default `http://localhost:7777` counts as
"not set" and loses to config.json — always pass a non-default URL (e.g.
`http://127.0.0.1:7777`). **[this machine]** config lives at
`C:\Users\jaime\.config\gact\config.json` (currently no `backend_url`; confirm
with `gact diag`).

All commands below were run successfully against a local emulator (port 7797).
Full dispatch table: `tui/cli_dispatch.go` (~60 subcommands; only the diagnostic
ones are covered here).

| Command | What it measures | Key flags (verified in source) |
|---|---|---|
| `gact ping` | backend liveness via `/v1/health`, exit 0/1 | `-q`, `--json` |
| `gact diag` | local environment: binary revision + dirty flag, PATH-vs-running-binary match, config path, clipboard/mouse/TERM diagnostics, detached registry | (none; `gact version` for version only) |
| `gact info <sid>` | one session's metadata as `key: value` lines | `--format text\|json`, `--include tasks,hooks,perms` |
| `gact log <sid>` | full conversation dump, plain text or NDJSON | `--limit N` (default 100), `--since DUR`, `--role user,assistant,tool,system`, `--grep REGEX` (case-insensitive; prepend `(?-i)` to override), `--format text\|json` |
| `gact follow <sid>` | `tail -f` for a session: snapshot then live via SSE until Ctrl+C | same `--role/--grep/--since/--format` as `log` |
| `gact grep <query>` | cross-session full-text search (fans out `SearchMessages`, 8-wide pool) | `--workspace`, `--role`, `--format tsv\|json`, `--limit` |
| `gact dashboard` | one row per session: status, tokens, cost | `--format pretty\|tsv\|json`, `--watch --interval 2s`, `--status idle,running,waiting,error`, `--sort newest\|oldest\|status\|tokens\|backend`, `--detached-only` |
| `gact detached` | local Ctrl+Z detach registry; `--probe` marks per-backend liveness | `--probe`, `--prune-dead` (writes registry!), `--rm sid,...` (writes!), `--format`, `--watch` |
| `gact dump-bundle` | one-shot bug bundle directory: `version.txt`, `diag.txt`, `metrics.json`, `detached.json`, `sessions/<sid>.json` (every session exported, 8-wide fanout) | `-o DIR` (default `gact-bundle`), `--since DUR` |
| `gact conformance` | runs `contract/conformance` against the backend; per-section ✓/✗, exit 1 on any failure | `--workspace`, `--skip Health,Capabilities,...` |
| `gact capabilities` | human-readable `/v1/capabilities` dump: contract version, backend id, transports, auth scheme, ✓/· flag list (see §3b for the machine diff) | `--backend` |

Interpretation notes:

- **`gact log --format json` is NDJSON** (one message per line) — pipe-friendly,
  and Read-friendly. `--grep` matches the *flattened visible text* (text +
  thinking; tool calls/results excluded), so a message that is purely a tool
  call never matches.
- **`gact dashboard --status waiting`** is an alias for the wire status
  `waiting_permission`.
- **`gact conformance` against a backend you care about MUTATES sessions it
  creates** — and the drift-class checks (rollback deletes the newest message,
  compact rewrites the ledger) run only on suite-created sessions. Verified
  run against the emulator ends `PASS` with every section ✓ including
  `Drift_CapabilityTruth`, `Drift_SSEReplayAndShapes`, `Drift_CompactFocus`,
  `Drift_RollbackEnvelope`. An un-skipped section returning 501 is a FAIL by
  design.
- **`gact diag` self-verifies the binary**: `path_gact_status: matches running
  binary` is the stale-build discriminator — if it says anything else, stop and
  rebuild before believing any regression report (see gact-failure-archaeology).
- **Doctor is a TUI screen, not a CLI command.** In the running TUI, `/doctor`
  opens a modal with three tabs — Health (renders `/v1/health` `integrations[]`
  color-coded ready/degraded/unavailable), Capabilities, and Gaps — gated on
  `capabilities.integration_health` (`tui/internal/ui/doctor.go`,
  `doctor_capabilities.go`). The CLI equivalents are `gact ping --json` +
  `gact capabilities`.

Example (real output, emulator):

```text
$ gact dump-bundle --backend http://127.0.0.1:7797 -o bundle-test
gact dump-bundle: wrote 2 sessions + version + diag + metrics + detached → bundle-test
```

Then **Read** `bundle-test/diag.txt` and each `bundle-test/sessions/*.json` —
do not grep them.

## 2. Raw SSE observation

The stream endpoint is `GET /v1/sessions/{id}/events` (session-scoped only; the
global `/v1/events` is optional spec surface clio does not implement —
SPEC §7.1). Frames are standard SSE `event:` / `id:` / `data:` blocks; `data` is
the JSON envelope `{type, occurred_at, payload, replay?}`. Reconnect/replay uses
the standard `Last-Event-ID` header; sending `Last-Event-ID: 0` replays the
per-session buffer from the start (clio bounds it at 256 non-transient events;
replayed events carry `replay: true` on clio — the emulator's replay rows were
observed WITHOUT the `replay` key, so don't key logic on it for emulator runs).

Git Bash **(verified)**:

```bash
curl -sN --max-time 30 \
  -H "Accept: text/event-stream" -H "Last-Event-ID: 0" \
  "http://127.0.0.1:7797/v1/sessions/$SID/events" > sse-raw.txt
```

PowerShell: `Invoke-WebRequest` buffers the whole response and is useless for
SSE — use `scripts/sse-dump.ps1` (§3a), which streams via `HttpClient` with
`ResponseHeadersRead` and writes JSONL you can Read later.

### Deterministic replays: emulator `--replay-file`

The emulator can stream a **captured SSE wire file** back to every session
instead of running its scripted scenario (`emulator/cmd/emulator-server/main.go`,
`emulator/internal/scenario/replay_script.go`):

```powershell
.\.tools\emulator-server.exe --port 7799 --timing fast `
  --replay-file D:\Libraries\Documents\projects\gact-tui\tui\internal\ui\testdata\earthscope-la.wire.sse
```

- The file format is exactly a raw SSE capture (`event:`/`id:`/`data:` lines) —
  what `curl -N` or `sse-dump.ps1` writes is convertible; the checked-in
  fixture `tui/internal/ui/testdata/earthscope-la.wire.sse` (a real clio
  EarthScope turn, 1192 lines) works as-is and is the same fixture the TUI's
  `wire_replay_test.go` consumes.
- On each user message the engine waits ~1.5 s (so your SSE subscriber attaches;
  the bus has no pre-subscription buffer), rewrites `session_id` to the live
  session, and skips server-owned frames (`server.connected`,
  `server.heartbeat`, `session.snapshot`, `lm.provider.changed`).
- Verified end-to-end: `turn-shape.ps1` against a `--replay-file` emulator
  reproduced the clio-shaped turn — 86 `semantic.event`, 12 `tool.call.started`
  + 12 `tool.call.completed`, 87 `message.part.added` — versus the default
  script's simple shape (§3c). This is the cheapest way to drive any frontend
  with a real backend's wire without the backend.

## 3. Shipped scripts (all verified by running on 2026-07-06)

Location: `.claude/skills/gact-diagnostics-and-tooling/scripts/`. All are
Windows PowerShell 5.1-compatible; run from any directory.

### 3a. `sse-dump.ps1` — capture a session's event stream to JSONL

```powershell
& "$SKILLS\gact-diagnostics-and-tooling\scripts\sse-dump.ps1" `
    -SessionId sess_abc -Backend http://127.0.0.1:7777 `
    -Out sse-dump.jsonl -Seconds 30 -LastEventId 0
```

One JSON line per SSE frame:
`{"captured_at":"...","sse_event":"message.part.delta","sse_id":"104","data":{...envelope...}}`.
The file is flushed per event, so it can be polled/Read while streaming. Omit
`-LastEventId` for live-only; pass `0` to include the replay buffer. Real run:

```text
sse-dump: wrote 103 events -> C:\...\sse-replay.jsonl
```

### 3b. `capability-diff.ps1` — the parity primitive

Fetches `GET /v1/capabilities` from two backends, flattens every field
(including `backend.*`, `contract_version`, and `x_clio_*` vendor keys), prints
field-level differences. Exit 0 = identical, 1 = differences, 2 = fetch failure.

```text
$ capability-diff.ps1 -BackendA http://127.0.0.1:7797 -BackendB http://127.0.0.1:7798
A = http://127.0.0.1:7797
B = http://127.0.0.1:7798
fields: 48 total, 1 differ

Field               A    B     Status
-----               -    -     ------
capabilities.memory true false DIFF
```

(Real output; backend B was an emulator booted with `--memory-unavailable`.)
Add `-All` to print SAME rows too. Statuses: `DIFF`, `ONLY_A`, `ONLY_B`.
Use it emulator-vs-clio before any capability-gated work, and clio-vs-clio
across versions when a live gate regresses. Interpreting *whether* a difference
is legitimate is gact-wire-protocol-reference / gact-interface-parity-campaign
territory.

### 3c. `turn-shape.ps1` — one turn's full event sequence, summarized

Creates a **new** session (never reuses one), subscribes via `sse-dump.ps1` in a
background job *before* posting, posts one message, waits for
`message.completed` (or `-MaxWaitSeconds`, exit 1 if never seen), then prints an
event-type histogram in first-seen order. Real run against the default-script
emulator:

```text
turn shape for session sess_3ce78e... (103 events, message.completed seen: True)
   1  server.connected
   4  message.created
   2  session.status_changed
   4  message.part.added
  82  message.part.delta
   4  message.part.completed
   1  tool.call.started
   2  message.completed
   2  cost.updated
   1  tool.call.completed
raw capture: C:\...\turn-shape.jsonl (read it with the Read tool; do not grep-and-guess)
```

Run it against two backends and compare histograms — that is the first move of
every works-on-emulator-breaks-on-clio investigation (the full method is in
gact-proof-and-analysis-toolkit). The raw JSONL stays on disk: the histogram
tells you *where* to look; the Read tool tells you *what happened*.

Note: against a live clio the turn needs a configured provider; a
capability-only clio (no `CLIO_LM_*` wired) fails chat with a structured 503
`agent:unavailable` — documented expected behavior (`docker/docker-compose.yml`
header), and that error shape is itself evidence. Timing: emulator
`--timing fast` completes in seconds; real clio turns can take minutes — raise
`-MaxWaitSeconds`.

## 4. TUI audit hooks — what the TUI received vs rendered

`tui/internal/ui/audit.go` implements an opt-in recorder activated by env vars
(all five default off; set any subset before launching `gact`):

| Env var | File written | Content |
|---|---|---|
| `GACT_TUI_AUDIT_RECEIVED_PATH` | append JSONL | every normalized message/SSE event the TUI ingested: `{observed_at, kind, data}` |
| `GACT_TUI_AUDIT_RENDER_PATH` | overwrite | latest ANSI-stripped full-frame render |
| `GACT_TUI_AUDIT_RENDER_FRAMES_PATH` | append JSONL | every *distinct* full frame with `frame_index` |
| `GACT_TUI_AUDIT_CONVERSATION_PATH` | overwrite | latest ANSI-stripped conversation pane |
| `GACT_TUI_AUDIT_CONVERSATION_FRAMES_PATH` | append JSONL | every distinct conversation frame |

This is the received-vs-rendered differential: if an event is in the received
JSONL but never appears in any rendered frame, the bug is in the TUI's render
path; if it never arrives, the bug is upstream. (Verified from source; exercised
end-to-end by `visual_loop/run_tui_audit_session.py`, which is **Linux/WSL-only**
— it imports the Unix `pty` module. On Windows set the env vars and drive the
TUI manually or via VHS.)

**Structured self-reports ride the same channel.** Per the no-silent-fallback
rule, internal drops are audit events, not silence: when a session's execution
ledger exceeds its cap, the TUI records
`execution.ledger.trimmed` with `{reason: "execution_ledger_cap", session_id,
dropped, kept, cap}` (`tui/internal/ui/execution_sse.go`; commit 57496b29
"fix(tui): bound the execution event ledger; prune only on explicit deletion"),
and ledger drops on confirmed session deletion record `execution.ledger.pruned`.
If Ctrl+E drill-down "lost" events, Read the received JSONL for these kinds
before blaming the backend.

Related opt-in observability (verified in source): `GACT_TUI_LATENCY_REPORT=path`
writes an interaction-latency report on TUI exit (`tui/tui_runtime.go`);
`GACT_WIRE_DUMP` / `GACT_RELOAD_DUMP`+`GACT_RELOAD_JSON` gate wire-replay and
reload-render dump test paths in `tui/internal/ui/wire_replay_test.go` and
`reload_render_dump_test.go`.

## 5. visual_loop instrumentation (temporal proof + owned-backend receipts)

The `visual_loop/` Python harness measures what screenshots cannot. On
**[this machine]** `python` is 3.14.6 and the checkers run with it (docs say
`python3`; plain `python` works on Windows).

### 5a. `assert_live_observability.py` — temporal JSONL assertions

```bash
python visual_loop/assert_live_observability.py <capture>.jsonl \
  --mode benchmark-hierarchy --report <capture>.strict.report.md
```

Default `benchmark-hierarchy` mode requires the ordered sequence
`route_or_delegate → child_expert_active → tool_started → tool_completed →
parent_resumed` AND requires matched observations to precede
`message.completed` by ≥ 0.25 s — specifically to defeat the false pass where a
post-hoc event burst right before the final answer looks fine in a settled
screenshot. `--mode basic-tools` is the weaker smoke (live tool start/complete,
no live-lead requirement). A strict FAIL + basic PASS means "tools are visible
live, but hierarchy/parent-resume semantics unproven."

### 5b. `check_visual_corpus.py` — corpus completeness gate

```bash
python visual_loop/check_visual_corpus.py --root .
python visual_loop/check_visual_corpus.py --root . --require-git-tracked
python visual_loop/check_visual_corpus.py --root . --require-git-tracked --require-strict-live-pass
```

Verifies the maintained tapes/screenshots/temporal reports indexed in
`visual_loop/COVERAGE.md` exist and are non-empty (filesystem health, NOT image
diffing), audits slash-command discoverability against
`SLASH_COMMAND_VISUAL_COVERAGE.md`, and with `--require-strict-live-pass`
demands ≥ 1 strict live-observability report with `verdict: PASS`.
**Expected on this checkout (as of 2026-07-06): verdict `FAIL`** — run outputs
are untracked/regenerable, so a clean checkout is missing local captures. That
FAIL means "captures not present here", not "code broken". Other flags:
`--require-indexed`, `--include-deferred`, `--write-deferred-report`,
`--require-ndp-demo-ready`.

### 5c. Manifest receipts — proof the capture came from an owned live backend

Live-capture helpers (`capture_live_*.sh`, `capture_ndp_demo_tui.sh`,
`capture_tui_mouse_latency_pty.py`, ...) write JSON manifests whose readiness
checkers (`check_*_readiness.py`, each with `--strict` / `--strict-live`)
require real values: `captured_from_owned_backend: true`,
`mutation_consent: true` where the flow mutates, real-PNG validation — empty
`{}` placeholder manifests are rejected, and flags must be JSON `true`, not
strings. The helpers refuse to run without explicit ownership env vars
(`CLIO_NDP_CAPTURE_OWN_BACKEND=1`, `CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND=1`,
`GACT_TUI_MOUSE_LATENCY_OWN_BACKEND=1`, ...) — that is the receipts system:
evidence that cannot be faked by a screenshot of the wrong backend, and probes
that cannot accidentally hit a shared one.

Windows overrides: the harness defaults are Linux paths
(`/home/jcernuda/clio-agent/...`). `run_tui_audit_session.py` itself cannot run
here (Unix `pty`); for helpers that can, always pass `--clio-root`,
`--backend-bin` (e.g. `D:\Libraries\Documents\projects\clio-agent\.venv\Scripts\clio-agent-gact.exe`
**[this machine]**), and `--backend-url`/`--port` explicitly rather than
trusting defaults. VHS-based capture is preferred on Linux/WSL; on Windows see
`scripts/vhs-windows.ps1` (ttyd pin) via gact-build-and-env.

## 6. Web evidence tooling (`apps/web/scripts/*.mjs`)

Run from `apps/web` with node (some have pnpm aliases). These target a **live
clio** (defaults `http://localhost:17800`; the instrumented-from-source dev clio
convention is `:17801` — see gact-run-and-operate). Not run in this
verification pass (no live clio booted); behavior below is from reading each
script's source.

| Script | pnpm alias | What it measures / produces |
|---|---|---|
| `probe-earthscope-sse.mjs` | `probe:earthscope-sse` | headless wire probe, no browser: configures provider, creates a session + blueprint, subscribes SSE, posts the EarthScope prompt, writes `sse-received.jsonl` (every frame with `received_at`, `event_id`, `event_type`, `replay`, `payload`), `sse-summary.json` (event-type counts, max occurred→received / write→received lags, `public_marker_leak_count`, completed flags), `messages.json`, `sessions.json`. NOTE: it waits for the **normalized dialect** (`turn.completed`/`turn.failed`; also counts `turn.text.delta`, `turn.trace.delta`, `call.result.delta`, `state.updated`) — against a classic `message.*` backend (the emulator) it will time out; that mismatch is itself a dialect finding. |
| `audit-earthscope-sse.mjs` | (none — `node scripts/audit-earthscope-sse.mjs --out <probe-dir>`) | offline four-quadrant timing audit over a probe dir: correlates `sse-received.jsonl` with the backend's own `backend-sse-events.jsonl` + `backend-stream-audit.jsonl`, computing per-event provider→bridge→emit→receive latencies and public-leak checks (`workflow_state`, `[[ ##`, `metadata_path`, ...); writes `semantic-sse-audit.json`. For those backend files to exist, launch clio with `CLIO_SSE_EVENT_LOG=<probe-dir>/backend-sse-events.jsonl` and `CLIO_STREAM_AUDIT_LOG=<probe-dir>/backend-stream-audit.jsonl` (unverified live — from script source + the live-web-session skill). |
| `record-web-demo.mjs` | `demo:record` | full Playwright-driven web run: per-step `NN-*.png` (full page), `NN-*.html` (whole DOM), `NN-*.transcript.html`, `NN-*.transcript-core.html`, `NN-*.layout.json`, plus `run-config.json`, `capabilities.json`, `provider.json`, `messages.json`, `autoscroll.json`, `summary.json`, optional `video.json`. |
| `earthscope-render-demo.mjs` | `demo:earthscope-render` | the canonical EarthScope render-evidence run: per-capture `<name>.png` + `<name>.transcript.html` + `<name>.transcript-core.html`, plus `provider.json`, `blueprints.json`, `sessions-after-run.json`, `messages.json`, `summary.json`. |
| `verify-transcript-render.mjs` | (none) | asserts the rendered transcript row sequence (agent/call/tool/return kinds, per-agent attribution) matches the expected EarthScope shapes and contains no leak patterns (`_UnsupportedSessionAgent`, `Cannot find home`, ...). |
| `watch-session.mjs` | (none) | opens a headed Chrome on a session (`SID=... BACKEND=... node scripts/watch-session.mjs`) so a human/agent can watch it live; stays open until Ctrl+C. |

Interpretation: the **`.transcript.html` / `.transcript-core.html` files are the
evidence of record for web rendering** — Read them (the core variant strips
chrome). `summary.json` carries the pass/fail-shaped fields (in probe runs:
`completed`, `has_text_delta`, `public_marker_leak_count`, lag maxima —
`max_sse_write_to_received_ms` in the hundreds of ms is transport lag, not
render lag). Older evidence trails mention `*.dom-summary.json`; the current
scripts do not emit that name.

## 7. Reading the evidence (how to not waste the capture)

1. Read the summary/histogram output first — it localizes, never concludes.
2. Read the raw capture file with the Read tool, start to finish, at least once.
   Unknown failures announce themselves in fields no filter was written for
   (a `reason` string, an unexpected `status`, a half-written part, an
   `execution.ledger.trimmed` you didn't expect).
3. If the file exceeds your context budget, chunk it by `offset`/`limit` or
   dispatch a subagent whose only job is to Read it and report anomalies —
   not to grep it.
4. Only after you know what "wrong" looks like may you write a filter to count
   it — and that filter's output goes next to, never instead of, the raw file
   path in your report.
5. Captures land in gitignored scratch space (`visual_loop/tui_audit_*/`,
   `apps/web/screenshots/<run-dirs>`, `%TEMP%`); cite paths in the issue/PR,
   don't commit them (see gact-change-control).

## Provenance and maintenance

Verified on 2026-07-06/07 against commit c66b885f (develop) by building
`.tools\gact.exe` + `.tools\emulator-server.exe` and running: `gact ping / diag /
new / send / log / follow / grep / info / dashboard / detached / dump-bundle /
conformance / capabilities`, raw `curl -N` SSE capture, three emulator boots (default,
`--memory-unavailable`, `--replay-file earthscope-la.wire.sse`), and all three
shipped scripts end-to-end. Web `.mjs` behavior is from source reading only
(labeled above). Re-verify drift with:

```powershell
# subcommand list drifted?
Select-String -Path tui\cli_dispatch.go -Pattern 'case "'
# per-command flags drifted? read the runX function:
Select-String -Path tui\cli_log.go,tui\cli_follow.go,tui\cli_grep.go,tui\cli_dashboard.go,tui\cli_detached.go,tui\cli_dump_bundle.go,tui\cli_diagnostics.go -Pattern 'fs\.(String|Bool|Int|Duration)'
# emulator flag list (31 flags as of 2026-07-06):
Select-String -Path emulator\cmd\emulator-server\main.go -Pattern 'flag\.(Int|String|Bool)'
# audit env vars:
Select-String -Path tui\internal\ui\audit.go -Pattern 'Env\s*='
# conformance --skip tokens:
Select-String -Path tui\cli_diagnostics.go -Pattern 'case "'
# web scripts + aliases:
Get-ChildItem apps\web\scripts\*.mjs; Select-String -Path apps\web\package.json -Pattern 'demo:|probe:'
# visual_loop checker inventory:
Get-ChildItem visual_loop\check_*.py, visual_loop\assert_live_observability.py
# capabilities flag count (was 48 flattened fields incl. backend.* on the emulator):
(Invoke-RestMethod http://127.0.0.1:7777/v1/capabilities).capabilities
```
