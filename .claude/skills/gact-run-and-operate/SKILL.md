---
name: gact-run-and-operate
description: >-
  Load this when you need to RUN anything in gact-tui: start the emulator or the
  TUI, bring up a real clio backend, launch the web preview or desktop dev build,
  connect a surface to a backend, detach/resume sessions, deploy adapter agents,
  find where run artifacts land, or tear everything down after a live run.
  Triggers: "run the TUI", "start the emulator", "which port", "backend not
  responding", "port stuck / already in use", "gact attach/resume", "agent
  deploy", "clean up after the run", "where did the logs go", "?backend=",
  ":17800 vs :17801".
---

# gact-run-and-operate — operating runbook

Runbook for starting, connecting, and tearing down every runnable piece of this
project on **this machine** (Windows 11, repo at
`D:\Libraries\Documents\projects\gact-tui`). Facts that only hold on this
machine are marked **[this-machine]**. Everything else was verified against the
repo as of 2026-07-06.

Definitions used throughout:

- **Emulator** — `emulator/emulator-server`, an in-repo Go HTTP server that fakes
  a GACT backend with scripted scenarios. No API keys, deterministic, safe.
- **clio** — the real agent backend (external repo
  `D:\Libraries\Documents\projects\clio-agent` **[this-machine]**). In prose say
  "clio" or "the agent backend", not "the sidecar".
- **Surface** — a client UI: the Go TUI (`tui/gact`), the SolidJS web app
  (`apps/web`), or the Tauri desktop app (`apps/desktop`).
- **GACT_BACKEND** — env var every TUI invocation honors; points at the backend
  base URL. Full precedence: built-in default `http://localhost:7777` <
  `config.json backend_url` < `GACT_BACKEND` < `--backend` flag (commit
  `5be7b74a` "fix: honor config.json backend_url in CLI subcommands (#230)
  (#243)" made this hold for all CLI subcommands too, via
  `tui/cli_backend.go`).

## 1. Run matrix (surface × backend)

All `make` / env-prefix commands below are **Git Bash** syntax (the repo's
Makefile and scripts are bash-flavored; `make` is installed via chocolatey
**[this-machine]**). PowerShell equivalents follow where they differ.

| Surface | Backend | Commands (Git Bash, from repo root) |
|---|---|---|
| TUI | emulator | `make run-emulator` (builds + runs `./emulator/emulator-server --port 7777 --timing realistic`), then in a second shell `make run-tui` (builds + runs `GACT_BACKEND=http://localhost:7777 ./tui/gact --theme dark`) |
| TUI (headless probe) | emulator | `make ping` / `make list` → `gact ping` / `gact list` against `http://localhost:$(PORT)` (PORT defaults 7777) |
| TUI | real clio | Bring up owned clio on `:17801` (section 4), then `GACT_BACKEND=http://127.0.0.1:17801 ./tui/gact` |
| Web | real clio | Build+preview web on `:4173` (section 5), open `http://localhost:4173/?backend=http://127.0.0.1:17801` |
| Web | emulator | Same preview; `?backend=http://127.0.0.1:7777`. Web visual tests' helper drive scripts default to `:7777` (e.g. `apps/web/tests/visual/drive-agentview-clean.mjs`) |
| Desktop (dev) | bundled/attached clio on `:17800` | `cd apps && pnpm --filter @clio/desktop tauri:dev` (= `gen-brand-backend` + `fetch-sidecar` + `tauri dev`; attaches to the conventional `clio start` port 17800) — verified from `apps/desktop/package.json`, not executed in this pass |
| One-command demo stack | owned clio `:17801` + web `:4173` | `bash apps/web/scripts/demo.sh up` **[this-machine]** (absolute `D:/...` paths baked in; see section 8) |

Verified live 2026-07-06: `make build`, then emulator on a scratch port +
`gact ping` (prints `ok: http://localhost:<port> (uptime Ns)`) and `gact list`
both succeed.

**Binary names [this-machine]:** `make build` produces `emulator/emulator-server`
and `tui/gact` — PE executables **without `.exe`**. Git Bash runs them fine;
PowerShell silently does nothing with an extensionless binary (verified: no
output, no exit code). From PowerShell either use Git Bash for these commands,
or build a PowerShell-runnable copy: `cd tui; go build -o gact.exe .` — and
delete `gact.exe` afterwards (only `tui/gact` is gitignored; `tui/gact.exe` is
not and will pollute `git status`).

PowerShell equivalent of a TUI run:

```powershell
$env:GACT_BACKEND = 'http://localhost:7777'
& D:\Libraries\Documents\projects\gact-tui\tui\gact.exe   # requires the .exe copy above
```

## 2. Ports table

| Port | What | Rules |
|---|---|---|
| 7777 | Emulator default (`Makefile PORT ?= 7777`; TUI built-in default backend) | Free to use; pick another `--port` for parallel emulators |
| 7811 | Hardcoded inside `tui/canonical_render.tape` (`Type "GACT_BACKEND=http://127.0.0.1:7811 ./gact"`) | `make screenshots` exports `GACT_BACKEND` but tapes that hardcode a port ignore it — start an emulator on the tape's own port first |
| 17800 | **Conventional** clio port: `clio start`, desktop sidecar (`apps/desktop/src-tauri/src/supervisor.rs`), docker profiles (`docker/docker-compose.yml`), and the web app's default backend (`apps/web/src/AppRouteModel.ts`, `splashModel.ts`) | Use for "product-like" runs |
| 17801 | **Owned instrumented dev clio** run from source **[this-machine]** — the port all live-run skills, `demo.sh`, and `watch-session.mjs` assume | Yours to start/kill (with the CommandLine filter, section 9) |
| 4173 | Web `vite preview` (`apps/web/package.json`: `"preview": "vite preview --port 4173"`) | Yours |
| 17960 | **FORBIDDEN** — shared developer clio runtime **[this-machine]** | **Never kill, restart, or repurpose `127.0.0.1:17960`** (`docs/agent-operational-memory.md`). Start your own backend on an owned port instead |
| (kernel-picked) | `gact agent deploy` binds adapters to a free port unless `--port N` is given | Recorded in `agents.json` (section 6) |

Mixing up 17800/17801 is a classic silent failure: the web splash auto-probes
17800 and finds nothing while your instrumented clio sits on 17801. Always pass
`?backend=` explicitly for dev runs.

## 3. Emulator operations

Build: `make build-emulator` (or `cd emulator && go build -o emulator-server ./cmd/emulator-server`).

Run: `./emulator/emulator-server --port 7777 --timing realistic`
(run_in_background when driving it from an agent session; it logs to stdout:
`seeded workspace ws_default ...` then `emulator listening on :7777 ...`).

Flags that matter (all verified in `emulator/cmd/emulator-server/main.go`):

| Flag | Effect |
|---|---|
| `--port` (7777) | Listen port |
| `--timing fast\|realistic` | Scenario pacing; use `fast` in tests/tapes |
| `--scenario` | **Reserved — does NOT select scripts** (`emulator/internal/server/server.go`). Behavior is chosen by the boolean demo flags below plus keyword routing on the user's message text in `emulator/internal/scenario/default_script.go` (e.g. "earthscope sac demo", "ndp feature demo", delete/rm → dangerous-permission flow) |
| `--replay-file <path>` | Stream a captured SSE wire file to each session instead of the scripted scenario |
| `--seed-workspace` (true) | Seed `ws_default` at `/tmp/gact-emulator-workspace` |
| `--seed-workspaces name:/path,...` | Extra workspaces |
| `--seed-sessions ws_id=N,...` | N seeded sessions per workspace, deterministic IDs `ses_seed_<wsID>_<n>` |
| `--seed-messages ses_id=N,...` | N user+assistant **pairs** (N=3 → 6 messages) |
| `--walk-files` | Serve real files from workspace roots for `/v1/workspaces/{id}/files` |
| ~20 deterministic failure/demo toggles | `--empty-expert-packs`, `--expert-pack-failures`, `--empty-prompts`, `--empty-skills`, `--prompt-stress`, `--prompt-save-failures`, `--empty-tools`, `--empty-mcp-connections`, `--permission-stress`, `--memory-unavailable`, `--long-commands`, `--agent-blueprint-failures`, `--long-agent-blueprints`, `--long-agents`, `--agent-failures`, `--cancel-failures`, `--session-create-failures`, `--session-rename-failures`, `--context-add-failures`, `--provider-edge-states`, `--provider-auth-succeeds`, `--active-agent-blueprint <id>` |

Malformed `--seed-*` input refuses to boot (`log.Fatalf`) — deliberate, no
silent partial seeding.

## 4. clio backend operations [this-machine]

Ground rules first:

1. **`127.0.0.1:17960` is the shared developer clio runtime. Do not touch it.**
   Never kill it, never point destructive operations at it, never "borrow" it
   for validation (`docs/agent-operational-memory.md`).
2. The clio checkout `D:\Libraries\Documents\projects\clio-agent` is
   **read + execute only** for gact-tui work. You may run it and read its
   source; do not edit it from a gact-tui session.
3. clio is an **editable uv install**: any clio source edit only takes effect
   after restarting the clio process (modules load at import time). If someone
   edited clio and the behavior "didn't change", restart before concluding
   anything.
4. For validation, run an **owned** clio on an **owned port** (convention:
   17801) with isolated state, and an owned workspace — never a shared one.

### Start the owned instrumented dev clio on :17801

Git Bash, `run_in_background: true`:

```sh
cd /d/Libraries/Documents/projects/clio-agent
CLIO_LM_PROVIDER=claude_code \
CLIO_LM_MODEL=haiku \
CLIO_LM_API_BASE="claude-code://sdk" \
CLIO_CLAUDE_CODE_TRANSPORT=sdk \
CLIO_ALLOWED_ROOTS="D:/Libraries/Documents/projects" \
CLIO_STREAM_AUDIT_LOG="<evidence-dir>/audit.jsonl" \
CLIO_SSE_EVENT_LOG="<evidence-dir>/sse-events.jsonl" \
.venv/Scripts/clio-agent-gact.exe --host 127.0.0.1 --port 17801 \
  > "<evidence-dir>/clio.out.log" 2> "<evidence-dir>/clio.err.log"
```

- `CLIO_ALLOWED_ROOTS` gates clio's filesystem access — it must contain every
  workspace root you will use.
- `CLIO_STREAM_AUDIT_LOG` / `CLIO_SSE_EVENT_LOG` are optional; set them only
  when you need the stage-by-stage stream audit (both env vars verified present
  in clio source, `src/clio_agent/runtime/stream_audit.py`).
- **Working-directory hazard:** clio's data dir defaults to the *cwd-relative*
  `.clio/agent` (`CLIO_DATA_DIR`, verified in clio
  `src/clio_agent/runtime/status.py`). Launching clio with cwd inside gact-tui
  drops a `.clio/` directory at the repo root — which is **not gitignored**
  (verified with `git check-ignore`; one such stray `.clio/` sits untracked in
  the tree today). Always launch from the clio-agent directory as above, or set
  `CLIO_DATA_DIR` to an owned scratch dir.

**Wait for ready** (agent build takes ~20–40s; do not send messages before):

```sh
until curl -s --max-time 4 http://127.0.0.1:17801/v1/health 2>/dev/null \
  | grep -q '"overall_status": *"ready"'; do sleep 3; done
```

Health surfaces `api / sessions / agent / memory / lm`; `lm: ready` means the
provider is wired.

### Conventional clio on :17800

`:17800` is what shipping surfaces expect: the desktop supervisor attaches
there, `docker compose --profile api|web up -d` (from `docker/`) maps host
`${CLIO_API_PORT:-17800}` / `${CLIO_WEB_PORT:-17800}`, and the pure-web default
backend is `http://localhost:17800`. Without `CLIO_LM_*` env the dockerized
agent runs capability-only and chat 503s with `agent:unavailable` — expected,
not a bug. The `clio start` launcher itself lives in the clio-agent repo, not
here; `make dev-install` / `make verify-dev-install` link *this checkout's* TUI
into `~/.local/share/clio/gact` so that launcher uses your build.

### Live-run product semantics

- **Permissions stay ENABLED during UI validation.** Approval / denial /
  timeout / blocked states are product semantics to exercise and screenshot,
  not noise to disable (`docs/agent-operational-memory.md`). Disable them only
  for an explicitly separate non-permission benchmark pass, and say so in the
  evidence.
- **Archive successful live-gate sessions** after screenshots/evidence are
  written, unless `CLIO_LIVE_KEEP_SESSIONS=1` is set for debugging.
- When a run misbehaves, **Read the actual log files** (`clio.err.log`, the
  audit JSONL, the rendered page) with the Read tool — do not grep for error
  patterns you already know; unknown failures don't match known patterns. If
  the file is huge, send a subagent to read and summarize. See
  gact-working-discipline.

## 5. Web preview (:4173)

```sh
cd /d/Libraries/Documents/projects/gact-tui/apps
pnpm install                     # once
pnpm --filter @clio/web build    # tsc typecheck + vite build
pnpm --filter @clio/web preview  # http://localhost:4173 — run in background
```

Connect: `http://localhost:4173/?backend=http://127.0.0.1:17801`. The
`?backend=` query param overrides the `http://localhost:17800` default
(`apps/web/src/AppRouteModel.ts`). If clio restarted, reload the page to
re-establish SSE.

Brand-variant builds (`with-brand.mjs` writes the gitignored
`apps/brand.config.local.json`; config file, not an env var):
`pnpm --dir apps/web build:clio` (external `clio-agent/branding/clio/brand.json`)
or `pnpm --dir apps/web build:gact` (in-repo `apps/branding/gact`). Details:
see the release skill and `apps/branding/INTEGRATION.md`.

## 6. Detach / resume / agent registry

- **Ctrl+Z in the TUI is a clean detach**, not a SIGTSTP suspend
  (`tui/internal/ui/app_interactions.go`). It records `(backend, session_id,
  title, timestamp)` in `detached.json` and quits.
- Registry files live **next to `config.json`** under `$XDG_CONFIG_HOME/gact/`
  (fallback `~/.config/gact/`; on this machine `C:\Users\jaime\.config\gact\`,
  created on first use): `detached.json` (override `$GACT_DETACHED_PATH`) and
  `agents.json` (override `$GACT_AGENTS_PATH`).

| Command | Effect (all verified in `tui/cli_detached.go`, `cli_attach.go`, `cli_agent*.go`, `cli_dispatch.go`) |
|---|---|
| `gact resume` | No-arg attach: reopens the most-recent detached session on the current backend (probes candidates newest-first, skips dead) |
| `gact attach [<name\|sess_id>] [--print-only]` | Attach to a specific session; `--print-only` resolves and prints the sid without launching the TUI |
| `gact detached` | List detached sessions (`--format pretty\|tsv\|json`, `--watch --interval 2s`) |
| `gact detached --probe` | Probe each backend, mark dead entries |
| `gact detached --prune-dead` | Implies `--probe`; removes every entry whose backend no longer has the session |
| `gact detached --rm sid1,sid2` | Remove entries by sid |
| `gact agent deploy <kind> <name> [--bin PATH] [--port N] [--cwd DIR] [--startup-timeout DUR]` | Spawn an adapter detached on a free (or given) port, wait for `/v1/capabilities`, register in `agents.json`. Built-in kind: `claudecode`; any other kind resolves via `GACT_ADAPTER_BIN` / `GACT_ADAPTER_SRC` env or `--bin`. Per-deploy logs land under `<config-dir>/gact/logs/<name>-<stamp>.log` and the path is printed |
| `gact agent list` / `gact agent stop <name>` / `gact agent rm <name>` | Manage deployed adapters |
| `gact connect <name>` | Read the `agents.json` entry, set `GACT_BACKEND`, launch the TUI against it |

## 7. Artifact landing map

| Location | What lands there | Git status | Rule |
|---|---|---|---|
| `visual_loop/tui_audit_*/` and `visual_loop/**/*.{jsonl,png,gif,log}` | Visual-audit run output | Ignored (two whitelisted replay fixtures excepted) | Regenerable — **never commit** |
| `apps/*.log` (e.g. `clio-17801.log`, `desktop-run.log`) | Backend/web/desktop run logs | Ignored via `apps/.gitignore` (`*.log`) | Delete when stale |
| `tui/gact`, `emulator/emulator-server` | Built binaries in their **module dirs** (there is no populated `bin/`) | Ignored | `make clean` removes them. `tui/gact.exe` is NOT ignored — delete any PowerShell copy you made |
| `screenshots/` | **Curated, tracked** VHS captures (`screenshots/README.md` is the index) | Tracked (`!screenshots/**/*.png`) | UI work must add/refresh one; don't dump raw run logs here — but note `demo.sh` writes evidence dirs `screenshots/live-demo-<stamp>/` whose `.log`/`.jsonl` files are untracked-not-ignored: clean them before committing |
| `apps/web/screenshots/` | Web evidence corpus (tracked, e.g. `0.8.4-audit/`) | Tracked | Save live-web verification screenshots here |
| `tmp/` | Scratch | Ignored | Free-for-all, clean after yourself |
| Repo root `/*.png`, `/*.gif` | Stray images | Ignored | Sanctioned homes are `screenshots/` and `docs/` |
| Repo root `.clio/` | clio session state from a wrong-cwd launch | **NOT ignored** — untracked hazard | Don't create it (section 4); don't `git add .` past it |
| `<config-dir>/gact/logs/` | `gact agent deploy` per-deploy adapter logs | Outside repo | Forensic trail for crashed adapters |

## 8. Live-session driving (web)

The committed drivers live in `apps/web/scripts/` (verified listing 2026-07-06):

| Script | Purpose / defaults |
|---|---|
| `demo.sh` | One-command stack: `up` (clio `:17801` SDK-haiku + web `:4173` + Chrome), `live` (drive a fresh `ws_ndp_demo` EarthScope session headed), `reload <sid>`. Absolute `D:/...` paths baked in **[this-machine]**; evidence to `screenshots/live-demo-<stamp>/`; also shows an alternative clio launch via `uv run --no-sync python -c ...` |
| `watch-session.mjs` | Open headed Chrome on an existing session to watch it live. Env: `SID=<session_id>` (required), `BACKEND` (default `http://127.0.0.1:17801`), `WEBURL` (`http://localhost:4173`), `WS_ID` (`ws_ndp_demo`) |
| `record-web-demo.mjs` | Scripted demo recording; env `CLIO_WEB_URL` / `CLIO_BACKEND_URL` (defaults `:4173` / `:17800` — note the 17800 default) |
| `earthscope-render-demo.mjs` | Drive the EarthScope blueprint (`CLIO_EARTHSCOPE_BLUEPRINT`, default `earthscope-gnss-region`) and capture rendering |
| `probe-earthscope-sse.mjs` / `audit-earthscope-sse.mjs` | Raw SSE probe / normalized-event audit of an EarthScope run |
| `verify-transcript-render.mjs` | Scan the rendered transcript for leak patterns (`[[ ##`, `workflow_state`, ...) |

**Ghost warning:** `capture-earthscope.mjs`, referenced by the old flat
`live-web-session.md` skill, **never existed in the repo**. Do not hunt for it;
use the scripts above.

Operational notes that carry over from live runs (all re-verified against
`docs/agent-operational-memory.md` and the scripts):

- EarthScope demos use workspace **`ws_ndp_demo`** (root
  `D:\Libraries\Documents\projects\ndp-demo-workspace` **[this-machine]**) —
  data is already staged there; do not create a fresh workspace per run.
- Driving Solid inputs from Playwright needs the native value setter + an
  `input` event (plain `.value=` is invisible to Solid). Key `data-testid`s:
  `sessions-new`, `session-semantics-title`, `session-semantics-start`,
  `composer-input`, `transcript`.
- A run only counts if it reaches the **synthesis tail** (a `main`/`answer`
  part >300 chars) — render bugs fire there; never cancel mid-pipeline and
  call it clean. Pass condition on the DOM: `broken === 0 && markers === 0`
  (no `[class*="broken"]`, no surviving `[[ ##` markers), plus a full-page
  screenshot saved to `apps/web/screenshots/`.
- Permission prompts during the run are product semantics: approve via
  `POST /v1/permissions/{id} {action:"allow_session"}` in a bounded loop, keep
  them enabled (section 4).
- Judge the result by **reading the rendered page / screenshot / logs with the
  Read tool**, not by regex filters — see gact-validation-and-qa for what
  counts as evidence.

## 9. Cleanup protocol (after any live run)

Order matters — cancel before you kill.

1. **Cancel a stuck/looping turn first** (the EarthScope resolver loops forever
   on its dead 404 endpoint):
   ```sh
   curl -s -X POST http://127.0.0.1:17801/v1/sessions/<SID>/cancel   # → 204
   ```
   Verify `GET /v1/sessions/<SID>` → `status: cancelled`.
2. **Kill ONLY your owned clio tree** — match by CommandLine, never by bare
   process name (dropping the filter kills unrelated Python processes,
   including possibly the forbidden shared runtime):
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='clio-agent-gact.exe' OR Name='python.exe'" |
     Where-Object { $_.CommandLine -like '*clio-agent-gact*17801*' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   if (Get-NetTCPConnection -LocalPort 17801 -State Listen -EA SilentlyContinue) { 'still listening' } else { 'port free' }
   ```
   Also kill leftover MCP/uvx children (`clio-kit`, `uv`, `mcp-server`) if
   present. The same pattern with the emulator: filter on
   `Name='emulator-server.exe'` + the port in CommandLine.
3. **Stop background helpers** you launched with `run_in_background`
   (permission-approver loops, monitors, `vite preview`) — `TaskStop <id>` so
   they don't keep polling a dead backend. Close any Playwright tab you opened.
4. **Workspaces / evidence:** reuse `ws_ndp_demo` instead of registering new
   workspaces; delete `scratchpad/capture-*` audit dirs when done (10k–35k
   JSONL rows per run). Archive successful sessions unless
   `CLIO_LIVE_KEEP_SESSIONS=1`.
5. **Do NOT delete:** the `ndp-demo-workspace` downloaded data (the 404
   fallback corpus), and never touch `127.0.0.1:17960`.
6. **Repo hygiene sweep:** no stray `tui/gact.exe`, no root `.clio/` you
   created, no run logs under `screenshots/live-demo-*/` headed for a commit.

## 10. When NOT to use this skill

| You actually want to... | Use instead |
|---|---|
| Diagnose a failure you can already reproduce (symptom → cause) | gact-debugging-playbook |
| Know what evidence closes an issue / what green tests do and don't prove | gact-validation-and-qa |
| Build the toolchain from scratch, fix Go/pnpm/uv env problems | gact-build-and-env |
| Understand the REST+SSE contract you're driving | gact-wire-protocol-reference |
| Look up a config knob or env var exhaustively | gact-config-and-flags |
| Author VHS tapes / golden tests for the TUI | gact-bubbletea-reference |
| Measure (latency, wire captures, diffs) rather than run | gact-diagnostics-and-tooling and gact-proof-and-analysis-toolkit |
| Session working rules (autonomy, evidence honesty, protected resources) | gact-working-discipline |
| Prepare a release | the release runbook (`.claude/skills/release.md`) via gact-change-control |

## Provenance and maintenance

Everything above was verified 2026-07-06 against the working tree at commit
`c66b885f` (plus a live boot: `make build`, emulator on a scratch port,
`gact ping`/`gact list`/`gact detached --probe`, and the PowerShell
extensionless-binary test). Re-verify before trusting drifted facts:

| Fact | Re-verify with |
|---|---|
| Makefile targets / PORT / TIMING defaults | `make help` and read `Makefile` |
| Emulator flag list | `./emulator/emulator-server --help` (or read `emulator/cmd/emulator-server/main.go`) |
| TUI backend precedence + flags | read `tui/tui_runtime.go`, `tui/cli_backend.go` |
| `gact detached` / `agent` / `attach` verbs and flags | `./tui/gact detached --help`; read `tui/cli_detached.go`, `tui/cli_agent.go` |
| Web scripts inventory + defaults | `ls apps/web/scripts/` and read the headers |
| Web/desktop package scripts and ports | read `apps/web/package.json`, `apps/desktop/package.json` |
| Default backend ports in web src | `grep -rn 17800 apps/web/src` |
| clio entrypoint exists | `ls D:/Libraries/Documents/projects/clio-agent/.venv/Scripts/clio-agent-gact.exe` |
| CLIO_* env vars still honored | `grep -rn "CLIO_DATA_DIR\|CLIO_STREAM_AUDIT_LOG" D:/Libraries/Documents/projects/clio-agent/src` |
| `.clio/` still not gitignored | `git check-ignore -v .clio/` (exit 1 = not ignored) |
| Forbidden shared runtime rule | read `docs/agent-operational-memory.md` |
| Artifact ignore rules | read `.gitignore`, `apps/.gitignore` |
