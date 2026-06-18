# Handoff - 2026-06-17 Web/Desktop Polish

## Context

Branch: `feat/0.8.4-web-desktop-polish`

Latest pushed checkpoint: `2ac8da27`

Current working tree after that checkpoint contains a small follow-up harness
change and refreshed desktop WebView screenshots described in the final section
of this document.

Primary objective: continue the 0.8.4 interface parity and polish pass by driving the real CLIO system, capturing screenshots/evidence, fixing UX gaps found through use, and keeping blocked backend semantics filed against `iowarp/clio-agent`.

Priority correction from the user: the terminal TUI is the core product and release-critical path. Web and desktop are secondary add-ons. Do not let web/desktop polish consume the release gate before the terminal TUI build, tests, visual corpus, and installed `clio` launch path are current.

Important constraint: do not touch the shared developer CLIO runtime on `127.0.0.1:17960`. Use owned CLIO backends and owned workspaces only.

Important local file: `docs/handoff-2026-06-10.md` is untracked and must not be deleted.

Persistent operating rules: see `docs/agent-operational-memory.md`. That file
is the short checklist for CLIO ownership, EarthScope/NDP configuration,
permissions, ALCF assumptions, and live evidence discipline before starting any
new real-system run.

## Live CLIO Run Assumptions To Preserve

These are working assumptions from repeated user/dev-team corrections and must
be treated as harness requirements, not rediscovered as backend bugs:

- EarthScope/NDP works on this machine. If a gact-tui live gate hits
  `_UnsupportedSessionAgent`, assume the gact-tui harness misconfigured the
  workspace, blueprint, or MCP tool composition until proven otherwise.
- For EarthScope/NDP live proof, run an owned CLIO backend with the known-good
  ALCF-backed configuration. ALCF `gemma-4` and `gpt-oss` cells are expected to
  pass when the session is configured correctly.
- Permission prompts are intentional product semantics. Leave permissions
  enabled when validating UI behavior so the web/desktop/TUI approval surface is
  exercised and screenshotted. Disable them only for an explicitly separate
  non-permission benchmark pass.
- Do not use `/v1/tools` or `/v1/mcp/handshake` as proof that child-expert
  tools are composed. The proof is that the workspace-bound session with the
  active blueprint actually starts the declared MCP servers and the child expert
  calls the prefixed tools.
- For the current CLIO gateway discovery behavior, the EarthScope live gate must
  install the marketplace blueprint consistently into the backend's active
  config/discovery scope before binding the session. Global install on the owned
  backend has proven to compose the pack MCP tools; workspace-only install did
  not.
- Successful live-gate sessions are archived by default after screenshots and
  evidence are written. Use `CLIO_LIVE_KEEP_SESSIONS=1` only when a session
  should remain in the active rail for debugging.

## Active Goal

Autonomously drive the web UI and desktop UI against owned real CLIO backends, using the current CLIO-agent semantics and marketplace benchmark workflows, until the 0.8.4 web/desktop parity pass has concrete evidence for:

- live session streaming and permission handling,
- real NDP/EarthScope marketplace workflow behavior,
- workspace file refresh and artifact preview behavior,
- markdown, code, image, and diff rendering,
- MCP/tool/workflow activity presentation,
- settings, backend switching, and remote/backend management UX,
- desktop webview parity and native shell smoke coverage,
- brand-neutral GACT defaults plus CLIO-specific branding paths,
- documented upstream blockers when CLIO-agent semantics are missing or malformed.

The goal is not only to add tests. The goal is to use the system like a demo user would, inspect screenshots, fix UX/presentation issues found through that use, and leave reproducible evidence for what is working versus what is blocked upstream.

## Terminal TUI Release Status - 2026-06-17

The terminal TUI was re-centered as the primary release surface after the web/desktop pass. Current status from `/home/jcernuda/gact-tui`:

- Fresh terminal binary built and installed with `make dev-install`.
- `/home/jcernuda/.local/bin/gact` and `/home/jcernuda/.local/share/clio/gact` both symlink to `/home/jcernuda/gact-tui/tui/gact`.
- `clio` therefore launches the current rebuilt terminal TUI when it attaches through the installed CLIO wrapper.
- Stale owned desktop sidecar helper processes on ports `41559`, `45877`, and `44811` were stopped. No known gact-tui helper backend remains from this pass.

TUI checks run:

```bash
go build -p 1 -o tui/gact ./tui
go build -p 1 -o .tools/emulator-server ./emulator/cmd/emulator-server
go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact -count=1
go test -p 1 ./tui/internal/client ./tui/internal/config ./tui/internal/intro ./tui/internal/plugins ./tui/internal/ui ./emulator/cmd/emulator-server ./emulator/internal/events ./emulator/internal/scenario ./emulator/internal/server ./emulator/internal/store ./emulator/pkg/gact -count=1
go test -p 1 ./tui -count=1 -v -timeout=12m
python3 visual_loop/check_visual_corpus.py --root .
python3 visual_loop/check_tui_latency_readiness.py --root . --write-report visual_loop/screenshots/tui_latency_readiness.report.md
python3 visual_loop/check_copy_selection_readiness.py --root . --write-report visual_loop/screenshots/copy_selection_readiness.report.md --strict
python3 visual_loop/check_diagnostics_readiness.py --root . --write-report visual_loop/screenshots/diagnostics_readiness.report.md --strict
python3 visual_loop/check_release_0_8_3_readiness.py --root . --write-report visual_loop/screenshots/release_0_8_3_readiness.report.md --strict
python3 visual_loop/check_live_lifecycle_readiness.py --root . --write-report visual_loop/screenshots/live_lifecycle_readiness.report.md --strict
python3 visual_loop/check_agent_blueprint_marketplace_readiness.py --root . --write-report visual_loop/screenshots/agent_blueprint_marketplace_readiness.report.md --strict
python3 visual_loop/check_ndp_demo_readiness.py --root . --write-report visual_loop/NDP_DEMO_VISUAL_READINESS.md
vhs visual_loop/tapes/codex_semantic_timeline_uiux.tape
```

Results:

- TUI build: passed.
- Emulator build: passed.
- Focused TUI/client/emulator tests: passed.
- Non-top-level TUI/emulator package matrix: passed.
- Full top-level CLI integration package `./tui`: passed in `603.690s`.
- Visual corpus: passed with all `734` indexed artifacts present and no unindexed artifacts.
- Maintained TUI latency readiness: passed; strict live active-stream proof remains deferred.
- Maintained copy/selection readiness: passed; real terminal permutation checklist remains deferred.
- Maintained diagnostics readiness: passed; real CLIO partial-gap/active-stream metrics screenshots remain deferred.
- Maintained lifecycle/marketplace readiness: deterministic proof passed; live owned-backend lifecycle manifests remain deferred.
- NDP demo readiness: CLIO artifact proof, deterministic TUI proof, and real still captures exist for all four cases; short GIFs and live-run streaming manifests remain missing.
- Refreshed `visual_loop/screenshots/codex_semantic_timeline_tool_result.png`; current footer no longer shows cost/token counters, thinking is collapsed behind `Ctrl+E`, and tool output is rendered as compact code evidence.

Current TUI release interpretation:

- The terminal TUI is release-candidate strong on maintained deterministic tests, CLI integration, and visual corpus.
- Remaining TUI gaps are not newly broken UI paths; they are live proof backlogs: real terminal copy permutations, active-stream CLIO diagnostics/latency, marketplace/runtime live lifecycle manifests, and NDP short GIF + streaming manifests.
- Those live gaps should be tracked as release-planning evidence work unless the specific release requires strict live proof before tagging.

## Web/Core/Desktop Add-On Status - 2026-06-17

After the terminal TUI pass, the secondary web/core/desktop add-on gates were
rerun from the same dirty checkout.

Core:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/core test
npm exec --yes pnpm@9.15.9 -- --dir apps/core typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/core lint
```

Results: `50` core tests passed, `4` live-CLIO tests remained intentionally
skipped, typecheck passed, lint passed.

Web:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results: `286` web unit tests passed, typecheck passed, lint passed, CLIO brand
visual audit passed `7/7` from a production build.

Desktop:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop lint
cd apps/desktop/src-tauri && cargo test
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
```

Results: desktop JS smoke passed `7/7`, desktop typecheck/lint no-op guards
passed, Rust/Tauri tests passed `31/31`, and the debug Tauri build succeeded at
`apps/desktop/src-tauri/target/debug/clio-desktop`.

Native WebView e2e status:

```bash
command -v tauri-driver
command -v WebKitWebDriver || true
command -v webkit2gtk-driver || true
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Earlier result: `tauri-driver` exists at `/home/jcernuda/.cargo/bin/tauri-driver`,
and the debug app exists, but Linux native WebDriver was missing from `PATH`
(`WebKitWebDriver` / `webkit2gtk-driver` not found). That blocked the gated
WebView test.

Later continuation removed that local environment blocker without installing
system packages: downloaded `webkit2gtk-driver` into
`tmp/webkit-driver-local/` with `apt-get download webkit2gtk-driver` and
extracted `root/usr/bin/WebKitWebDriver`. The real native WebView test then
passed under Xvfb against an owned CLIO backend.

Most recent inspected desktop screenshot:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current-returning.png`

It shows the native menu, left session rail, centered empty-chat/composer state,
and no obvious regression to the older settings-heavy two-column shell.

Native WebView permission proof:

```bash
TAURI_E2E=1 \
TAURI_NATIVE_DRIVER=/home/jcernuda/gact-tui/tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:17800 \
CLIO_DESKTOP_WORKSPACE_ID=ws_532054c4877f \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
xvfb-run -a npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: passed 1/1. This exercised the actual Tauri WebView, Rust HTTP bridge,
Rust SSE bridge, real CLIO backend on an owned `17800`, and permission-card
render/deny/clear flow.

Screenshots:

- `apps/web/screenshots/audit/desktop-webview-chat.png`
- `apps/web/screenshots/audit/desktop-webview-permission.png`

Backend audit proof:

- `GET /v1/permissions?status=all` included
  `perm_89ac87bbb8dd`, session `sess_bd6fe1c16e47`, tool `shell_bash`, command
  `rm -rf /tmp/gact-desktop-permission-probe-do-not-exist`, status
  `resolved`, action `deny`.
- The test archives the disposable probe session and deletes the disposable
  probe agent after the run.

## Fresh Owned-Backend Web Workflow Proof - 2026-06-17

Ran a new live web workflow pass against two isolated no-agent CLIO backends:

- Backend A: `http://127.0.0.1:18242`
- Backend B: `http://127.0.0.1:18243`
- Run root: `/home/jcernuda/gact-tui/tmp/live-web-proof-20260617-182652`
- Backend A workspace: `/home/jcernuda/gact-tui/tmp/live-web-proof-20260617-182652/a/workspace`
- Backend B workspace: `/home/jcernuda/gact-tui/tmp/live-web-proof-20260617-182652/b/workspace`
- Both backends used isolated XDG config/state/cache/data dirs and
  `CLIO_GACT_CORS_ORIGINS='*'`.

Command:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18242 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18243 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/live-web-proof-20260617-182652/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  tests/visual/overnight-real-brand-settings.spec.ts \
  --workers=1
```

Final result: `15/15` passed from a production web build.

Covered live surfaces:

- CLIO branding and Settings backend probe/select flow
- workspace switcher filtering by live workspace id
- Add Remote backend save + automatic activation
- switching between two real backend processes
- Settings open/return flow
- workspace markdown preview and explicit file refresh for agent-created files
- slash command dispatch (`/cache-stats`)
- unified live catalog search
- MCP server detail, install, reconnect, delete
- live prompt draft validation/save
- expert-pack install/update/delete
- agent-blueprint install/delete
- blueprint source add/refresh/remove
- diagnostics Metrics/Doctor/Memory pages
- hooks and policies round-trip

Issue found and fixed in the proof:

- The diagnostics visual test treated `GET /v1/health` non-2xx as a fetch
  failure. CLIO correctly returns `503` with useful JSON when a no-agent backend
  is degraded. The test now uses a diagnostics-specific JSON fetch helper that
  preserves degraded-health responses instead of aborting before the UI is
  exercised.

Verification after the patch:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live diagnostics" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
```

Results: focused diagnostics proof passed, full live suite passed `15/15`, and
web lint passed.

Inspected screenshot:

- `apps/web/screenshots/audit/overnight-real-diagnostics-doctor.png`

The Doctor page now visibly preserves degraded-backend semantics: overall
`unavailable`, `api`/`sessions` ready, `agent`/`lm` unavailable, and `memory`
degraded.

Cleanup: the two owned CLIO backend processes on ports `18242` and `18243` were
stopped after the proof. No shared CLIO runtime was touched.

## NDP/EarthScope Artifact Preview Refresh - 2026-06-17

Refreshed the real NDP/EarthScope artifact preview proof against the owned CLIO
backend on `127.0.0.1:18190` and workspace
`/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace`.

Important finding: the pre-existing owned `18190` server was stale. It served the
generated PNG as corrupt `text/plain` bytes, and the web UI correctly showed a
diagnostic instead of rendering the corrupted payload. Restarting only the owned
`18190` process from the current CLIO checkout fixed the contract:
`/v1/workspaces/ws_7e94a19828b6/files/read?path=MTA1.CI.LY_.30_plot.png`
returned `200 image/png` with `179653` bytes, matching the file listing.

Refreshed command:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result: `1/1` passed from a production CLIO-branded web build.

Inspected evidence:

- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`: real generated
  EarthScope/GNSS plot renders as an image.
- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png`: small
  station CSV renders inline.
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png`: 48.1 MB CSV
  is intentionally blocked from inline rendering.
- `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json`: plot outcome
  is `image`, natural size `2964x1406`.

Interpretation: the web preview rail is compatible with the CLIO 0.5.3
binary-read fix. The older diagnostic screenshot was not a current web bug; it
was a stale backend instance still serving the pre-fix file-read contract.

## Session Defaults And Ctrl+B Cross-Surface Proof - 2026-06-18

Follow-up to the user request that the blueprint/expert-pack default semantics
exist in Settings and that `Ctrl+B` opens the new-session/session-semantics
picker across the three interface surfaces.

Implementation correction from this pass:

- Desktop native menu no longer reserves `CmdOrCtrl+B` for “Toggle Sessions
  Column”. That accelerator moved to `CmdOrCtrl+Shift+B`, allowing the shared
  web/desktop key handler to receive `CmdOrCtrl+B` and open the session
  semantics picker.

Focused verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- \
  tests/unit/SessionSemantics.test.ts \
  tests/unit/SessionDefaultsSection.test.tsx --run

npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test

cd apps/desktop/src-tauri && cargo test menu::tests

go test -p 1 ./tui/internal/ui -run 'TestSessionSetup' -count=1
```

Results:

- Web session-defaults unit tests passed `4/4`.
- Desktop smoke tests passed `7/7`.
- Desktop native menu contract tests passed `7/7`.
- Terminal TUI session-setup focused tests passed.

Real-backend visual proof:

Started two fresh owned current CLIO no-agent backends with isolated state:

- Backend A: `http://127.0.0.1:18260`
- Backend B: `http://127.0.0.1:18261`
- Run root:
  `/home/jcernuda/gact-tui/tmp/session-semantics-proof-20260618-022642`

Direct API sanity check proved these current backends persist created sessions:
`POST /v1/sessions` followed by `GET /v1/sessions` returned the new session.

Reran the focused visual proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18260 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18261 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/session-semantics-proof-20260618-022642/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  --grep "session defaults and Ctrl\\\\+B" --workers=1
```

Result: `1/1` passed from a production CLIO-branded web build.

Inspected screenshots:

- `apps/web/screenshots/audit/overnight-real-session-defaults-settings.png`
  shows Settings -> Session defaults with blueprint and expert-pack defaults.
- `apps/web/screenshots/audit/overnight-real-session-semantics-modal.png`
  shows the `Ctrl+B` new-session semantics picker on a live backend.

Additional finding: older owned backend `127.0.0.1:18176` was stale and unsuitable
for this proof. It returned a session from `POST /v1/sessions`, but
`GET /v1/sessions` returned an empty list immediately after. Fresh current
backends did not reproduce that issue.

## Desktop Native Shell Refresh - 2026-06-18

Rebuilt the debug desktop binary after the native menu accelerator correction:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
```

Result: succeeded and produced
`apps/desktop/src-tauri/target/debug/clio-desktop`.

Captured a current native Linux WebKitGTK/Xvfb screenshot against a fresh owned
current CLIO no-agent backend:

- Backend: `http://127.0.0.1:18262`
- Run root:
  `/home/jcernuda/gact-tui/tmp/desktop-xvfb-proof-20260618-023145`
- Screenshot:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-ctrlb-current.png`

Command:

```bash
xvfb-run -a -s '-screen 0 1440x900x24' sh -lc \
  'env XDG_CONFIG_HOME=... XDG_STATE_HOME=... XDG_CACHE_HOME=... XDG_DATA_HOME=... \
   CLIO_PORT=18262 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
   WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 \
   apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; \
   sleep 18; \
   import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-ctrlb-current.png; \
   kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Inspection:

- The native menu bar appears (`File`, `Edit`, `View`, `Help`).
- The CLIO-branded shared web UI loads inside the native shell.
- The app attaches to the owned backend and shows the seeded session row.
- Because the WebKit profile was fresh, the first-run onboarding tour is visible.
  That is expected for this capture; the full WebView e2e harness normally marks
  the profile as returning-user before steady-state screenshots.

Desktop WebView e2e status from current state:

```bash
TAURI_E2E=1 npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: skipped with `missing native WebDriver`. `tauri-driver` is installed, but
Linux `WebKitWebDriver` / `webkit2gtk-driver` is still absent in this WSL
environment, so the real WebView click/permission proof remains an environment
gap rather than a failing app assertion.

## Web Operational Flow Refresh - 2026-06-18

Ran focused real-web operational proofs against two fresh owned current CLIO
no-agent backends:

- Backend A: `http://127.0.0.1:18263`
- Backend B: `http://127.0.0.1:18264`
- Run root:
  `/home/jcernuda/gact-tui/tmp/web-operational-proof-20260618-023610`

Direct API sanity check confirmed both fresh backends persist created sessions:
`POST /v1/sessions` followed by `GET /v1/sessions` showed the new row on each
backend.

Command:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18263 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18264 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/web-operational-proof-20260618-023610/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  --grep "switches between two|settings and refreshes|slash command|searches the live unified catalog" \
  --workers=1
```

Result: `4/4` passed from a production CLIO-branded web build.

Covered:

- Switching between two real backend registries without leaking sessions across
  backends.
- Settings backend page visibility during a live backend session.
- Workspace file preview and manual refresh for a file created after the session
  opened.
- `/cache-stats` slash command dispatch to
  `/v1/sessions/{id}/commands/cache-stats`.
- Unified catalog search across Agents, Commands, MCP servers, Prompts, and
  Workspaces.

Inspected screenshots:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`
- `apps/web/screenshots/audit/overnight-real-catalog-all.png`
- `apps/web/screenshots/audit/overnight-real-catalog-filtered.png`

Issue found and fixed:

- When no session was selected, the file rail said “No workspace for this
  session” while the topbar said “No session.” This was accurate but confusing.
  `PreviewRail` now says “Select a session to browse workspace files.”

Verification after the fix:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/PreviewRail.test.tsx --run
CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "switches between two" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
git diff --check
```

Results: PreviewRail unit tests passed `23/23`, refreshed backend-switch visual
proof passed `1/1`, web typecheck passed, web lint passed, and `git diff --check`
passed.

## Owned Backends Used

- `http://127.0.0.1:18176`: real agent-backed CLIO workspace for general UI validation.
- `http://127.0.0.1:18177`: no-agent/no-LM CLIO workspace for first-impression and error-state UX.
- `http://127.0.0.1:18190`: owned NDP/EarthScope CLIO workspace for marketplace blueprint, artifacts, and permission-path work.

Process check at handoff time found no lingering `playwright`, `clio-desktop`, `Xvfb`, `xvfb-run`, `vite preview --port 4173`, `vitest SettingsDepth`, or `tsc` processes.

## Work Completed

### CLIO-Agent 0.5.3 Interface Adaptation

Read `/home/jcernuda/clio-agent/docs/INTERFACE_CHANGES_0.5.1-0.5.3.md` and `/home/jcernuda/clio-agent/docs/TUI_ADAPTATION_0.5.x.md`, then re-probed the previously blocked surfaces against a fresh owned 0.5.3 backend.

Fresh backend used for contract probes:

```bash
CLIO_GACT_CORS_ORIGINS='*' \
XDG_CONFIG_HOME=/tmp/gact-053-contract-.../config \
CLIO_ALLOWED_ROOTS=/tmp/gact-053-contract-.../workspace:/home/jcernuda/clio-agent/external/clio-agent-marketplace \
CLIO_SEMANTIC_TRACE_BACKEND=file \
CLIO_SEMANTIC_TRACE_PATH=/tmp/gact-053-contract-.../trace \
/home/jcernuda/clio-agent/.venv/bin/clio-agent-gact --host 127.0.0.1 --port 18210 --no-agent
```

Verified live on that backend:

- `GET /v1/workspaces/{id}/files/read?path=plot.png` returns `Content-Type: image/png` and byte-for-byte PNG content.
- `GET /v1/workspaces/{id}/files/read?path=README.md` returns `text/plain; charset=utf-8`.
- `POST /v1/expert-packs/install` installs a loose pack and returns `kind: "pack"`.
- `POST /v1/expert-packs/{id}/update` succeeds when the body includes `scope: "workspace"` and `workspace_id`.
- `DELETE /v1/expert-packs/{id}?scope=workspace&workspace_id=...` succeeds.
- `GET/POST /v1/agent-blueprints/sources` and source refresh work against the local marketplace.
- `CLIO_GACT_CORS_ORIGINS='*'` produces a successful browser preflight for the SSE origin.
- `POST /v1/mcp/servers/{id}/reconnect` exists and returns the expected structured 404 for bundled/non-externally-installed MCP rows.

Interface changes made:

- TUI `AgentBlueprintDefinition` wire type now preserves the new `kind` field.
- TUI `/expert-packs` merges `kind:"pack"` rows from `/v1/agent-blueprints` into expert-pack listings, so installed packs are visible even when legacy `/v1/expert-packs` is empty.
- TUI expert-pack update/delete now send workspace scope correctly.
- Web/core `agentBlueprints()` preserves `kind`, `scope`, and `version`.
- Web/core `expertPacks()` merges `kind:"pack"` blueprint rows into expert-pack listings.
- Web/core added expert-pack `install/update/delete` client methods.
- Web Settings -> Expert packs now exposes install, validate, update, and delete actions instead of validate-only copy.
- Web Settings passes workspace context into Expert packs so lifecycle actions can include `workspace_id`.
- Web Settings -> Expert packs now defaults install scope to `workspace` when a workspace is active and `global` otherwise; the invalid `session` lifecycle scope was removed from the install/update/delete control.
- Expert-pack lifecycle feedback now appears outside the install panel, so update/delete actions on pack cards produce visible success/error state.
- Web/core catalog reads now pass active `workspace_id` / `session_id` into `expertPacks()` and the `agentBlueprints()` fallback merge. This fixed a live bug where the UI said "Installed" but refreshed the global catalog and did not show the workspace-installed pack.
- Web Settings -> Expert packs now renders pack entries as full-width lifecycle rows so long source-derived pack IDs remain readable.
- Web Settings now passes workspace/session context into Agent blueprints.
- Web Settings -> Agent blueprints now lists with active workspace/session scope, defaults install scope to `workspace` when a workspace is active, sends `workspace_id` into install/uninstall, and surfaces validation/install/delete status outside the install panel.
- Web Settings -> Agent blueprints now renders blueprint entries as full-width lifecycle rows so source-backed and workspace-installed blueprints remain readable.

Live proof added:

- `CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "expert pack"` passed against owned no-agent CLIO backends on `127.0.0.1:18212` and `127.0.0.1:18213`.
- The test created a real loose pack under the owned workspace, installed it through the web UI, verified the `kind:"pack"`/`scope:"workspace"` row appeared through the scoped blueprint fallback, updated it through the UI, deleted it through the UI, and verified the row disappeared.
- Screenshot/evidence files:
  - `apps/web/screenshots/audit/overnight-real-expert-packs-install-form.png`
  - `apps/web/screenshots/audit/overnight-real-expert-packs-installed.png`
  - `apps/web/screenshots/audit/overnight-real-expert-packs-updated.png`
  - `apps/web/screenshots/audit/overnight-real-expert-packs-deleted.png`
  - `apps/web/screenshots/audit/overnight-real-expert-packs.json`

Live Agent Blueprints lifecycle proof added:

- `CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "agent blueprint"` passed against owned no-agent CLIO backends on `127.0.0.1:18214` and `127.0.0.1:18215`.
- The test created a real loose blueprint under the owned workspace, installed it through the web UI, verified the workspace-scoped `kind:"blueprint"` row appeared through the scoped catalog, uninstalled it through the UI, and verified the row disappeared.
- Screenshot/evidence files:
  - `apps/web/screenshots/audit/overnight-real-blueprints-install-form.png`
  - `apps/web/screenshots/audit/overnight-real-blueprints-installed.png`
  - `apps/web/screenshots/audit/overnight-real-blueprints-deleted.png`
  - `apps/web/screenshots/audit/overnight-real-blueprints.json`

New backend issue opened:

- `iowarp/clio-agent#681` (`gact-tui`): `POST /v1/expert-packs/install` rows are visible through `/v1/agent-blueprints` as `kind:"pack"` but not through `GET /v1/expert-packs` or `GET /v1/expert-packs/{id}`. gact-tui has a workaround, so this is not a release blocker for the interface pass.

### Live MCP Lifecycle Proof

The MCP settings page now has real lifecycle evidence, not only bundled-server
detail expansion:

- Direct backend probe against owned `127.0.0.1:18220` confirmed
  `POST /v1/mcp/servers` can install
  `npx -y @modelcontextprotocol/server-everything`, returning a ready external
  server with 13 tools.
- Added a live web UI proof in
  `apps/web/tests/visual/overnight-real-multibackend.spec.ts` that installs
  that server from Settings -> MCP servers, expands its tool detail, reconnects
  it through `POST /v1/mcp/servers/{id}/reconnect`, uninstalls it, and verifies
  the external row is gone.
- Adjusted MCP settings cards to use a wider grid so long external server names
  and larger tool inventories remain readable.
- Focused proof passed against owned backends `18220` and `18221`.
- Evidence:
  - `apps/web/screenshots/audit/overnight-real-mcp-install-form.png`
  - `apps/web/screenshots/audit/overnight-real-mcp-installed.png`
  - `apps/web/screenshots/audit/overnight-real-mcp-expanded.png`
  - `apps/web/screenshots/audit/overnight-real-mcp-reconnected.png`
  - `apps/web/screenshots/audit/overnight-real-mcp-deleted.png`
  - `apps/web/screenshots/audit/overnight-real-mcp-lifecycle.json`

### Live Add Remote Backend Proof

Settings -> Backends now has a real two-backend browser proof instead of only
unit coverage:

- Owned Backend A: `http://127.0.0.1:18229`.
- Owned Backend B: `http://127.0.0.1:18230`.
- Both used isolated `XDG_CONFIG_HOME`, isolated trace paths, isolated
  workspaces under `gact-tui/tmp/cors-add-remote-20260617-173705`, and
  `CLIO_GACT_CORS_ORIGINS='*'`.
- This proof ran under normal Chromium browser security. It did not use
  `--disable-web-security` or the optional `CLIO_PLAYWRIGHT_CORS_SHIM`.
- The web UI opened Settings from Backend A, used Add remote to register
  Backend B, capability-probed the new URL, selected it as current, returned to
  chat, and verified Backend B's live session inventory replaced Backend A's.

Fixes from the proof:

- `AddRemoteBackend` now explicitly selects the newly saved backend instead of
  leaving the previous backend active.
- The capability probe uses the Tauri fetch bridge in desktop contexts.
- Desktop SSH mode now calls the native `openSshTunnel` bridge and includes a
  remote CLIO port field; pure web still stores SSH config but explains that it
  cannot spawn `ssh -L`.
- Settings shell exposes the Add remote action in the shell header for the
  Backends section, because nested Settings page topbars are hidden inside the
  shell.
- Add-remote test IDs were split so the shell action and add-remote page do not
  collide.
- Token placeholders now use backend-neutral language.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18229 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18230 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/cors-add-remote-20260617-173705/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-brand-settings.spec.ts --grep "add and activate" --workers=1
```

Result: 1/1 passed.

Evidence:

- `apps/web/screenshots/audit/overnight-real-add-remote-form.png`
- `apps/web/screenshots/audit/overnight-real-add-remote-active.png`
- `apps/web/screenshots/audit/overnight-real-add-remote.json`

### Live Agent Blueprint Source Registry Proof

Settings -> Agent blueprints now has a real source-registry lifecycle proof
against the durable 0.5.3 source API:

- Owned Backend A: `http://127.0.0.1:18229`.
- Owned Backend B: `http://127.0.0.1:18230`.
- Both used isolated `XDG_CONFIG_HOME`, isolated trace paths, isolated
  workspaces under `gact-tui/tmp/cors-add-remote-20260617-173705`, and
  `CLIO_GACT_CORS_ORIGINS='*'`.
- This proof ran under normal Chromium browser security. It did not use
  `--disable-web-security` or the optional `CLIO_PLAYWRIGHT_CORS_SHIM`.
- The web UI added a local blueprint registry source, verified the backend
  discovered an available blueprint, refreshed the source, removed it, and
  verified the source registry returned to empty.

Fix from the proof:

- Blueprint source rows now show a visible status chip (`READY`, `OK`, `ERROR`,
  etc.) instead of hiding the status only in the dot tooltip.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18229 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18230 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/cors-add-remote-20260617-173705/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "blueprint source" --workers=1
```

Result: 1/1 passed.

Evidence:

- `apps/web/screenshots/audit/overnight-real-blueprint-sources-add-form.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-added.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-refreshed.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-deleted.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources.json`

### Live Permission Semantics

- Added/updated `apps/web/tests/visual/ndp-earthscope-live.spec.ts`.
- The test now treats a `shell_bash` cleanup permission as intentional UX coverage:
  - waits for pending permission cards,
  - screenshots the permission card,
  - approves once through the real UI,
  - verifies the backend permission status resolves instead of waiting forever.
- Captured evidence for `shell_bash` permission `perm_9e09364086f4` moving from `pending` to `resolved` with action `allow`.
- Screenshot evidence:
  - `apps/web/screenshots/audit/ndp-earthscope-live-permission-1-shell_bash.png`
  - `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`

### NDP Artifact Preview Gate

- Added/updated `apps/web/tests/visual/ndp-artifacts-live.spec.ts`.
- Validates real workspace artifacts without rerunning the long benchmark:
  - metadata CSV preview,
  - large CSV placeholder,
  - PNG image rendering through CLIO binary file reads.
- Latest rerun against owned backend `127.0.0.1:18190` passed: the generated
  `MTA1.CI.LY_.30.png` rendered as an image with natural size `2968x1408`,
  confirming the CLIO 0.5.3 binary-read fix is reflected in the web UI.
- Screenshot/evidence files:
  - `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png`
  - `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png`
  - `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`
  - `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json`
- UI fix: artifact-only/empty sessions with preview rail open now show `Previewing workspace files` instead of first-run prompt cards.
- Cleanup fix: successful live artifact-preview sessions are archived after
  evidence capture by default. The latest manifest records the backend archive
  response with `archived: true`.
- Files touched:
  - `apps/web/src/routes/ChatScreen.tsx`
  - `apps/web/src/routes/chat.css`

### Current Desktop Refresh

- `apps/desktop` JS smoke passed: 7/7.
- `apps/desktop/src-tauri` Rust/Tauri suite passed: 31/31.
- `GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug`
  rebuilt the current CLIO-branded web bundle and produced
  `apps/desktop/src-tauri/target/debug/clio-desktop`.
- Captured a native Linux WebKitGTK/Xvfb desktop screenshot against owned
  backend `127.0.0.1:18224`, with isolated desktop XDG state and
  `CLIO_PORT=18224`.
- First fresh-profile capture showed the onboarding tour, which is expected
  first-run behavior. A second capture seeded only the isolated WebKit local
  storage value `clio.onboarding-done.v1=1` and produced the returning-user
  shell proof.
- Evidence:
  - `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`
  - `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current-returning.png`

### Prompt Save Layout

- `PromptsPage` editor cards now scroll into view and open across the full grid.
- Textarea is capped so the header and saved-state feedback remain visible.
- Screenshot:
  - `apps/web/screenshots/audit/overnight-real-prompt-save.png`
- Files touched:
  - `apps/web/src/routes/discovery/PromptsPage.tsx`
  - `apps/web/src/components/discovery-page.css`

### Mobile Composer

- Narrow phone composer now hides secondary chips while keeping the backend selector visible.
- File touched:
  - `apps/web/src/components/composer.css`

### Desktop Native Smoke

- Desktop JS smoke passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.
- Debug build passed earlier in this pass.
- Native Xvfb screenshot evidence:
  - `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190-attached-1440.png`

### Branding/Hardcoding Pass

- Extended `apps/web/tests/visual/brand-audit.spec.ts` to cover splash startup and install states.
- Removed primary user-facing `clio-agent` wording from splash startup/install/error copy.
- Current splash install still shows low-level repository/process details where they are operational logs.
- Verified both brands:
  - `GACT_BRAND=clio`: brand audit 7/7 passed.
  - `GACT_BRAND=gact`: brand audit 7/7 passed.
- Files touched:
  - `apps/web/src/routes/SplashScreen.tsx`
  - `apps/web/tests/visual/brand-audit.spec.ts`

### Settings Backend Copy

- `SettingsBackends` empty state now says `bundled agent backend` instead of `clio-agent-gact`.
- Local back button test id was made specific: `settings-backends-back`.
- Reachable backend status label changed from `ready` to `reachable`.
- Bundled backend remove tooltip uses the active brand name.
- Added a unit regression for brand-neutral empty backend copy.
- Files touched:
  - `apps/web/src/routes/SettingsBackends.tsx`
  - `apps/web/tests/unit/SettingsDepth.test.tsx`

### Metrics Latency Bucket Rendering

- `MetricsPage` now renders the CLIO-agent 0.5.3 latency bucket shape
  `{count, p50_ms, p95_ms, max_ms}` as a readable `p50` headline plus
  `samples / p95 / max` detail.
- This adapts the UI to the fixed `/v1/metrics.latencies` contract from
  `iowarp/clio-agent#655`.
- Focused formatter coverage:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- MetricsPage.test.ts --run
```

Result: 2/2 passed.

Live proof:

- Owned ALCF-backed backend: `http://127.0.0.1:18231`.
- Workspace: `/home/jcernuda/gact-tui/tmp/diff-live-20260617-174331/workspace`.
- After a real `fs_read_file` / `fs_propose_edit` tool-agent turn,
  `/v1/metrics.latencies` included `tool:fs_read_file`, `tool_call`, and
  `tool:fs_propose_edit` buckets.
- Settings -> Metrics rendered those buckets as visible cards.

Evidence:

- `apps/web/screenshots/audit/overnight-real-diagnostics-metrics.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics.json`

### Live File Diff Fallback Proof

- Ran the real file-edit proof against owned ALCF-backed CLIO on
  `http://127.0.0.1:18231` with normal Chromium browser security and
  `CLIO_GACT_CORS_ORIGINS='*'`.
- The tool-agent turn successfully called `fs_read_file` and `fs_propose_edit`.
- CLIO still did not emit native `file_diff` message parts or pending
  `/v1/sessions/{sid}/diffs` rows, so gact-tui rendered the diff from
  `metadata.tools_called[].result` as a fallback.
- TUI-side mitigation: `DiffPane` now labels this surface `diff preview` and
  uses local review buttons (`Mark reviewed` / `Skip`) instead of implying the
  metadata-derived fallback is backend-appliable.
- Fresh evidence was added to `iowarp/clio-agent#674`:
  https://github.com/iowarp/clio-agent/issues/674#issuecomment-4736199782

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18231 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_6de63f5707c4 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "file-edit agent" --workers=1
```

Result: 1/1 passed.

Evidence:

- `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-messages.json`

## Verified Locally

Current 0.5.3 interface-adaptation verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/core test -- client.test.ts
npm exec --yes pnpm@9.15.9 -- --dir apps/core typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- --run
go test ./internal/client ./internal/ui
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results:

- core client tests: 24/24 passed.
- core typecheck: passed.
- web typecheck: passed.
- web unit tests: 286/286 passed.
- TUI client/UI Go tests: passed.
- CLIO brand visual audit: 7/7 passed.

Small release hardening fix from this verification:

- `PromptsPage` now guards `scrollIntoView` before scheduling smooth-scroll behavior, so jsdom/unit tests do not fail on unhandled async DOM errors while browser behavior remains unchanged.
- `ExpertPacksPage` now has focused unit coverage for pack kind/scope tags plus install, validate, update, and delete actions against the 0.5.3 lifecycle contract.
- `overnight-real-multibackend.spec.ts` now contains an opt-in real-backend Expert Packs lifecycle proof instead of only empty/validate screenshots.

Focused test passed:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- SettingsDepth.test.tsx
```

Result: 5/5 tests passed.

Whitespace check passed for the current settings/permission/doc slice:

```bash
git diff --check -- apps/web/src/routes/SettingsBackends.tsx apps/web/tests/unit/SettingsDepth.test.tsx docs/overnight-real-ui-validation-2026-06-17.md apps/web/tests/visual/ndp-earthscope-live.spec.ts
```

The latest `apps/web` typecheck was rerun after the handoff interruption and passed.

## Current CLIO-Agent Issues

Relevant upstream issues that should remain visible to the CLIO-agent team. All open TUI-origin backend issues touched in this pass now carry the `gact-tui` label for filtering.

Fixed upstream in CLIO-agent 0.5.3 and adapted locally in this branch:

- `iowarp/clio-agent#636`: MCP reconnect route restored. TUI/web surfaces can use `POST /v1/mcp/servers/{id}/reconnect`; direct probe confirmed the route exists and returns structured errors for bundled/non-external MCP rows.
- `iowarp/clio-agent#640`: durable marketplace-source registry implemented. Direct probe confirmed list/add/refresh against the local marketplace.
- `iowarp/clio-agent#655`: `/v1/metrics.latencies` is documented as populated after tool calls. A no-agent backend can still return `{}` before any tool activity, which is expected.
- `iowarp/clio-agent#663`: expert-pack install/update/delete aliases exist. TUI/web now send workspace scope correctly.
- `iowarp/clio-agent#674`: `fs_propose_edit` now emits `file_diff` parts and pending diffs per the 0.5.3 docs; UI already has diff rendering/apply paths.
- `iowarp/clio-agent#675`: browser SSE CORS is supported through `CLIO_GACT_CORS_ORIGINS`; direct preflight probe returned `Access-Control-Allow-Origin: *`.
- `iowarp/clio-agent#676`: workspace binary file reads now return raw `image/png` bytes; direct PNG read probe matched the original bytes.

Still open or design-level:

- `iowarp/clio-agent#679`: EarthScope GNSS benchmark can loop after permission approval and artifact generation.
- `iowarp/clio-agent#641`: UI-safe semantic summaries.
- `iowarp/clio-agent#642`: SSE replay/session status hydration.
- `iowarp/clio-agent#681`: expert-pack install rows appear through `/v1/agent-blueprints` as `kind:"pack"` but not through `/v1/expert-packs` list/detail. gact-tui has a merge workaround, so this is not a release blocker.

Closed/resolved:

- `iowarp/clio-agent#672`: `_UnsupportedSessionAgent` was a local gate/config issue caused by resolving a dev `.clio` override instead of the installed marketplace blueprint. Do not send this back to the dev team as an active product bug.

## Current Dirty State To Remember

The worktree is intentionally dirty and includes broad 0.8.4 web/desktop work plus screenshots. Do not blindly clean untracked files.

Known important untracked additions:

- `apps/web/tests/visual/ndp-earthscope-live.spec.ts`
- `apps/web/tests/visual/ndp-artifacts-live.spec.ts`
- `apps/web/tests/visual/live-prompts.ts`
- `apps/web/tests/visual/mock-backend.ts`
- `apps/web/src/activity-label.ts`
- `apps/web/tests/unit/ActivityLabel.test.ts`
- `docs/overnight-real-ui-validation-2026-06-17.md`
- `docs/handoff-2026-06-10.md`
- `docs/handoff-2026-06-17-web-desktop-polish.md`
- Many screenshot artifacts under `apps/web/screenshots/audit/`.

## Resume Plan

1. Continue the visual polish pass through screenshots, prioritizing:
   - settings/backends/add-remote workflow,
   - MCP/catalog/detail views,
   - transcript rendering for tool calls and workflow activity,
   - markdown/table/diff/file/image previews,
   - desktop webview parity screenshots.

2. If the live backend is available and stable, rerun the permission-path gate only when explicitly useful; it is long-running and can intentionally hit `shell_bash` permission cards:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

3. Before commit/PR:
   - run targeted unit tests for touched areas,
   - run `apps/web` typecheck,
   - run relevant visual gates with owned backends,
   - inspect screenshots manually,
   - do not remove `docs/handoff-2026-06-10.md`.

## Latest Continuation: CLIO Starter Prompts + Empty-State Scroll

The terminal TUI remains the urgent product gate and was already green in the
previous pass. This continuation focused on shared web/desktop first-impression
quality without treating desktop as smoke-only in the long-term quality model.

What changed:

- Added optional `starterPrompts` to the brand profile contract.
- CLIO now ships first-run prompt cards for EarthScope GNSS, NDP wildfire data,
  CIMIS weather, and workspace artifact review.
- GACT keeps the existing neutral prompt cards in its brand profile.
- The chat empty state reads `brand.starterPrompts` instead of hardcoding GACT
  examples.
- Fixed the empty transcript auto-scroll path so zero-message sessions stay at
  the top; the previous behavior clipped the empty-state heading in real
  first-impression screenshots.

Fresh proof:

- Owned no-agent CLIO backend on `127.0.0.1:18252`, isolated XDG state,
  `CLIO_GACT_CORS_ORIGINS='*'`.
- `GACT_BRAND=clio ... playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1`
  passed 6/6.
- Inspected `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`;
  heading is no longer clipped and CLIO-specific prompt cards render.

Verification run after the change:

- `apps/web` focused brand/preview/diff/MCP/expert-pack/metrics/live/transcript
  tests: 63/63 passed.
- Full `apps/web` unit suite: 288/288 passed.
- `apps/web` typecheck and lint passed.
- `apps/core` tests: 50 passed, 4 live-CLIO tests skipped by design.
- Desktop JS smoke: 7/7 passed.
- Desktop Rust/Tauri tests: 31/31 passed.
- `git diff --check` passed.

Remaining release distinction:

- TUI is the urgent tomorrow path.
- Web has stronger owned-backend evidence after this pass.
- Desktop still needs product-grade native WebView interaction proof before
  claiming desktop release readiness; current proof is JS smoke, Rust/Tauri
  tests, build/screenshot evidence, and shared webview tests.

## Latest Continuation: New-Session Workflow Defaults

The user asked that all three interface providers expose the same semantics for
choosing the workflow package/blueprint used by a new session, including a
persisted default and a quick `Ctrl+B` entry point.

What changed:

- Shared web/desktop UI now opens a session setup picker from New Session,
  `Ctrl/Cmd+N`, command-palette new session, and `Ctrl/Cmd+B`.
- Shared web/desktop Settings now includes `Session defaults` under Agents,
  persisted through local storage.
- TUI now has a matching `Ctrl+B` / `Ctrl+N` / `/new` / sidebar `n` session
  setup modal.
- TUI Settings > Expert now shows `New-session defaults` and opens the defaults
  picker with `b` or `Ctrl+B`.
- TUI config now persists `default_blueprint` and `default_expert_pack`, and
  `gact emit-config` includes both fields.
- TUI session creation now creates the backend session first, then binds the
  selected agent blueprint and expert pack through CLIO's session binding
  endpoints. Partial binding failures keep the created session and surface a
  warning.
- Composer icon cleanup in the shared web/desktop UI removed the duplicate
  paperclip presentation: attach, mic, and audio-file upload now use distinct
  icons.

TUI visual proof:

- `visual_loop/session_setup_picker.tape`
- `visual_loop/screenshots/session_setup_picker.png`
- `visual_loop/screenshots/session_setup_picker.gif`

Verification after this change:

```bash
go test -p 1 ./tui/internal/config ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact -count=1
go test -p 1 ./tui -count=1
git diff --check
make dev-install
```

Results:

- Focused TUI/config/client/emulator packages passed.
- Broader `./tui` command package passed.
- `git diff --check` passed after trimming refreshed golden whitespace.
- `make dev-install` rebuilt `tui/gact` and relinked both
  `~/.local/bin/gact` and `~/.local/share/clio/gact` to this checkout, so the
  `clio` launcher should use the latest TUI.

Follow-up during this continuation:

- Web/desktop Settings `Session defaults` now loads agent-blueprint and
  expert-pack catalogs with the active workspace/session scope instead of using
  unscoped global catalogs. This matters for CLIO installs where blueprint and
  pack visibility is workspace-specific.
- Added focused web unit coverage for default persistence, stale default
  clearing, and workspace-scoped catalog calls.

Additional verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/SessionSemantics.test.ts tests/unit/SessionDefaultsSection.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/SessionSemantics.test.ts tests/unit/SessionDefaultsSection.test.tsx tests/unit/SettingsDeepLink.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
git diff --check
```

Results:

- Session default unit tests passed: 4/4.
- Settings/session focused slice passed: 11/11.
- Web typecheck and lint passed.
- `git diff --check` passed.

## Latest Continuation: Fresh Owned-Backend Web Proof

After the session-defaults changes, reran the shared web UI against two fresh
owned CLIO backends launched from `/home/jcernuda/clio-agent/.venv/bin/clio-agent-gact`
with isolated XDG directories under
`/home/jcernuda/gact-tui/tmp/owned-web-continuation-20260617-203119`.

Backends:

- A: `http://127.0.0.1:18310`
- B: `http://127.0.0.1:18311`

Issue found and fixed:

- `overnight-real-multibackend.spec.ts` assumed the clean workspace already had
  a `README.md`. On the fresh owned backend the workspace only had `.clio`
  state, so the file-preview proof failed before exercising refresh behavior.
  The gate now seeds its own `README.md` containing the expected markdown text.

New coverage:

- Added a real visual scenario for Settings > `Session defaults` and the
  `Ctrl+B` session semantics modal. This verifies the new blueprint/expert-pack
  selection surface in the production web build against a real backend.

Fresh evidence:

- `apps/web/screenshots/audit/overnight-real-session-defaults-settings.png`
- `apps/web/screenshots/audit/overnight-real-session-semantics-modal.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`

Verification:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18310 CLIO_BACKEND_B_URL=http://127.0.0.1:18311 CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/owned-web-continuation-20260617-203119/a/workspace GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "session defaults" --workers=1
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18310 CLIO_BACKEND_B_URL=http://127.0.0.1:18311 CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/owned-web-continuation-20260617-203119/a/workspace GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18311 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_default GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
git diff --check
```

Results:

- Focused session-defaults real visual proof passed: 1/1.
- Full extended real web gate passed: 13/13.
- First-impression real web gate passed: 6/6.
- Web lint passed.
- Desktop smoke passed: 7/7.
- `git diff --check` passed.

## Latest Continuation: Real Streaming Fallback Reconciliation

Reran the live web streaming proof against the owned CLIO backend on
`http://127.0.0.1:18176` using workspace `ws_80d27018c650`.

Issue found and fixed:

- CLIO/ALCF returned a truthful fallback for the probe:
  `stream_completed_without_chunks` with `live_streaming:false`. The backend
  had final assistant text through REST, but the web UI could still show
  `CLIO is responding` because the typing indicator was keyed only off a stale
  `running` session row.
- `createLiveTranscript` now reconciles both transcript messages and session
  rows when SSE errors or the Tauri bridge closes.
- `ChatScreen` now treats a settled assistant message (`stop_reason` or
  `error_info`) as authoritative for clearing the typing indicator, even if the
  session row has not refreshed yet.
- The toast host now coalesces identical visible toasts, and the SSE reconnect
  notification path avoids repeating the same disconnect prompt during a
  reconnect cycle.
- `overnight-real-streaming.spec.ts` now fails unless the final assistant text
  is visible and the typing indicator is gone before taking the final
  screenshot. Fallback evidence is still accepted only as a truthful fallback,
  not as a stale UI state.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18176 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: passed 1/1 from a production web build.

Evidence:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`

Manifest summary:

- `liveUiSampleCount: 0`
- fallback: `stream_completed_without_chunks`, `live_streaming:false`
- final assistant message had `stop_reason:end_turn` and visible response text.

Additional verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/LiveReducer.test.ts tests/unit/Transcript.test.tsx tests/unit/SessionSemantics.test.ts tests/unit/SessionDefaultsSection.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
git diff --check
```

Results: focused web tests passed 23/23, typecheck passed, lint passed, and
`git diff --check` passed.

## Latest Continuation: Composer Command/Attach/Mention Polish

Addressed the confusing composer affordance split called out during the web and
desktop UI review:

- `/` remains the command palette entry point.
- The paperclip opens a context menu for upload/reference actions.
- `@` remains the inline reference picker for workspace files, agents, and
  tools; it does not upload bytes.

UI changes:

- The attach menu now uses distinct icons for upload (`file`), image (`image`),
  and workspace reference (`@` mention) instead of repeating paperclip icons for
  every row.
- The composer control row now aligns command, attach, textarea, and send
  controls to the first text line, which is better for multi-line drafts and
  clearer in the default one-line state.
- Removed a duplicate paste-stash write found while inspecting the composer
  paste-compression path.

Evidence:

- `apps/web/screenshots/attach-hybrid-menu.png`
- `apps/web/screenshots/at-mention-picker.png`

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/ImageAttachGating.test.tsx tests/unit/ComposerSubmit.test.tsx tests/unit/SessionSemantics.test.ts tests/unit/SessionDefaultsSection.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/screenshots.spec.ts --grep "at-mention|attach menu" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
git diff --check
```

Results: focused web tests passed 10/10, typecheck passed, visual screenshots
passed 2/2 from a production build, lint passed, desktop smoke passed 7/7, and
`git diff --check` passed.

## Latest Continuation: Brand-Neutral Add Remote Pass

Audited shared web/desktop source for user-visible product-name leaks. Most
literal `CLIO`/`GACT` hits are protocol names, storage keys, tests, or
backend-install instructions. One shared Add Remote label was product-specific
where it should have described the remote endpoint generically.

Changes:

- `Remote CLIO port` is now `Remote backend port`.
- SSH tunnel helper text now says `remote backend port`.
- The pure-web SSH mode chip now says `desktop only` instead of the
  implementation-flavored `desktop spawn`.

Evidence:

- `apps/web/screenshots/add-remote-ssh-wizard.png`

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/AddRemoteBackend.test.tsx tests/unit/Brand.test.ts tests/unit/SettingsDepth.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/screenshots.spec.ts --grep "add-remote-ssh-wizard" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
git diff --check
```

Results:

- Focused unit tests passed 9/9.
- Web typecheck passed.
- Web lint passed.
- CLIO brand audit passed 7/7.
- GACT brand audit passed 7/7.
- Add Remote SSH visual passed 1/1 from a neutral GACT production build.
- Desktop smoke passed 7/7.
- `git diff --check` passed.

## Latest Continuation: Brand Repository Surface Pass

Extended the brand profile object so CLIO-specific backend repository details
are explicit data, not shared product copy. The neutral GACT build no longer
surfaces the CLIO backend repository in About, while the CLIO build still does.

Changes:

- Added optional `backendRepository` metadata to brand profiles.
- CLIO profile declares `github.com/iowarp/clio-agent` as the CLIO backend.
- Neutral GACT profile omits the backend repository link from About.
- The first-run install demo log now uses generic GACT backend language under
  the neutral profile and keeps CLIO-specific repository language under CLIO.

Evidence:

- `apps/web/screenshots/audit/brand-gact-splash-install.png`
- `apps/web/screenshots/audit/brand-gact-settings-about.png`
- `apps/web/screenshots/audit/brand-clio-settings-about.png`

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/Brand.test.ts --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results: focused brand unit tests passed 2/2, web typecheck passed, and both
GACT and CLIO brand visual audits passed 7/7.

## Correction: EarthScope Live Harness Misconfiguration

Do not treat `_UnsupportedSessionAgent` from an EarthScope live gate on this
machine as prima facie backend evidence. The CLIO team has working EarthScope/NDP
runs on this machine; if the gact-tui live gate sees `_UnsupportedSessionAgent`,
assume the UI test harness or owned-backend launch did not match the known-good
configuration.

Bad run to avoid repeating:

- Owned backend: `http://127.0.0.1:18322`.
- Workspace:
  `/home/jcernuda/gact-tui/tmp/owned-clio-web-live-20260617-215651/workspace`.
- Symptom: marketplace blueprint installed and workspace MCP handshake appeared
  ready, but `main -> geospatial` failed immediately with
  `_UnsupportedSessionAgent`.
- Mistake: opened `iowarp/clio-agent#689` from that evidence. It has been
  closed/retracted as a gact-tui harness/configuration mistake.

Next live EarthScope attempt must first copy or reuse the exact working
deployment semantics from the known-good CLIO runs, including current branch,
environment, workspace source, registry/source install path, and session
blueprint binding. Do not open another backend issue for this symptom unless the
same exact known-good command line fails outside the UI.

## Latest Continuation: EarthScope Harness Recovery Notes

Read and applied the CLIO developer guidance on
`iowarp/clio-agent#689`. The important correction is that
`/v1/mcp/handshake` is only a readiness probe; it does not wire tools into the
per-session expert executor. The working proof must create/bind the session
against the workspace and active blueprint. `_UnsupportedSessionAgent` in this
flow means the harness did not reproduce that setup.

Code change:

- The opt-in live EarthScope Playwright gate now writes the known-good local
  workspace MCP override when `CLIO_KIT_PATH` or `/home/jcernuda/clio-kit`
  exists. The evidence manifest records the override path.

Recovered setup:

- Owned backend restarted on `http://127.0.0.1:18190`.
- Backend env sourced from:
  `/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/run/env.sh`.
- Known-good workspace:
  `/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace`.
- Workspace MCP override:
  `.clio/mcp.yaml` with local `/home/jcernuda/clio-kit/clio-kit-mcp-servers/*`
  commands.

Live rerun result:

- A fresh post-start workspace still failed with `_UnsupportedSessionAgent`,
  proving dynamic workspace creation during the already-running backend is not
  equivalent to the known-good prepared workspace.
- Rerunning against the existing prepared workspace cleared
  `_UnsupportedSessionAgent`; the failure moved to `empty_response` from the
  main blueprint runtime. This confirms the original unsupported-agent symptom
  was harness/configuration, not a backend bug.
- Updated `iowarp/clio-agent#689` with the recovered boundary and left it open
  as the reference issue.

Artifact proof:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result: passed 1/1. Inspected screenshots:

- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png`

UI observation:

- Real artifact previews are usable: PNG renders, small CSV renders inline, and
  the 48 MB CSV gets a readable large-file placeholder.
- Repeated live/audit runs previously cluttered the session rail with generated
  sessions. The artifact-preview gate now archives successful generated
  sessions by default; use `CLIO_LIVE_KEEP_SESSIONS=1` only when debugging.

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
git diff --check
```

Results: all passed.

Latest artifact-preview rerun:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-onJpUf \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result: passed 1/1. Evidence:

- `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json` records
  backend `http://127.0.0.1:18190`, workspace
  `/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-onJpUf`, PNG
  `MTA1.CI.LY_.30.png`, `plotOutcome: image`, natural size `2968x1408`, and
  `archiveResult.archived: true`.
- Direct backend check for the generated session returned `archived: true`.
- The owned backend active session list had zero generated NDP/EarthScope
  sessions after cleanup.
- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png` was inspected
  and shows the generated GNSS time-series PNG in the preview rail.

## Streaming Proof Recheck - 2026-06-17 Late

Reran the opt-in web live-streaming proof against two fresh owned ALCF-backed
CLIO backends after the CLIO-agent Argonne streaming changes were present in the
local checkout.

Important gate correction:

- `apps/web/tests/visual/overnight-real-streaming.spec.ts` now counts a live
  sample only when assistant text is visible while `chat-typing` is also
  visible. The previous check could count a race where the UI already showed
  `end_turn` but the messages API had not yet reported `stop_reason`.

`openai/gpt-oss-120b` on Sophia:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_REQUIRE_LIVE_STREAMING=1 \
CLIO_GACT_URL=http://127.0.0.1:18390 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_9fd755d24641 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: strict gate failed, `liveUiSampleCount: 0`.

`google/gemma-4-31B-it` on Sophia:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_REQUIRE_LIVE_STREAMING=1 \
CLIO_GACT_URL=http://127.0.0.1:18391 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_018c9dabd425 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: strict gate failed under the corrected definition. A non-strict
truthful-fallback rerun passed and wrote
`apps/web/screenshots/audit/overnight-real-streaming-samples.json` with:

- `backend: http://127.0.0.1:18391`
- `liveUiSampleCount: 0`
- `fallback.reason: stream_completed_without_chunks`
- `fallback.live_streaming: false`
- active samples (`ui_active: true`) had `ui_chars: 0`; final text appeared
  only after `ui_active: false`.

Screenshots:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`

Backend issue opened:

- https://github.com/iowarp/clio-agent/issues/692

Current interpretation: the web UI renders truthful fallback correctly, but the
release still lacks real active text-evolution proof for ALCF-backed CLIO turns.
This is now tracked as a CLIO-agent contract/backend issue rather than hidden as
a gact-tui green proof.

## Desktop WebView Driver Autodetect Proof - 2026-06-18

Follow-up after checkpoint `2ac8da27`: the native WebView e2e harness now
auto-detects the locally extracted Linux WebKit driver at
`tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver` in addition to `PATH` and
explicit `TAURI_NATIVE_DRIVER`.

This makes the local real-WebView proof runnable without exporting a bespoke
driver path, while clean environments still skip with an explicit missing-driver
reason.

Owned backend:

- URL: `http://127.0.0.1:17800`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-desktop-webview-20260617-231715-2124531`
- Workspace: `ws_b24ce29caf61`
- Provider/model: `argonne` on ALCF Sophia,
  `google/gemma-4-31B-it`

Command:

```bash
TAURI_E2E=1 \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:17800 \
CLIO_DESKTOP_WORKSPACE_ID=ws_b24ce29caf61 \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
xvfb-run -a npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: passed `1/1` in `8.8s` without setting `TAURI_NATIVE_DRIVER`.

Evidence:

- Screenshot:
  `apps/web/screenshots/audit/desktop-webview-chat.png`
- Screenshot:
  `apps/web/screenshots/audit/desktop-webview-permission.png`
- Backend permission row:
  `perm_bb0855485f0c`, session `sess_263c69ad1373`, tool `shell_bash`,
  command `rm -rf /tmp/gact-desktop-permission-probe-do-not-exist`,
  status `resolved`, action `deny`.
- Semantic trace:
  `tmp/owned-clio-desktop-webview-20260617-231715-2124531/traces/sess_263c69ad1373.semantic.jsonl`

Visual inspection: the permission card is prominent, the command is readable,
the active model/provider are visible in the header, and the composer remains
available without crowding the permission surface.

Cleanup: the owned backend on `:17800` was stopped after the proof and the port
was verified clear.

## Session Workspace Label Polish - 2026-06-18

`SessionsColumn` now resolves workspace ids through the live workspace list for
row workspace metadata/search, so raw `ws_...` ids do not leak when meta chips
are surfaced. The default rail remains compact because row meta chips are still
hidden in the dense layout.

Verification: `apps/web/tests/unit/Skeletons.test.tsx` passed `7/7`, web
typecheck passed, web lint passed, and the focused real-backend switch visual
gate passed `1/1` against owned no-agent CLIO backends on `:18272` and
`:18273`. Refreshed screenshots:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`

## Composer Reference Wording Polish - 2026-06-18

The composer now uses `@ reference` wording instead of `@ mention` in the
placeholder, footer hint, and picker heading. This keeps the mental model clear:
paperclip adds context/uploads bytes, while `@` references workspace files,
agents, or tools by name/path.

Verification: refreshed `attach-hybrid-menu.png` and `at-mention-picker.png`
via the focused visual specs; web typecheck and lint passed.

## Rendering Screenshot Refresh - 2026-06-18

Refreshed the deterministic markdown/code/diff/image-diagnostic rendering
screenshots after the composer wording polish. The focused visual specs passed
from a production CLIO-branded build.

Updated screenshots:

- `apps/web/screenshots/markdown-read.png`
- `apps/web/screenshots/code-syntax-highlight.png`
- `apps/web/screenshots/diff-pane-open.png`
- `apps/web/screenshots/preview-image-decode-diagnostic.png`

## Brand And Settings Proof Refresh - 2026-06-18

Refreshed the release-facing brand audit for both `GACT_BRAND=clio` and
`GACT_BRAND=gact`. Each profile passed all seven checks covering splash,
connect, connection errors, chat shell, settings/about, and operational
settings copy.

Also reran the real settings proof against two owned no-agent CLIO backends:

- Backend A: `http://127.0.0.1:18341`
- Backend B: `http://127.0.0.1:18342`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-brand-settings-20260617-234414-2135392`

The first attempt exposed a harness setup issue: the backend default workspace
was rooted at the server cwd, not the intended `a/workspace` directory. The
intended workspace was then created explicitly through `/v1/workspaces`, and
the same proof passed `3/3`:

- Settings probes both backends and shows latency.
- Settings can select backend B and return to the chat shell.
- Settings can add a remote HTTP backend and activate it.
- The workspace switcher filters sessions by the live workspace id.

Updated evidence:

- `apps/web/screenshots/audit/brand-clio-*.png`
- `apps/web/screenshots/audit/brand-gact-*.png`
- `apps/web/screenshots/audit/overnight-real-brand-chat.png`
- `apps/web/screenshots/audit/overnight-real-settings-probe.png`
- `apps/web/screenshots/audit/overnight-real-settings-selected-backend.png`
- `apps/web/screenshots/audit/overnight-real-add-remote-*.png`
- `apps/web/screenshots/audit/overnight-real-workspace-*.png`

Cleanup: the owned backends on `:18341` and `:18342` were stopped and both
ports were verified clear.

## ALCF Web Streaming Proof Refresh - 2026-06-18

Reran the opt-in web streaming proof against an owned ALCF-backed CLIO server:

- Backend: `http://127.0.0.1:18351`
- Workspace: `ws_default`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-web-stream-20260617-235042-2137852`
- Provider/model: `argonne` on ALCF Sophia,
  `google/gemma-4-31B-it`

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18351 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_default \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: passed `1/1`. The ALCF turn completed successfully and the web UI
rendered the final assistant answer. This run did not produce live visible text
chunks; the manifest records CLIO's structured fallback:
`stream_completed_without_chunks`, category `provider_streaming_limitation`,
`synthetic_posthoc: true`, `live_streaming: false`.

Evidence:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`
- Semantic trace:
  `tmp/owned-clio-web-stream-20260617-235042-2137852/traces/sess_77ccbb76a8ef.semantic.jsonl`

Cleanup: the owned backend on `:18351` was stopped and the port was verified
clear.

## ALCF Markdown Rendering Proof Refresh - 2026-06-18

Reran the real markdown rendering proof against an owned ALCF-backed CLIO
server:

- Backend: `http://127.0.0.1:18352`
- Workspace: `ws_default`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-web-rendering-20260617-235424-2139275`
- Provider/model: `argonne` on ALCF Sophia,
  `google/gemma-4-31B-it`

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18352 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_default \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-rendering.spec.ts --workers=1
```

Result: passed `1/1`. CLIO returned markdown containing a table, bullet list,
inline code, and fenced Python block. The web UI rendered them as structured
table/list/code elements and captured the settled state.

Evidence:

- `apps/web/screenshots/audit/overnight-real-rendering-early.png`
- `apps/web/screenshots/audit/overnight-real-rendering-table.png`
- `apps/web/screenshots/audit/overnight-real-rendering-settled.png`
- `apps/web/screenshots/audit/overnight-real-rendering-messages.json`
- Semantic trace:
  `tmp/owned-clio-web-rendering-20260617-235424-2139275/traces/sess_2e0607e494f9.semantic.jsonl`

Cleanup: the owned backend on `:18352` was stopped and the port was verified
clear.

## Real File/Image/Diff Web Proof And Diff Drawer Polish - 2026-06-18

Reran the broad real web UI file proof against an owned ALCF-backed CLIO
server:

- Backend: `http://127.0.0.1:18353`
- Workspace: `ws_default`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-web-files-20260617-235829-2140843`
- Provider/model: `argonne` on ALCF Sophia,
  `google/gemma-4-31B-it`

The throwaway workspace contained `README.md`, `sample_metrics.csv`,
`handlers.go`, and `validation_plot.png`.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18353 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_default \
CLIO_PLAYWRIGHT_CORS_SHIM=1 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result: passed `2/2`. Evidence confirms the preview rail rendered markdown,
source code, and PNG image bytes from the real backend; a live file-edit agent
called `fs_read_file` and `fs_propose_edit`; the web UI surfaced tool evidence
and opened an actual diff pane.

Visual inspection found and fixed two diff drawer issues:

- Long absolute paths no longer render as the primary drawer title. The drawer
  now shows a compact tail such as `workspace/handlers.go` while keeping the
  full path in `title`/ARIA.
- The drawer now starts below the 52px chat topbar on desktop instead of being
  partially hidden under it. Mobile keeps the full-screen overlay behavior.

Verification:

- `npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/DiffPane.test.tsx --run`
  passed `10/10`.
- `npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck` passed.
- The real web UI file proof passed again after the polish.

Updated evidence:

- `apps/web/screenshots/audit/overnight-real-markdown-preview.png`
- `apps/web/screenshots/audit/overnight-real-code-preview.png`
- `apps/web/screenshots/audit/overnight-real-image-preview.png`
- `apps/web/screenshots/audit/overnight-real-agent-turn-settled.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`
- `apps/web/screenshots/audit/overnight-real-agent-messages.json`
- `apps/web/screenshots/audit/overnight-real-file-editor-messages.json`

Cleanup: the owned backend on `:18353` was stopped and the port was verified
clear.

## Owned Backend Web/Desktop Refresh - 2026-06-18

Started a fresh owned CLIO backend on `http://127.0.0.1:18410` with isolated
config/data/traces and an explicit workspace rooted under:

`tmp/owned-clio-polish-20260618-013703-2181274/workspace`

Provider/model: `argonne` on ALCF Sophia, `google/gemma-4-31B-it`.

The installed `clio` launcher was also refreshed before these runs:

- `/home/jcernuda/.local/share/clio/gact -> /home/jcernuda/gact-tui/tui/gact`
- `/home/jcernuda/.local/bin/gact -> /home/jcernuda/gact-tui/tui/gact`
- `gact --version`: revision `ecdd798ae81d`, `buildDirty=false`
- `clio doctor`: server bin OK, gact bin OK, `:17800` free

Fresh web proof against the owned backend:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18410 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_4629f4581b4a \
CLIO_PLAYWRIGHT_CORS_SHIM=1 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-rendering.spec.ts \
  tests/visual/overnight-real-streaming.spec.ts \
  tests/visual/overnight-real-ui.spec.ts \
  --workers=1
```

Result after seeding the isolated workspace with `README.md`,
`sample_metrics.csv`, `handlers.go`, and `validation_plot.png`:

- `overnight-real-rendering.spec.ts`: passed `1/1`
- `overnight-real-streaming.spec.ts`: passed `1/1`
- `overnight-real-ui.spec.ts`: passed `2/2`

The refreshed screenshots cover markdown preview, source preview, PNG preview,
live assistant rendering, tool metadata, and the diff drawer.

Desktop issue found: the native WebView test seeded sessions through
`CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:18410`, but the desktop supervisor
only honored `CLIO_PORT`/`:17800`, so the app attached to the stale local
backend while the test inspected the owned backend.

Fix:

- desktop supervisor now honors `CLIO_GACT_URL` as a full attach URL before
  falling back to `CLIO_PORT`/`:17800`
- the WebView e2e gate bridges `CLIO_DESKTOP_BACKEND_URL` into
  `CLIO_GACT_URL`/`CLIO_PORT` so the app and test fixture target the same
  backend

Verification:

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
TAURI_E2E=1 \
TAURI_NATIVE_DRIVER=/home/jcernuda/gact-tui/tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:18410 \
CLIO_DESKTOP_WORKSPACE_ID=ws_4629f4581b4a \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: all passed. The WebView logs showed the Tauri SSE bridge opening
`http://127.0.0.1:18410/v1/sessions/.../events` and emitting live events. The
permission-card screenshot confirms the desktop app used the ALCF/Gemma owned
backend.

Additional extended web proof:

Started a second owned no-agent backend on `http://127.0.0.1:18411` with an
isolated workspace and reran the extended real UI gates with A=`:18410`,
B=`:18411`:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18410 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18411 \
CLIO_WORKSPACE_A_ROOT=tmp/owned-clio-polish-20260618-013703-2181274/workspace \
CLIO_ALT_WORKSPACE_ROOT=tmp/owned-clio-polish-20260618-013703-2181274/workspace-alt \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  tests/visual/overnight-real-brand-settings.spec.ts \
  --workers=1
```

Result: passed `16/16`, covering backend switching, workspace filtering, backend
settings/probe/activation, slash-command dispatch, unified catalog search, MCP
install/reconnect/uninstall, prompt save, expert-pack install/update/delete,
agent-blueprint install/uninstall, blueprint-source add/refresh/remove,
diagnostics pages, hooks, and policy round-trips. Screenshots under
`apps/web/screenshots/audit/overnight-real-*` were refreshed from this live
two-backend run.
