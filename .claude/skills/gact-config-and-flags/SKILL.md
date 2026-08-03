---
name: gact-config-and-flags
description: Catalog of every configuration axis in gact-tui — TUI config.json keys and backend-resolution precedence, GACT_*/CLIO_* environment variables, all 31 emulator flags, capability flags, web/desktop knobs (?backend=, localStorage, brand builds), and the add-a-config-option checklist. Load when a flag or config value is being ignored, when you need to point a surface at a backend, when choosing an emulator flag for a demo/test, when hunting "where is this setting read", or before adding any new flag, env var, or config key.
---

# gact-config-and-flags — every configuration axis, cataloged

All paths are repo-relative to `D:/Libraries/Documents/projects/gact-tui` unless absolute. Facts marked **[this machine]** are specific to this Windows box. All file/line references verified against the working tree as of 2026-07-06.

**Vocabulary** (used throughout):
- **TUI** — the Go terminal client, binary `gact`, module `tui/`.
- **Emulator** — `emulator/emulator-server`, an in-repo HTTP server that fakes a conforming backend for keyless dev/tests.
- **clio** — the real agent backend (external repo `D:\Libraries\Documents\projects\clio-agent` **[this machine]**).
- **Capability flags** — booleans/strings in the `GET /v1/capabilities` response that tell clients which features a backend supports (see `contract/SPEC.md` §3.3).
- **Pointer-typed field** — a Go struct field like `*string`/`*int`; `nil` means "absent from file", distinguishing it from an explicit zero. Every `config.json` field uses this idiom.

## 0. First moves — inspect before you guess

| Goal | Command (any shell) |
|---|---|
| See the fully-resolved local config the binary will use (no network) | `./tui/gact env` (add `--format json` for machine-readable) |
| Print a sample `config.json` with every key + default | `./tui/gact emit-config` |
| Full bug-report dump: version + config + `GACT_*` env + detached registry | `./tui/gact diag` |
| Dump the backend's capability payload | `./tui/gact caps --backend http://localhost:7777` |
| Show/set theme from CLI | `./tui/gact theme show` / `gact theme list` / `gact theme set <name>` |

`gact env` output is TSV `KEY<TAB>VALUE` plus a `--- ENV ---` snapshot of every `GACT_*` env var reaching the process — the fastest answer to "is my env var even set?" (`tui/cli_local_config.go:157`). Note it resolves env > file > fallback only; it does not model CLI flags.

When you read logs or dumps produced by these commands, **Read the file/output directly** — do not pre-filter with regex for errors you expect; the errors you don't expect are the ones that matter.

## 1. Backend resolution — the one precedence chain

Precedence, lowest to highest (identical for the interactive TUI and every CLI subcommand):

```
built-in default  <  config.json backend_url  <  GACT_BACKEND env  <  --backend flag
```

- Built-in default: `http://localhost:7777` (`tui/main.go:19`, const `defaultBackend`). Default theme: `dark`.
- Implemented by `config.Resolve` (`tui/internal/config/config.go:154`) at `tui/tui_runtime.go:45` (TUI) and `tui/cli_backend.go:20` `resolveCLIBackend` (CLI subcommands — extended to all of them by commit `5be7b74a` "fix: honor config.json backend_url in CLI subcommands (#230) (#243)", iowarp/gact-tui#230/#243; regression tests in `tui/cli_backend_test.go`).
- An unreadable/corrupt config file does NOT silently vanish: `resolveCLIBackend` prints a structured stderr warning `reason=config_load_error` and degrades to env/flag/default. The interactive TUI warns similarly (`tui/tui_runtime.go:17-19`). This is the no-silent-fallback rule in action — preserve it.

### TRAP: a flag equal to the built-in default is treated as UNSET

`config.Resolve` cannot distinguish "user passed `--backend http://localhost:7777`" from "user passed nothing" (Go's `flag` package returns the default either way), so a flag value equal to the fallback is deliberately treated as not-set and the config file / env win (`tui/internal/config/config.go:149-153`, comment). Consequences:

- `gact --backend http://localhost:7777` will NOT override a `config.json` `backend_url`. To force the default over a config file, use the env layer: `$env:GACT_BACKEND = 'http://localhost:7777'` (PowerShell) / `GACT_BACKEND=http://localhost:7777 ./gact` (bash).
- Same trap applies to `--theme dark` and any other flag whose value equals its default.
- Empty string at any layer also means "not set".

### Config file discovery

First match wins (`tui/internal/config/config.go:134`, `DefaultPath`):

1. `$GACT_CONFIG` — exact file path (not a directory)
2. `$XDG_CONFIG_HOME/gact/config.json`
3. `~/.config/gact/config.json` (on Windows, `~` = `C:\Users\<you>`)

Missing file → zero config, nil error. Present-but-unparseable → warning, not fatal; resolution proceeds without it.

### Which layers exist for which setting

| Setting | Flag | Env | config.json key | Fallback |
|---|---|---|---|---|
| Backend URL | `--backend` | `GACT_BACKEND` | `backend_url` | `http://localhost:7777` |
| Workspace | `--workspace` | `GACT_WORKSPACE` | `workspace` | (none) |
| Theme | `--theme` | `GACT_THEME` | `theme` | `dark` |
| Voice command | `--voice-cmd` | `GACT_VOICE_CMD` | `voice_command` | (none) |
| Locale | (no flag) | `GACT_LOCALE` | `locale` | `en` |
| Brand name | (no flag) | `GACT_BRAND_NAME` | `name` | built-in |
| Skip splash | `--no-intro` | `GACT_NO_INTRO` (any non-empty) | `intro_skip` | show splash |
| Splash art file | `--intro-file` | `GACT_INTRO_FILE` | `intro_file` | baked-in |

(All wired in `tui/tui_runtime.go` + `tui/tui_preferences.go`.) Interactive-TUI flags are parsed only when no subcommand matched; each subcommand defines its own `--backend`. Other TUI flags: `--list-themes` (print and exit).

## 2. config.json key catalog

Struct: `tui/internal/config/config.go:25` (`Config`). Every field is pointer-typed (or a slice) — when adding a field, a value type breaks absent-vs-zero layering. Defaults below are what `gact emit-config` prints and what the code applies when the key is absent (numeric defaults verified in `tui/internal/ui/styles.go:101-117`).

| Key | Type | Default | Effect | Status |
|---|---|---|---|---|
| `backend_url` | string | `http://localhost:7777` | backend REST+SSE base URL | production |
| `name` | string | built-in brand | white-label product name: window title + splash wordmark | production |
| `workspace` | string | — | startup workspace id, exact name, or root path | production |
| `theme` | string | `dark` | color theme (see `gact theme list`) | production |
| `locale` | string | `en` | UI language: `en`/`es`/`ja` (+ `el` locale file exists) | production |
| `voice_command` | string | — | shell cmd whose stdout is audio/wav | production |
| `default_blueprint` | string | — | agent-blueprint id preselected on session create | production |
| `default_expert_pack` | string | — | expert-pack id preselected on session create | production |
| `collapse_threshold` | int | 5 | line count above which tool results collapse | production |
| `cost_warn_tokens` | int | 100000 | cost meter amber threshold (input tokens) | production |
| `cost_danger_tokens` | int | 150000 | cost meter red threshold | production |
| `sidebar_layout` | `{left:[],right:[]}` | `left:["sessions","context"]` (sample) | sidebar module order; unknown ids preserved so newer configs degrade visibly | `left` production; **`right` reserved** — struct comment: "Only Left is rendered today" |
| `paste_compress_threshold` | int | 3 | min line count for a paste to become `[pasted content: N lines]` | production |
| `disabled_tools` | []string | — | tool ids hidden from the catalog browser; today a TUI display filter only | production (display-only) |
| `intro_skip` | bool | false | suppress the splash screen | production |
| `mouse_enabled` | bool | true | terminal mouse reporting | production |
| `intro_file` | string | baked-in art | custom splash file (logo block, blank line, name block); relative paths resolve against `$XDG_CONFIG_HOME/gact/` | production |
| `intro_frame_delay_ms` | int | 90 | animated splash frame delay; clamped to [20,1000] at use site | production |
| `config_version` | int | (stamped 1) | schema generation for migrations | production, framework **dormant** |

19 keys as of 2026-07-06. Applied at startup by `applyStartupPreferences` (`tui/tui_preferences.go`); numeric keys only take effect when `> 0` — a zero/negative value silently keeps the default (documented behavior, not a bug to fix in passing).

**Round-tripping**: the TUI itself writes `config.json` — `app.SaveConfig` (`tui/tui_config_callbacks.go:14`) persists theme, locale, collapse/cost/paste thresholds, default blueprint/pack, intro_skip, mouse_enabled, disabled_tools, and sidebar layout when the user changes Settings. `Ctrl+L` in the TUI re-reads the file live (`app.ReloadConfig`); a changed `backend_url` reports "restart to apply". Hand-edits and TUI writes share the file — SaveConfig re-loads first to preserve keys it doesn't touch.

**Migrations**: `tui/internal/config/migrate.go` — `CurrentConfigVersion = 1`; the only migration stamps the version field. The framework is deliberately dormant (landed before the first breaking rename). Bump the constant + append a pure function when you rename/move a key.

## 3. Sibling files and registries (same directory as config.json)

All live under `$XDG_CONFIG_HOME/gact/` (default `~/.config/gact/`), each with a test-override env var:

| File | Written by | Read by | Override env | Source |
|---|---|---|---|---|
| `config.json` | user, TUI SaveConfig, `gact theme set` | everything | `GACT_CONFIG` (exact path) | `tui/internal/config/config.go` |
| `theme.json` | user (custom theme; `gact theme` CLI can export) | TUI at startup, non-fatal on parse error | `GACT_THEME_FILE` | `tui/internal/ui/theme_custom.go:168` |
| `detached.json` | TUI on Ctrl+Z detach | `gact detached`, `gact resume`; deduped by (backend, session_id), capped at 64 records | `GACT_DETACHED_PATH` | `tui/internal/config/detached.go` |
| `agents.json` | `gact agent deploy` | `gact connect <name>`, `gact agent list/stop`; records name/kind/bin/host/port/pid/cwd/log_path; name is primary key | `GACT_AGENTS_PATH` | `tui/internal/config/agents.go` |
| `plugins/<name>/plugin.json` | user/plugin installer | slash-command palette; manifest = `{name, version, description, commands:[{id (must start with /), title, description, command, args}]}`; bad manifests skipped with per-item errors | `GACT_PLUGINS_DIR` (whole dir) | `tui/internal/plugins/plugins.go` |

Plugin commands exec with `GACT_SESSION_ID` and `GACT_BACKEND` set in their environment (`tui/internal/ui/plugins_palette.go:94`).

## 4. Environment variables — full inventory

Grepped repo-wide (`os.Getenv`, `process.env`, `env::var`) on 2026-07-06. Grouped by consumer. "Prod" = part of normal operation; "diag/test" = only read by tests or diagnostic hooks.

### 4a. TUI (Go, `tui/`)

| Var | Purpose | Status | Consumer |
|---|---|---|---|
| `GACT_BACKEND` | backend URL (env layer) | prod | `tui_runtime.go`, `cli_backend.go` |
| `GACT_CONFIG` | exact config.json path | prod | `internal/config/config.go:135` |
| `GACT_THEME` / `GACT_WORKSPACE` / `GACT_LOCALE` / `GACT_VOICE_CMD` | env layer for those settings | prod | `tui_runtime.go` |
| `GACT_BRAND_NAME` | white-label product name (launcher-injected; the Go TUI does not read brand.json) | prod | `tui_runtime.go:64` |
| `GACT_BACKEND_LABEL` | human label for the backend shown in the header | prod | `tui_runtime.go:67` |
| `GACT_ATTACH_SESSION_ID` | attach straight into a session at boot (used by `gact attach`/launchers) | prod | `tui_runtime.go:71` |
| `GACT_NO_INTRO` (non-empty) / `GACT_INTRO_FILE` | splash skip / custom splash art | prod | `tui_preferences.go:45,58` |
| `GACT_THEME_FILE` | custom theme.json path override | prod | `internal/ui/theme_custom.go:169` |
| `GACT_AGENTS_PATH` / `GACT_DETACHED_PATH` / `GACT_PLUGINS_DIR` | registry-file overrides (see §3) | prod/test | `internal/config`, `internal/plugins` |
| `GACT_INSTALL_PATH` | agent-supplied path of the installed gact binary; `gact diag` flags a stale install | prod (embedding agents) | `cli_diag_install.go:55` |
| `GACT_AGENT_DEPLOY_STARTUP_TIMEOUT` | Go `time.ParseDuration` string (e.g. `90s`) overriding `gact agent deploy` port-bind wait (defaults: 3s in-repo adapters, 60s slow-start ones) | prod | `cli_agent_runtime.go:147` |
| `GACT_TUI_LATENCY_REPORT` | path; write an interaction-latency report on TUI exit | diag | `tui_runtime.go:81` |
| `GACT_WIRE_DUMP` / `GACT_RELOAD_DUMP` / `GACT_RELOAD_JSON` / `GACT_TUI_RENO_RENDER_AUDIT_OUT` / `GACT_RENDER_LM_CONFIG_ARTIFACT` | artifact-dump hooks inside `_test.go` files (wire replay, reload render, render audits) | test-only | `internal/ui/*_test.go` |
| `GACT_CLIPBOARD_FORCE_FAILURE=1` | force native-clipboard failure path | diag/test | `internal/ui/clipboard_native.go:27` |
| `XDG_CONFIG_HOME` / `XDG_DATA_HOME` | standard XDG dirs (config discovery; `gact man --install` target) | prod | `internal/config`, `cli_manual.go:45` |
| `GACT_SESSION_ID` + `GACT_BACKEND` | set BY the TUI when exec-ing plugin commands | prod (outbound) | `internal/ui/plugins_palette.go:94` |

### 4b. Emulator and adapters

| Var | Purpose | Status | Consumer |
|---|---|---|---|
| `GACT_EMULATOR_LOG_REQUESTS=1` | per-request logging in the emulator | diag | `emulator/internal/server/server.go:198` |
| `GACT_REAL_CLAUDE_SMOKE=1` | un-skip the claudecode adapter's real-CLI smoke tests (never run in CI) | test-only | `adapters/claudecode/smoke_test.go:30` |

### 4c. Build/verify knobs (Make variables + script env)

| Var | Purpose | Consumer |
|---|---|---|
| `PORT` (default 7777), `THEME` (`dark`), `TIMING` (`realistic`), `GO`, `GO_TEST_FLAGS` (`-timeout=20m`), `PREFIX`, `BINDIR`, `CLIO_GACT_BIN` | Make variables, not env vars — pass as `make run-emulator PORT=7811` | `Makefile:8-17` |
| `GACT_VERIFY_P` (default 1), `GACT_TEST_TIMEOUT` (default 15m) | parallelism/timeout for the canonical verify gate | `scripts/release-verify.sh:8-9` |

### 4d. Web app (`apps/web`) — build and test time

| Var | Purpose | Status | Consumer |
|---|---|---|---|
| `GACT_BRAND` | brand profile for the Playwright visual suite (defaults to `clio`; explicit value wins and disables server reuse). Set by `scripts/with-brand.mjs` for child processes; the actual build reads the generated `apps/brand.config.local.json`, not the env var | prod (test/build) | `apps/web/playwright.config.ts:9`, `apps/web/scripts/with-brand.mjs` |
| `CLIO_GACT_URL` | live-clio backend URL that gates/points the live visual specs | test | `apps/web/tests/visual/audit-helpers.ts:12`, `534-events.spec.ts` |
| `CLIO_LIVE_KEEP_SESSIONS=1` | keep live-test sessions instead of deleting (debug only) | test | `apps/web/tests/visual/ndp-live-helpers.ts:6` |
| `CLIO_HOOKS_DIR` | blocking-hook dir for the 534-events live spec | test | `apps/web/tests/visual/534-events.spec.ts` |
| `CLIO_CONTEXT_WORKSPACE` | workspace override for context-live spec | test | `apps/web/tests/visual/context-live.spec.ts:40` |
| `GACT_URL` | emulator URL for the agentview drive script (default `http://127.0.0.1:7777`) | test | `apps/web/tests/visual/drive-agentview-clean.mjs:11` |
| `CLIO_DEMO_*` (≈20 vars), `CLIO_EARTHSCOPE_*` (≈7), `CLIO_SSE_PROBE_*` (≈5), `CLIO_STREAM_AUDIT_LOG`, `CLIO_SSE_EVENT_LOG`, `CLIO_WEB_URL`, `CLIO_BACKEND_URL` | knob families for the demo/probe scripts under `apps/web/scripts/` and `tests/visual/drive-*.mjs`; audit-log vars must be set on the **clio process** at launch | demo/diag | grep `process.env.CLIO_` under `apps/` |

### 4e. Desktop (`apps/desktop`, Tauri)

| Var | Purpose | Status | Consumer |
|---|---|---|---|
| `GACT_URL` / `GACT_PORT` | attach-first probe override: full URL wins, else port, else the brand's `attachPort` (neutral default :17800). The env-var *names* are themselves brand-configurable (`attach_url_env`/`attach_port_env`) — a managed brand can rename them to `CLIO_*` | prod | `apps/desktop/src-tauri/src/supervisor_attach.rs:18-32`, `scripts/gen-brand-backend.mjs` |
| `GACT_REF` / `GACT_FORCE` | installer ref/force env names in the neutral brand backend block (brand-renameable, same mechanism) | prod | `gen-brand-backend.mjs:119-120` |
| `GACT_BUNDLED_RUNTIME_DIR` | override the bundled clio runtime directory | prod | `src-tauri/src/sidecar_setup.rs:8` |
| `CLIO_AUTH_TOKEN` | bearer token the Go sidecar-launcher passes to the spawned `clio-agent-gact` (also a docker-compose knob) | prod | `apps/desktop/sidecar-launcher/main.go:52`, `docker/docker-compose.yml:48` |
| `CLIO_REF` | clio-agent git ref for sidecar/runtime fetch scripts | build | `apps/desktop/scripts/fetch-sidecar.{sh,ps1}`, `build-clio-runtime.{sh,ps1}` |
| `CLIO_FORCE` | force reinstall in the supervisor install command | prod | `src-tauri/src/supervisor_install_command.rs` |
| `CLIO_AGENT_GACT_BIN` / `GACT_BIN` | local binary overrides for fetch-sidecar / build-clio-runtime | build | those scripts |
| `CLIO_GACT_URL`, `CLIO_PORT`, `CLIO_DESKTOP_APP`, `CLIO_DESKTOP_SCREENSHOT_DIR`, `CLIO_DESKTOP_BACKEND_URL`, `CLIO_DESKTOP_WORKSPACE_ID` | live/e2e test gates for the Rust HTTP/SSE tests and webview e2e | test | `src-tauri/src/gact_http_tests.rs`, `apps/desktop/tests/webview-e2e.test.mjs` |

### 4f. Docker (`docker/docker-compose.yml`)

`CLIO_API_PORT` (host port for the `api` profile, default 17800), `CLIO_WEB_PORT` (`web` profile, default 17800), `CLIO_LM_PROVIDER` / `CLIO_LM_MODEL` / `CLIO_LM_API_BASE` / `CLIO_LM_API_KEY`, `CLIO_AUTH_TOKEN`. Without `CLIO_LM_*` the containerized agent runs capability-only and chat returns 503 `agent:unavailable` (expected, per `docker/README.md`).

`CLIO_*` vars consumed by the clio process itself (`CLIO_LM_PROVIDER`, `CLIO_ALLOWED_ROOTS`, `CLIO_STREAM_AUDIT_LOG`, ...) are defined in the external clio-agent repo — see gact-run-and-operate for the launch recipe; this catalog only covers what this repo reads.

## 5. Emulator flag catalog

Source: `emulator/cmd/emulator-server/main.go:35-101`. Exactly **31 flags** as of 2026-07-06 (verified by building and running `--help`). Rebuild + inspect:

```powershell
go build -o emulator/emulator-server.exe ./emulator/cmd/emulator-server
./emulator/emulator-server.exe --help
```

### Core

| Flag | Default | Effect |
|---|---|---|
| `--port` | 7777 | listen port |
| `--timing` | `realistic` | scenario pacing: `fast` \| `realistic` (tests want `fast`) |
| `--scenario` | `default` | **RESERVED / non-functional** — accepted, logged, but does not select scripts (`emulator/internal/server/server.go:19`: "Reserved for the scenario engine in PLAN A11"). Behavior is actually selected by the boolean flags below plus keyword routing on user-message text in `emulator/internal/scenario/default_script.go` |
| `--replay-file` | — | stream a captured SSE wire file to each session instead of the scripted scenario |

### Seeding

| Flag | Default | Effect |
|---|---|---|
| `--seed-workspace` | `true` | create `ws_default` at `/tmp/gact-emulator-workspace` |
| `--seed-workspaces` | — | extra workspaces, `name:/path,name:/path` (splits on the FIRST colon per entry) |
| `--seed-sessions` | — | `ws_id=N,...` — N sessions per workspace with deterministic IDs `ses_seed_<wsID>_<n>` |
| `--seed-messages` | — | `ses_id=N,...` — **N is turn PAIRS**: N=3 seeds 6 messages (3 user + 3 assistant) |
| `--walk-files` | false | serve real files from workspace RootPath for `GET /v1/workspaces/{id}/files` instead of the static demo list |
| `--active-agent-blueprint` | — | stamp seeded sessions with this active blueprint id |

**TRAP**: malformed `--seed-*` input is `log.Fatalf` — the emulator refuses to boot rather than start with a partial seed. If your emulator "won't start", read its first stderr line.

### Deterministic demo / failure-mode toggles (all default false; all production surface for visual-loop demos and tests)

Empty catalogs: `--empty-expert-packs`, `--empty-prompts`, `--empty-skills`, `--empty-tools`, `--empty-mcp-connections`.
Failure injection: `--expert-pack-failures`, `--prompt-save-failures`, `--agent-blueprint-failures`, `--agent-failures`, `--cancel-failures`, `--session-create-failures`, `--session-rename-failures`, `--context-add-failures`.
Stress/overflow fixtures: `--prompt-stress`, `--permission-stress`, `--long-commands`, `--long-agent-blueprints`, `--long-agents`.
Other states: `--memory-unavailable`, `--provider-edge-states`, `--provider-auth-succeeds` (makes the edge-state ALCF auth succeed).

Runtime scenario selection is keyword routing on the user's message text (e.g. "delete /drop " → dangerous-permission flow, "earthscope sac demo", "route this" → routing_decision demo) — see `emulator/internal/scenario/default_script.go` and gact-run-and-operate.

## 6. Capability flags as configuration

Backends advertise features in `GET /v1/capabilities` → `CapabilityFlags` (`emulator/pkg/gact/types.go:155`). The TUI treats these as remote config: features are gated at dozens of sites on `caps.Capabilities.<Flag>` (grep count ~80 non-test references in `tui/internal/ui` as of 2026-07-06, about half of them the doctor table itself).

**The authoritative flag → UI-surface mapping is `tui/internal/ui/doctor_capability_rows.go`** — one row per flag with the exact UI feature it gates and a support tier (`capUIFull`/`capUIGated`/`capUIPartial`/`capUINotSurfaced`). Read that file instead of re-deriving; it is rendered by the TUI's doctor overlay.

Standard flags (v0.1 + v0.2), as of 2026-07-06: `workspaces, sessions, subagents, mcp, lsp, files, diffs, permissions, providers, commands, voice, scheduled_sessions, hooks, session_tasks, metrics, session_branching, session_sharing, session_export, session_summary, attachments_upload, multimodal_image_parts, cost_tracking, thinking_blocks, edit_modes, plan_mode, search_messages, agent_write, skills_extraction, agent_routing, memory, structured_errors, integration_health, tool_telemetry`.

CLIO vendor extensions (`x_clio_*`): `x_clio_cancellation` (string), `x_clio_executor_cancellation`, `x_clio_text_streaming` (string), `x_clio_synthetic_posthoc_streaming`, `x_clio_stream_fallback_reasons` (map), `x_clio_direct_delete_permissions`, `x_clio_prompt_registry`, `x_clio_expert_packs`, `x_clio_agent_blueprints`, `x_clio_user_questions`, `x_clio_retry_attempts`, `x_clio_context_frames`, `x_clio_semantic_events`, `x_clio_semantic_trace_backend` (string), `x_clio_semantic_trace_detail` (string), `x_clio_hook_backend` (string), `x_clio_hook_events` (map), `x_clio_files_content`, `x_clio_capability_gaps` (map), `x_clio_context_state`.

Concrete gate examples (verified): startup only calls `ListWorkspaces` when `capabilities.workspaces` is true — clio-agent-gact advertises false and 501s that route (`tui/internal/ui/app_commands.go`, marker CLIO-BBBBBBBBBB14); the memory chip/inspector gates on `memory`; prompt browsing on `x_clio_prompt_registry`; the per-expert context view on `x_clio_context_state`.

Rules when touching this surface:
- Adding/changing a capability flag is a **wire change**: spec first (`contract/SPEC.md` §3.2/3.3 + conformance suite), then emulator, adapters, clients — see gact-change-control and gact-wire-protocol-reference.
- Never fake a capability client-side or paper over a missing one with client semantics; capability honesty across TUI/web/desktop is the project's stated hardest problem (see gact-interface-parity-campaign).

## 7. Web app knobs (`apps/web`)

### URL query parameters (parsed in `apps/web/src/AppRouteModel.ts` and `routes/splashModel.ts`)

| Param | Values | Effect |
|---|---|---|
| `?backend=` | URL | backend for the chat route; default `http://localhost:17800` |
| `?route=` | `chat` \| `connect` \| `settings-backends` \| `settings` \| `add-remote` \| `splash` | initial route |
| `?hold=1` | — | hold the splash (don't auto-proceed) |
| `?install=demo` | — | splash install-demo mode |

Splash auto-probe default: `PURE_WEB_DEFAULT_BACKEND = http://localhost:17800`, 2.5s probe timeout (`splashModel.ts:9-10`). **[this machine]** the instrumented dev clio usually runs on :17801, so pass `?backend=http://127.0.0.1:17801` explicitly — the splash will not find it on its own.

### localStorage keys (all `clio.*`-prefixed regardless of brand; enumerated from `apps/web/src` 2026-07-06)

`clio.backends.v1` (saved backend list) · `clio.selected-workspace.v1` · `clio.sessions-open.v1` · `clio.session-defaults.blueprint-id.v1` · `clio.session-defaults.expert-pack-id.v1` · `clio.theme.mode.v1` · `clio.theme.preset.v1` · `clio.theme.tokens.v1` · `clio.density.v1` · `clio.locale.v1` · `clio.notif-prefs.v1` · `clio.plugins.v1` · `clio.palette-frecency.v1` · `clio.onboarding-done.v1` · `clio.splash.intro.v1` · `clio.inspector-open.v1` · `clio.inspector.tab.v1` · `clio.preview-rail-open.v1` · `clio.rail-expanded.v1` · `clio.detached.<backendUrl>` (per-backend detached sessions) — plus dynamic composer draft/history keys (`apps/web/src/components/ComposerState.ts`).

To reset web UI state during debugging, clear these rather than guessing which one holds the stale value; `clio.backends.v1` is the usual suspect for "it keeps connecting to the wrong backend".

### Brand builds

`pnpm --dir apps/web build:clio` / `build:gact` run `node scripts/with-brand.mjs <brand> build`, which (1) writes gitignored `apps/brand.config.local.json` `{profile, brandingRoot}` — for `clio` it prefers the external `../clio-agent/branding` if `clio/brand.json` exists there, else falls back to in-repo `branding` — and (2) sets `GACT_BRAND=<brand>` for the child. The vite build consumes the config file (via `apps/web/vite-plugin-brand.ts` / `@brand` alias), not the env var. Full brand-system detail: gact-web-rendering-reference. Desktop brand/backends: `apps/desktop/scripts/gen-brand-backend.mjs` (kept literally in sync with the vite plugin; neutral default = connect-mode, attach :17800, no installer).

## 8. How to add a config option (checklist)

Route the change through gact-change-control first. Then:

1. **Classify it.** Client display preference → `config.json`. Anything that filters, dedups, or reinterprets backend data is server semantics and does NOT belong in client config — GACT is a generic interface to many agents; one agent's semantics in the client breaks the others (owner doctrine; see gact-working-discipline).
2. **Pick the layers.** Most options need only a config key. Add env/flag layers only when launchers or scripts must set it per-invocation.
3. **Add a pointer-typed field** to `Config` in `tui/internal/config/config.go` with `json:"snake_case,omitempty"` and a comment explaining default + semantics (house style: every field there has one).
4. **Wire it**: strings through `config.Resolve` in `tui/tui_runtime.go`; numeric/bool applied in `applyStartupPreferences` (`tui/tui_preferences.go`), guarding `nil` and documenting what zero means. If a flag exists, remember the flag==default trap (§1) — mention it in the flag's help string if it bites.
5. **Persistence + live reload**: if the Settings UI can change it, extend `app.SaveConfig` and `app.ReloadConfig` in `tui/tui_config_callbacks.go` (SaveConfig must keep preserving untouched fields via the load-first pattern).
6. **Surface it in the inspection commands**: `tui/cli_emit_config.go` (sample with default) and, if resolvable, `gact env` (`tui/cli_local_config.go`) + the env list in `tui/cli_diag_report.go` if you added an env var.
7. **No silent fallback**: invalid values get a stderr warning with a structured reason, or a documented clamp (pattern: `intro_frame_delay_ms` clamps to [20,1000]) — never a silent default substitution.
8. **Tests**: `tui/internal/config/config_test.go` for load/layering; a resolution regression test in the style of `tui/cli_backend_test.go` if CLI-visible.
9. **Docs**: `docs/FEATURES.md` (the CLI/config doc of record — it documents every key and command). If the option is UI-visible, the change ends with a fresh screenshot (CLAUDE.md rule 2).
10. **Breaking rename?** Bump `CurrentConfigVersion` and append a pure migration in `tui/internal/config/migrate.go`.
11. **Capability-shaped option?** Then it isn't client config at all — start in `contract/SPEC.md` + conformance (§6 above).

## When NOT to use this skill

- **Starting/stopping the emulator, TUI, clio, web, or desktop; ports; teardown** → gact-run-and-operate (this skill tells you what the knobs mean, not how to run the stack).
- **Build/toolchain problems** (go.work, Makefile coverage gaps, pnpm/uv/vhs versions, CI) → gact-build-and-env.
- **What a capability flag means on the wire / endpoint shapes / SSE envelope** → gact-wire-protocol-reference; load-bearing design rationale → gact-architecture-contract.
- **Brand system internals, rendering, Live engine** → gact-web-rendering-reference.
- **Whether a change is allowed and how it's gated** → gact-change-control.
- **A setting is being ignored and you've already checked §1's precedence + trap** → gact-debugging-playbook.
- **Writing TUI code that consumes these settings** → gact-bubbletea-reference.

## Provenance and maintenance

Verified against the working tree on 2026-07-06 (branch `develop`, HEAD `c66b885f`). Re-verify before trusting any table row that may have drifted (Git Bash for the grep one-liners):

| Claim | Re-verify with |
|---|---|
| Backend precedence + flag==default trap | `sed -n 148,168p tui/internal/config/config.go` |
| Config discovery order | `sed -n 131,146p tui/internal/config/config.go` |
| resolveCLIBackend + warning | `cat tui/cli_backend.go` |
| config.json key list | `grep -n 'json:"' tui/internal/config/config.go` |
| Numeric defaults (5/100k/150k/3) | `grep -n 'CollapseThreshold = \|CostWarnTokens = \|CostDangerTokens = \|PasteCompressThreshold = ' tui/internal/ui/styles.go` |
| Sample defaults | `./tui/gact emit-config` (build first: `go build -o tui/gact.exe ./tui`) |
| Emulator flag count/list (31) | `go build -o emulator/emulator-server.exe ./emulator/cmd/emulator-server; ./emulator/emulator-server.exe --help` |
| `--scenario` still reserved | `sed -n 18,22p emulator/internal/server/server.go` |
| Go env-var inventory | `grep -rhoE 'os\.Getenv\("[A-Z_0-9]+"\)' tui emulator adapters contract --include='*.go' \| sort -u` |
| Apps env-var inventory | `grep -rhoE 'process\.env\.[A-Z_0-9]+' apps/core apps/web apps/desktop \| sort -u` (from repo root) |
| Capability flag list | `sed -n 155,222p emulator/pkg/gact/types.go` |
| Capability→UI mapping | `sed -n 30,95p tui/internal/ui/doctor_capability_rows.go` |
| Web query params | `grep -n 'searchParams.get' apps/web/src/AppRouteModel.ts apps/web/src/routes/splashModel.ts` |
| localStorage keys | `grep -rhoE "'clio\.[a-z0-9.\-]+" apps/web/src \| sort -u` |
| Brand build mechanism | `cat apps/web/scripts/with-brand.mjs` |
| Desktop attach env | `sed -n 16,33p apps/desktop/src-tauri/src/supervisor_attach.rs` |
| Docker knobs | `grep -n 'CLIO_' docker/docker-compose.yml` |
| Sibling registries | `ls tui/internal/config/` and headers of `agents.go` / `detached.go`; `head -30 tui/internal/plugins/plugins.go` |
| Cited commit | `git log --format='%h %s' -1 5be7b74a` |
