# Overnight Real UI Validation - 2026-06-17

## Scope

Validated the web UI against an isolated live CLIO backend on `127.0.0.1:18089`
using ALCF Sophia `openai/gpt-oss-120b`.

Update after the 2026-06-17 release-priority correction: the terminal TUI is
the core product and release gate. Web and desktop evidence in this document is
still useful, but it is secondary to the terminal TUI build/test/visual corpus
status below.

## Live Run Guardrails

Short durable checklist: see `docs/agent-operational-memory.md`.

- EarthScope/NDP is known to work on this machine. Treat `_UnsupportedSessionAgent`
  in gact-tui gates as a harness/configuration smell until proven otherwise.
- Real benchmark validation should use an owned CLIO backend configured for the
  known-good ALCF model cells (`gemma-4` or `gpt-oss`), not the shared developer
  runtime.
- Permission prompts are intentional UI semantics. Keep them enabled for UI
  validation unless the run is explicitly a non-permission benchmark pass.
- `/v1/tools` and `/v1/mcp/handshake` are not proof of child-expert tool
  composition. The useful proof is server log/tool evidence showing the active
  workspace-bound blueprint starts the declared MCP servers and child experts
  call the expected prefixed tools.

## Current CLIO Command Readiness - 2026-06-18

The local showcase `clio` command is wired to the current gact-tui checkout and
was refreshed after the live streaming proof:

```text
/home/jcernuda/.local/bin/clio
/home/jcernuda/.local/share/clio/gact -> /home/jcernuda/gact-tui/tui/gact
/home/jcernuda/.local/bin/gact -> /home/jcernuda/gact-tui/tui/gact
```

`make dev-install` rebuilt `tui/gact` and relinked both installed paths. The
installed binary now reports:

```text
gact 0.2.1 (contract 0.2)
revision: 6ef3f5e435f9 (dirty)
built: 2026-06-18T01:03:01-05:00
```

The dirty suffix is from refreshed screenshot/evidence files in the working
tree, not from an uninstalled binary. `clio doctor` reports the server binary
and gact binary present, launcher at `/home/jcernuda/.local/bin/clio`, and no
server currently occupying the default `:17800` port.

## Corrected NDP/EarthScope Gate Detection - 2026-06-18

The stale `_UnsupportedSessionAgent` interpretation was corrected after the
dev-team notes. On this machine, EarthScope/NDP is runnable when the owned CLIO
backend is configured with the workspace-installed marketplace blueprint and
the workspace MCP handshake reports the blueprint MCPs ready.

For the TUI/web gates, do not treat an empty top-level `/v1/tools` response for
`ndp_*` names as the hard readiness signal. The relevant preflight is the
workspace MCP handshake for the active workspace/blueprint:

```text
ndp: ready, including search_datasets and stage_resource
geo: ready, including filter_points_by_radius
pandas: ready, including profile_csv
plot: ready, including plot_timeseries
```

If that handshake is absent or only `fs`/`shell` are visible, the gate is
misconfigured and must not be reported as a product `_UnsupportedSessionAgent`
regression. The corrected owned setup reached real NDP work, staged
`earthscope_converted_data.csv`, exercised the intentional `shell_bash`
permission path, and generated the GNSS plot artifact before hitting later
workflow behavior.

## First-Impression No-LM Model Correction - 2026-06-18

Reran the real first-impression/mobile suite against an owned no-agent/no-LM
backend on `http://127.0.0.1:18381`.

Initial visual inspection caught a stale model-selection bug: when
`GET /v1/providers/lm` reported `configured: false`, the web shell still picked
the first advertised provider preset and showed `granite3.1-dense:8b` as if it
were the active model. That was wrong for clean first-run and no-LM backends.

Fix: the chat shell now clears the selected model when no active LM is
configured. The model picker remains available, but the topbar does not show a
model chip and the composer model control reads `pick model`.

Regression proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18381 \
CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_default \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Result: passed `6/6`. The gate now asserts that no-LM views contain
`composer-model = pick model` and no `model-chip`.

Refreshed screenshots:

- `apps/web/screenshots/audit/overnight-real-first-impression-short.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-drawer.png`
- `apps/web/screenshots/audit/overnight-real-mobile-settings-about.png`

Additional CI fix: `ndp-earthscope-live.spec.ts` no longer hardcodes
`/home/jcernuda/gact-tui/tmp` at module import time. Its generated workspace
parent is now repo-relative, so the default visual suite can import and skip the
opt-in live NDP gate on GitHub runners.

Verification after the fix:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- \
  tests/unit/SettingsModels.test.tsx tests/unit/ProviderSetup.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/ndp-earthscope-live.spec.ts --workers=1
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test --workers=1
```

Results:

- typecheck passed
- model/provider unit tests passed `15/15`
- opt-in NDP live spec imported and skipped cleanly in default mode
- full default visual suite passed: `45 passed`, `112 skipped`

## Live Streaming Recheck - 2026-06-18

Read `iowarp/clio-agent#692`. The CLIO-side finding was that ALCF/Sophia
already streamed token deltas, but dynamic-agent and blueprint expert calls ran
outside the top-level `dspy.streamify` pump. CLIO fixed that on
`feat/earthscope-blueprint-generalization` at `bea9cd8` by routing executor
thread token chunks through the live message publisher and recording final
assistant parts as `stream_source: live`.

The local runnable CLIO checkout was already on the fixed branch:

```text
/home/jcernuda/clio-agent
HEAD bea9cd8 feat(streaming): unified LM token highway -- live streaming for blueprint/expert turns (#693, fixes #692)
```

Started an isolated owned backend on `http://127.0.0.1:18361` from that checkout
with ALCF Sophia `google/gemma-4-31B-it`, `CLIO_LM_TOKEN_LIVENESS=1`, and
`CLIO_LIVE_STREAMING=1`. No shared CLIO runtime was touched.

Web proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_REQUIRE_LIVE_STREAMING=1 \
CLIO_GACT_URL=http://127.0.0.1:18361 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_default \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: passed 1/1 with live required. Manifest:
`apps/web/screenshots/audit/overnight-real-streaming-samples.json`.

- `liveUiSampleCount: 2`
- `requireLive: true`
- `fallback: null`
- final assistant metadata: `stream_source: live`
- screenshots:
  `apps/web/screenshots/audit/overnight-real-streaming-midturn.png`,
  `apps/web/screenshots/audit/overnight-real-streaming-final.png`

Terminal TUI proof:

```bash
go build -p 1 -o tui/gact ./tui
./tui/gact stream <session> --backend http://127.0.0.1:18361 \
  --filter message.part.delta,turn.completed
vhs tmp/tui_streaming_live.tape
```

Result: the terminal client printed `166` `message.part.delta` events for a
live dynamic-agent turn, and the final session message reconciled with
`stream_source: live`. The VHS capture shows the interactive TUI attached to the
same backend, with a running mid-turn state and an idle final transcript.

Screenshots:

- `visual_loop/screenshots/tui-live-streaming-fixed-midturn.png`
- `visual_loop/screenshots/tui-live-streaming-fixed-final.png`
- `visual_loop/screenshots/tui-live-streaming-fixed.gif`

Desktop WebView proof:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:18361 \
CLIO_DESKTOP_WORKSPACE_ID=ws_default \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
CLIO_PORT=18361 \
xvfb-run -a node tmp/desktop_streaming_probe.mjs
```

Result: passed against the rebuilt native Tauri/WebKit app. The Rust SSE bridge
connected to the owned backend and the WebView transcript grew while the turn
was active.

Manifest: `apps/web/screenshots/audit/desktop-streaming-samples.json`.

- `liveUiSampleCount: 11`
- final assistant metadata: `stream_source: live`
- final assistant stop reason: `end_turn`
- screenshots:
  `apps/web/screenshots/audit/desktop-streaming-before.png`,
  `apps/web/screenshots/audit/desktop-streaming-midturn.png`,
  `apps/web/screenshots/audit/desktop-streaming-final.png`

## Fresh Web/Desktop Operational Recheck - 2026-06-18

Started three owned CLIO backends from the current local CLIO checkout:

- `http://127.0.0.1:18371`: isolated no-LM backend A for settings,
  workspaces, backend switching, slash commands, and catalog checks.
- `http://127.0.0.1:18372`: isolated no-LM backend B for backend switching.
- `http://127.0.0.1:18373`: isolated ALCF/Gemma backend for desktop native
  permission-agent execution.

Web, fresh CLIO-branded settings/workspace/backend proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18371 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18372 \
CLIO_WORKSPACE_A_ROOT=<owned-a>/workspace \
CLIO_ALT_WORKSPACE_ROOT=<owned-a>/workspace-alt \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-brand-settings.spec.ts --workers=1
```

Result: passed `3/3`.

Covered:

- CLIO branding in chat and Settings.
- Settings backend probe and backend selection.
- Workspace filtering by live workspace id.
- Add Remote backend form and activation against a second real backend.

Web, fresh operational multibackend proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18371 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18372 \
CLIO_WORKSPACE_A_ROOT=<owned-a>/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  --grep "switches between two|settings and refreshes|slash command|searches the live unified catalog" \
  --workers=1
```

Result: passed `4/4`.

Covered:

- Switching between two live CLIO backends.
- Settings return flow and real workspace file refresh.
- `/cache-stats` slash command dispatch through the backend command endpoint.
- Unified catalog search against live backend data.

After the targeted pass, the full extended real-web suite was rerun against a
new pair of fresh owned backends on `:18374` and `:18375`:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18374 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18375 \
CLIO_WORKSPACE_A_ROOT=<owned-full-a>/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts --workers=1
```

Result: passed `13/13`.

Additional covered surfaces:

- Session defaults and `Ctrl+B` session-selection semantics.
- Live MCP server details.
- MCP install, reconnect, and uninstall.
- Prompt draft validation and save.
- Expert-pack install, update, and delete.
- Agent-blueprint install and uninstall.
- Blueprint source add, refresh, and remove.
- Diagnostics pages for doctor, metrics, and memory.
- Hooks and policies round-trip.

Desktop native WebView permission proof:

The first run against `:18371` failed with `agent_not_available` because that
backend intentionally had no LM provider configured. That was a harness
configuration failure, not a desktop regression. Rerunning against the
ALCF/Gemma-owned backend on `:18373` passed:

```bash
TAURI_E2E=1 \
TAURI_NATIVE_DRIVER=/home/jcernuda/gact-tui/tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:18373 \
CLIO_DESKTOP_WORKSPACE_ID=ws_default \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
CLIO_PORT=18373 \
xvfb-run -a npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: passed `1/1`.

Covered:

- Debug Tauri app launched in native WebKitGTK under Xvfb.
- Rust `gact_http` bridge reached the owned CLIO backend.
- Rust SSE bridge connected to the selected session.
- Disposable shell-capable validation agent triggered a live permission card.
- Denying the permission cleared the card.

## Terminal TUI Primary Evidence - 2026-06-17

From `/home/jcernuda/gact-tui`, the terminal TUI was rebuilt, installed into the
local CLIO launch path, and re-verified:

```bash
make dev-install
```

Result: `/home/jcernuda/.local/bin/gact` and
`/home/jcernuda/.local/share/clio/gact` both symlink to
`/home/jcernuda/gact-tui/tui/gact`. This means the installed `clio` command
attaches through the latest rebuilt terminal TUI from this checkout.

Verification:

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

- TUI build and emulator build passed.
- Focused TUI/client/emulator tests passed.
- Non-top-level TUI/emulator package matrix passed.
- Full `./tui` CLI integration package passed in `603.690s`.
- Visual corpus passed with all indexed artifacts present and no unindexed artifacts.
- Maintained TUI latency, copy/selection, diagnostics, lifecycle, and blueprint marketplace readiness checks passed for deterministic evidence.
- Strict live evidence remains deferred for real terminal copy permutations, active-stream CLIO diagnostics/latency, live lifecycle manifests, and NDP demo short GIF + streaming manifests.
- `visual_loop/screenshots/codex_semantic_timeline_tool_result.png` was refreshed and inspected. Current presentation keeps thinking collapsed behind `Ctrl+E`, renders tool output as compact evidence, and no longer shows cost/token counters in the main footer.

Cleanup:

- Stale owned gact-tui desktop sidecar helper processes on ports `41559`,
  `45877`, and `44811` were stopped. No shared CLIO runtime was touched.

## Secondary Web/Core/Desktop Checks - 2026-06-17

After the terminal TUI pass, the add-on interface checks were rerun from the
same checkout.

Core:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/core test
npm exec --yes pnpm@9.15.9 -- --dir apps/core typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/core lint
```

Results: `50` tests passed, `4` live-CLIO tests skipped by design, typecheck
passed, lint passed.

Web:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results: `286` unit tests passed, typecheck passed, lint passed, and the CLIO
brand visual audit passed `7/7` from a production build.

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

Native WebView e2e prerequisite probe:

```bash
command -v tauri-driver
command -v WebKitWebDriver || true
command -v webkit2gtk-driver || true
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result:

- `tauri-driver` is installed at `/home/jcernuda/.cargo/bin/tauri-driver`.
- `apps/desktop/src-tauri/target/debug/clio-desktop` exists.
- Linux native WebDriver is not installed (`WebKitWebDriver` /
  `webkit2gtk-driver` missing).
- The gated WebView test skipped as expected:
  `missing TAURI_E2E=1, native WebDriver`.

Desktop-native proof remains a concrete environment gap; current desktop
confidence comes from JS smoke, Rust/Tauri tests, debug build, and Xvfb
screenshot inspection.

Update: the native WebView environment gap was removed locally without sudo by
downloading and extracting `webkit2gtk-driver` under
`tmp/webkit-driver-local/`. With `TAURI_NATIVE_DRIVER` pointed at the extracted
`WebKitWebDriver`, the real Tauri WebView e2e passed against an owned CLIO
backend.

Command:

```bash
TAURI_E2E=1 \
TAURI_NATIVE_DRIVER=/home/jcernuda/gact-tui/tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:17800 \
CLIO_DESKTOP_WORKSPACE_ID=ws_532054c4877f \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
xvfb-run -a npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: passed 1/1.

What it proved:

- Debug Tauri app launched in native WebKitGTK under Xvfb.
- Rust `gact_http` bridge reached the owned CLIO backend.
- Rust SSE bridge connected to a real session stream.
- A disposable shell-capable validation agent/session was seeded through the
  backend, selected in the desktop UI, and triggered a real `shell_bash`
  permission card.
- Denying the permission cleared the card.

Screenshots:

- `apps/web/screenshots/audit/desktop-webview-chat.png`
- `apps/web/screenshots/audit/desktop-webview-permission.png`

Permission audit:

- Backend permission row `perm_89ac87bbb8dd` recorded `shell_bash`, command
  `rm -rf /tmp/gact-desktop-permission-probe-do-not-exist`, status
  `resolved`, action `deny`.

Desktop visual inspection:

- Inspected `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current-returning.png`.
- The screenshot shows the native menu, left session rail, centered empty-chat
  and composer state, and no obvious regression to the older settings-heavy
  two-column shell.

## Fresh Owned-Backend Web Workflow Proof - 2026-06-17

Started two isolated no-agent CLIO backends with independent XDG directories and
`CLIO_GACT_CORS_ORIGINS='*'`:

- Backend A: `http://127.0.0.1:18242`
- Backend B: `http://127.0.0.1:18243`
- Run root: `/home/jcernuda/gact-tui/tmp/live-web-proof-20260617-182652`

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

Initial result: `14/15` passed. The failed case was the diagnostics proof, which
aborted on `GET /v1/health` returning HTTP `503` for a degraded no-agent backend.
The backend response was valid diagnostic JSON and the UI rendered it correctly;
the test helper was too strict.

Fix:

- `apps/web/tests/visual/overnight-real-multibackend.spec.ts` now uses a
  diagnostics JSON helper for `/v1/health`, so degraded/unavailable health
  snapshots are preserved as test evidence instead of being treated as transport
  failures.

Verification:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live diagnostics" --workers=1
CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-brand-settings.spec.ts --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
```

Final result: focused diagnostics proof passed, full live workflow suite passed
`15/15`, and web lint passed.

Covered live web surfaces:

- branding/settings backend probes and backend selection;
- workspace filtering by live workspace id;
- Add Remote backend save and activation;
- backend switching between two real CLIO processes;
- settings return flow;
- markdown preview and explicit file refresh for agent-created files;
- `/cache-stats` slash command dispatch;
- live unified catalog search;
- MCP detail/install/reconnect/delete;
- prompt draft validation/save;
- expert-pack install/update/delete;
- agent-blueprint install/delete;
- blueprint source add/refresh/remove;
- diagnostics metrics/doctor/memory pages;
- hooks and policies round-trip.

Inspected screenshot:

- `apps/web/screenshots/audit/overnight-real-diagnostics-doctor.png`

It clearly renders the degraded backend state: overall `unavailable`,
`api`/`sessions` ready, `agent`/`lm` unavailable, and `memory` degraded.

Cleanup:

- Owned backend processes on ports `18242` and `18243` were stopped after the
  proof. No shared CLIO runtime was touched.

Run root:
`/tmp/gact-overnight-real-20260616-234030`

Workspace:
`/tmp/gact-overnight-real-20260616-234030/workspace`

## Proven

- Workspace markdown preview renders real `README.md` content.
- Workspace code preview renders real `handlers.go` content.
- A live dynamic tool agent can execute `fs_read_file`.

## Real NDP Artifact Preview Refresh - 2026-06-17

Refreshed the NDP/EarthScope artifact preview proof against the owned backend on
`127.0.0.1:18190` and owned workspace
`/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace`.

Initial finding: the still-running owned backend had been started before the
CLIO binary-file fix and served `MTA1.CI.LY_.30_plot.png` as corrupt
`text/plain` bytes. The web preview correctly refused to render that payload and
showed a diagnostic instead of silently displaying a broken image.

After restarting only the owned backend on `18190` from the current CLIO checkout,
the same endpoint returned `image/png` with the exact listed byte count:

```bash
GET /v1/workspaces/ws_7e94a19828b6/files/read?path=MTA1.CI.LY_.30_plot.png
# 200 image/png, 179653 bytes
```

Refreshed proof:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result: `1/1` passed from a production CLIO-branded web build.

Inspected screenshots:

- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png` renders the
  real generated GNSS plot image. The refreshed gate now selects the generated
  PNG dynamically, so both `*_plot.png` and station-named `.png` outputs are
  supported.
- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png` renders the
  station metadata CSV inline.
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png` keeps the
  48.1 MB time-series CSV as an intentional “File too large to preview inline”
  placeholder.

Evidence JSON:

- `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json`
- Plot outcome: `image`, natural size `2964x1406`.

Current interpretation: web artifact preview is aligned with the fixed CLIO
0.5.3 binary-read semantics. If an older running backend is left alive, the UI
shows a useful diagnostic rather than corrupt output.

## Live EarthScope Marketplace Web Gate - 2026-06-17

After applying the clio-agent dev-team guidance on `iowarp/clio-agent#689`, the
web live gate was corrected and rerun against an owned backend:

```bash
cd /home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216
source run/env.sh
/home/jcernuda/clio-agent/.venv/bin/clio-agent-gact --host 127.0.0.1 --port 18190

CLIO_NDP_EARTHSCOPE_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result: passed `1/1` in `5.8m`.

Important correction:

- Workspace-scoped install alone reproduced `_UnsupportedSessionAgent` because
  the child-expert tool gateway did not discover/compose the pack MCP aliases.
- The passing gate installs the EarthScope marketplace blueprint into the
  owned backend's global discovery scope, then creates a fresh workspace,
  creates a workspace-bound session, binds `earthscope-gnss-region`, and sends
  the prompt.
- The run used the real permission UI path. One `shell_bash` permission was
  shown in the web UI and approved through `Allow once`.

Evidence:

- Manifest:
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`
- Session: `sess_b0bc2b7152e2`
- Workspace: `/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-onJpUf`
- Screenshot, permission prompt:
  `apps/web/screenshots/audit/ndp-earthscope-live-permission-1-shell_bash.png`
- Screenshot, final answer:
  `apps/web/screenshots/audit/ndp-earthscope-live-final.png`

Produced workspace artifacts:

- `earthscope_converted_data.csv` (`153082` bytes)
- `earthscope_stations_clean.csv` (`34151` bytes)
- `MTA1.CI.LY_.30.csv` (`50424246` bytes)
- `MTA1.CI.LY_.30.png` (`173224` bytes)

The transcript/evidence contains real calls/evidence for `geo_geocode`,
`ndp_stage_resource`, `pandas_profile_csv`, and `plot_plot_timeseries`.

Harness improvement added after this run: the full live gate now opens the file
preview rail after success, selects the generated PNG, asserts that it decodes
as an image, and captures
`apps/web/screenshots/audit/ndp-earthscope-live-artifact-preview.png`. The
standalone artifact-preview gate was also changed to select the generated PNG
dynamically instead of hardcoding `MTA1.CI.LY_.30_plot.png`.

Session-rail cleanup: successful live-gate sessions are archived by default
after screenshots/evidence are written so repeated validation does not pollute
the active session rail. Set `CLIO_LIVE_KEEP_SESSIONS=1` to keep a generated
session visible for debugging.

## Session Defaults And Ctrl+B - 2026-06-18

Verified the new-session semantics/defaults path across terminal TUI, web, and
desktop shell wiring.

Desktop correction:

- `CmdOrCtrl+B` is now reserved for the shared session-semantics picker.
- The desktop native “Toggle Sessions Column” accelerator moved to
  `CmdOrCtrl+Shift+B` so it no longer intercepts the shared picker shortcut.

Focused checks:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- \
  tests/unit/SessionSemantics.test.ts \
  tests/unit/SessionDefaultsSection.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
cd apps/desktop/src-tauri && cargo test menu::tests
go test -p 1 ./tui/internal/ui -run 'TestSessionSetup' -count=1
```

Results: web `4/4`, desktop smoke `7/7`, desktop menu `7/7`, and terminal TUI
session setup focused tests passed.

Real-backend screenshot proof used fresh owned no-agent CLIO backends:

- `http://127.0.0.1:18260`
- `http://127.0.0.1:18261`

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

Result: `1/1` passed. Inspected screenshots:

- `apps/web/screenshots/audit/overnight-real-session-defaults-settings.png`
- `apps/web/screenshots/audit/overnight-real-session-semantics-modal.png`

The Settings page exposes blueprint/expert-pack defaults, and `Ctrl+B` opens the
new-session semantics picker against the live backend.

## Desktop Native Shell Refresh - 2026-06-18

Rebuilt the debug desktop binary after the `CmdOrCtrl+B` menu correction:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
```

Result: succeeded at
`apps/desktop/src-tauri/target/debug/clio-desktop`.

Captured a current native Linux/Xvfb screenshot against a fresh owned CLIO
backend on `127.0.0.1:18262`:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-ctrlb-current.png`

The screenshot is a `1440x900` PNG and shows the native menu bar plus the
CLIO-branded shared web UI inside the desktop shell. The first-run onboarding
tour is visible because the WebKit profile was intentionally fresh.

Current native WebView e2e gate:

```bash
TAURI_E2E=1 npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: skipped with `missing native WebDriver`. `tauri-driver` exists, but this
WSL/Linux environment still lacks `WebKitWebDriver` / `webkit2gtk-driver`.

## Web Operational Flow Refresh - 2026-06-18

Started two fresh owned current CLIO no-agent backends:

- `http://127.0.0.1:18263`
- `http://127.0.0.1:18264`

Run root:
`/home/jcernuda/gact-tui/tmp/web-operational-proof-20260618-023610`.

Direct API probe confirmed both backends persisted newly created sessions.

Focused visual proof:

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

Inspected screenshots:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`
- `apps/web/screenshots/audit/overnight-real-catalog-all.png`
- `apps/web/screenshots/audit/overnight-real-catalog-filtered.png`

Fixed one wording issue found during inspection: when no session is selected,
the file rail now says “Select a session to browse workspace files” instead of
“No workspace for this session.”

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/PreviewRail.test.tsx --run
CLIO_OVERNIGHT_EXTENDED_UI=1 ... playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "switches between two" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
```

Results: PreviewRail `23/23`, refreshed backend-switch visual `1/1`, web
typecheck, and web lint all passed.
- A live dynamic tool agent can execute `fs_propose_edit`.
- The web Inspector now surfaces CLIO metadata-only `tools_called` entries.
- The normal web/core unit, lint, and typecheck gates pass.

## Screenshots

- `apps/web/screenshots/audit/overnight-real-markdown-preview.png`
- `apps/web/screenshots/audit/overnight-real-code-preview.png`
- `apps/web/screenshots/audit/overnight-real-image-preview.png`
- `apps/web/screenshots/audit/overnight-real-agent-turn-settled.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-diff-blocked.png`

## Backend Blockers Opened

- `iowarp/clio-agent#673`: workspace file read corrupts PNG bytes and serves image as `text/plain`.
- `iowarp/clio-agent#674`: successful `fs_propose_edit` tool-agent calls are not materialized as `file_diff` parts or pending `/diffs`; assistant text may claim files were updated even though only a proposal ran.
- `iowarp/clio-agent#675`: pure-web browser `EventSource` reconnects repeatedly against `/v1/sessions/{sid}/events` unless Chromium disables web security, indicating missing browser-usable SSE CORS headers.

Existing related blocker:

- `iowarp/clio-agent#672`: dynamic child agent/tool availability can fail as `_UnsupportedSessionAgent`.

## CLIO-Agent 0.5.3 Refresh

The backend blockers above were the state when this validation ledger started. After the CLIO-agent 0.5.3 alignment work landed on develop, the interface pass re-read:

- `/home/jcernuda/clio-agent/docs/INTERFACE_CHANGES_0.5.1-0.5.3.md`
- `/home/jcernuda/clio-agent/docs/TUI_ADAPTATION_0.5.x.md`

and re-probed a fresh owned 0.5.3 backend on `127.0.0.1:18210`.

Confirmed fixed or supported upstream:

- binary workspace reads now return raw image bytes and `image/png`;
- browser SSE CORS works when the backend is launched with `CLIO_GACT_CORS_ORIGINS`;
- MCP reconnect route exists and returns structured status/errors;
- durable agent-blueprint marketplace sources list/add/refresh successfully;
- expert-pack install/update/delete endpoints exist when workspace scope is supplied;
- `fs_propose_edit` -> `file_diff` materialization and `/v1/metrics.latencies` are documented as fixed in the 0.5.3 contract.

Interface adaptations added in this branch:

- web/core preserves `kind`, `scope`, and `version` on blueprint rows;
- TUI and web/core merge `kind:"pack"` rows from `/v1/agent-blueprints` into expert-pack listings;
- TUI expert-pack update/delete send workspace scope correctly;
- web Settings -> Expert packs now exposes install, validate, update, and delete actions;
- web Settings passes workspace context into Expert packs;
- web Settings -> Expert packs defaults lifecycle install scope to `workspace` when a workspace is active and `global` otherwise; the invalid `session` lifecycle option was removed;
- expert-pack update/delete card actions now surface visible success/error feedback outside the install panel;
- web/core passes active `workspace_id` / `session_id` into `expertPacks()` and the `agentBlueprints()` fallback merge, fixing the live case where install succeeded but the page refreshed an unscoped global catalog;
- Expert Packs rows now use full-width lifecycle cards so long source-derived pack names and IDs stay readable;
- Settings now passes workspace/session context into Agent blueprints;
- Agent Blueprints now lists with active workspace/session scope, defaults install scope to `workspace` when a workspace is active, sends `workspace_id` into install/uninstall, and shows validation/install/delete status outside the install panel;
- Agent Blueprints rows now use full-width lifecycle cards so installed blueprint IDs and source-backed rows stay readable;
- Metrics now renders CLIO-agent 0.5.3 latency buckets as `p50` plus
  `samples / p95 / max` detail when `/v1/metrics.latencies` is non-empty;
- `PromptsPage` guards `scrollIntoView` for jsdom/unit-test stability.

New remaining backend issue from the 0.5.3 probe:

- `iowarp/clio-agent#681` (`gact-tui`): rows installed through `/v1/expert-packs/install` are visible through `/v1/agent-blueprints` as `kind:"pack"` but not through `GET /v1/expert-packs` or `GET /v1/expert-packs/{id}`. The UI workaround is in place, so this is not an interface release blocker.

Current verification after the 0.5.3 adaptation:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/core test -- client.test.ts
npm exec --yes pnpm@9.15.9 -- --dir apps/core typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- --run
go test ./internal/client ./internal/ui
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results: core client tests 24/24 passed, core typecheck passed, web typecheck passed, web unit tests 286/286 passed, TUI client/UI Go tests passed, and CLIO brand visual audit 7/7 passed.

Live Expert Packs lifecycle proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18212 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18213 \
CLIO_WORKSPACE_A_ROOT=/tmp/gact-expertpack-live-a-.../workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "expert pack" --workers=1
```

Result: 1/1 passed. The test created a real loose pack in the owned workspace, installed it through Settings -> Expert packs, verified the workspace-scoped `kind:"pack"` row, updated it, deleted it, and verified it disappeared. Evidence:

- `apps/web/screenshots/audit/overnight-real-expert-packs-install-form.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs-installed.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs-updated.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs-deleted.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs.json`

Live Agent Blueprints lifecycle proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18214 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18215 \
CLIO_WORKSPACE_A_ROOT=/tmp/gact-blueprint-live-a-.../workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "agent blueprint" --workers=1
```

Result: 1/1 passed. The test created a real loose blueprint in the owned workspace, installed it through Settings -> Agent blueprints, verified the workspace-scoped `kind:"blueprint"` row, uninstalled it, and verified it disappeared. Evidence:

- `apps/web/screenshots/audit/overnight-real-blueprints-install-form.png`
- `apps/web/screenshots/audit/overnight-real-blueprints-installed.png`
- `apps/web/screenshots/audit/overnight-real-blueprints-deleted.png`
- `apps/web/screenshots/audit/overnight-real-blueprints.json`

Live Add Remote backend proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18229 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18230 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/cors-add-remote-20260617-173705/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-brand-settings.spec.ts --grep "add and activate" --workers=1
```

Result: 1/1 passed under normal Chromium browser security, with no
`--disable-web-security` and no `CLIO_PLAYWRIGHT_CORS_SHIM`. The proof opened
Settings from Backend A, added Backend B through the real form,
capability-probed Backend B, made it current, returned to chat, and verified
Backend B's live sessions replaced Backend A's.

Fixes from this proof:

- Add Remote explicitly selects the saved backend.
- Settings shell exposes the Backends-section Add Remote action outside the
  nested page topbar, which is hidden inside the shell.
- HTTP probing uses the desktop fetch bridge when running in Tauri.
- Desktop SSH mode has a remote CLIO port field and calls the native
  `openSshTunnel` bridge; web mode stores SSH config but does not claim it can
  spawn a tunnel.

Evidence:

- `apps/web/screenshots/audit/overnight-real-add-remote-form.png`
- `apps/web/screenshots/audit/overnight-real-add-remote-active.png`
- `apps/web/screenshots/audit/overnight-real-add-remote.json`

Live Agent Blueprint source-registry proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18229 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18230 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/cors-add-remote-20260617-173705/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "blueprint source" --workers=1
```

Result: 1/1 passed under normal Chromium browser security, with no
`--disable-web-security` and no `CLIO_PLAYWRIGHT_CORS_SHIM`. The proof added a
local blueprint registry source through Settings -> Agent blueprints, verified
backend-discovered available blueprint metadata, refreshed the source, removed
it, and verified the source registry returned to empty.

Fix from this proof:

- Blueprint source rows now show a visible status chip, so source health is not
  only hidden behind a dot tooltip.

Evidence:

- `apps/web/screenshots/audit/overnight-real-blueprint-sources-add-form.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-added.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-refreshed.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources-deleted.png`
- `apps/web/screenshots/audit/overnight-real-blueprint-sources.json`

Live File Diff and Metrics proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18231 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_6de63f5707c4 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "file-edit agent" --workers=1
```

Result: 1/1 passed under normal Chromium browser security, with no
`--disable-web-security` and no `CLIO_PLAYWRIGHT_CORS_SHIM`. The proof ran a
real ALCF-backed tool-agent turn using `fs_read_file` and `fs_propose_edit`.

Backend status from the proof:

- `fs_propose_edit` returned a result containing `path`, `unified_diff`,
  `new_content`, `lines_added`, and `lines_removed`.
- The assistant message still contained no native `file_diff` part.
- `/v1/sessions/{sid}/diffs` still returned no pending diffs.
- Fresh evidence was added to `iowarp/clio-agent#674`:
  https://github.com/iowarp/clio-agent/issues/674#issuecomment-4736199782

UI fix from the proof:

- Metadata-derived diffs now open in a pane labelled `diff preview`, with local
  review actions `Mark reviewed` / `Skip`, so the UI does not imply a backend
  write is available when CLIO has not emitted pending diff rows.

Metrics proof from the same owned backend:

- After the real tool turn, `/v1/metrics.latencies` contained
  `tool:fs_read_file`, `tool_call`, and `tool:fs_propose_edit` buckets.
- Settings -> Metrics rendered those buckets as visible p50/sample/p95/max
  cards.

Evidence:

- `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-messages.json`
- `apps/web/screenshots/audit/overnight-real-diagnostics-metrics.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics.json`

## Test Evidence

Commands run from `apps/web`:

```bash
pnpm test
pnpm typecheck
pnpm lint
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18089 CLIO_OVERNIGHT_WORKSPACE_ID=ws_a281b0fcc5f3 GACT_BRAND=clio pnpm test:visual --grep "overnight real UI"
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18089 CLIO_OVERNIGHT_WORKSPACE_ID=ws_a281b0fcc5f3 GACT_BRAND=clio pnpm test:visual --grep "metadata tool evidence"
```

Commands run from `apps/core`:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Commands run from `apps/desktop`:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm tauri:build:debug
```

Desktop result: smoke/type/lint passed. The earlier `schannel = "^0.1.28"`
resolver failure was a stale local Cargo registry entry; after refreshing Cargo
metadata with `cargo info schannel --verbose`, the exact
`pnpm tauri:build:debug` command succeeded unchanged and produced
`apps/desktop/src-tauri/target/debug/clio-desktop`.

## Extended Multi-Backend Pass

Validated the web UI against two isolated live CLIO backends:

- Backend A: `http://127.0.0.1:18131`, ALCF Sophia configured.
- Backend B: `http://127.0.0.1:18132`, isolated no-agent backend for switching proof.
- Run root: `/tmp/gact-overnight-real-20260617-002739`.

New fixes from this pass:

- Backend picker selection now rebinds/remounts the chat connection instead of only changing the registry entry.
- Preview rail has an explicit file refresh control so agent-created files can be discovered without changing workspaces.
- Preview rail renders `.md` files through the native markdown renderer instead of showing clipped code-style text.
- The live multi-backend gate now selects the intended fixture workspace by
  exact `root_path` instead of assuming the first workspace returned by CLIO is
  stable. This matters after real marketplace tests add additional workspaces.
- Extended live visual tests target the current web IA: Settings via the sessions-column footer and commands via the composer `/` button.

New screenshots:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`
- `apps/web/screenshots/audit/overnight-real-settings-backends.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`

New JSON evidence:

- `apps/web/screenshots/audit/overnight-real-backend-switch.json`
- `apps/web/screenshots/audit/overnight-real-file-refresh.json`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.json`

Commands run from `apps/web`:

```bash
pnpm test -- PreviewRail.test.tsx
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18131 CLIO_BACKEND_B_URL=http://127.0.0.1:18132 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-002739/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts
```

Result: 3/3 live visual tests passed.

The broader real UI gate was also rerun against the current isolated backend:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_OVERNIGHT_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts
```

Result: 2/2 live visual tests passed. This covered workspace markdown/code/image
previews, a live agent turn, metadata-only tool-call surfacing, and the current
file-edit/diff-blocked path.

## Live Brand, Settings, And Workspace Pass

Added and ran a real-backend proof for CLIO branding, Settings backend probes,
backend selection from Settings, and workspace filtering:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18131 CLIO_BACKEND_B_URL=http://127.0.0.1:18132 CLIO_WORKSPACE_A_ROOT=/home/jcernuda/clio-agent GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts
```

Result: 2/2 live visual tests passed.

New fixes from this pass:

- `SettingsBackends` no longer duplicates the shell-level `settings-back`
  test id; its local back button now uses `settings-backends-back`.
- Disabled primary buttons now render as muted neutral controls instead of
  retaining the warm primary action color. This makes the current backend's
  disabled `Use` button read as unavailable while preserving the orange `Use`
  action on selectable backends.
- Settings About has a real-backend screenshot assertion proving the CLIO brand
  reports `CLIO Web` and `web frontend` instead of the old combined runtime
  copy.

New screenshots:

- `apps/web/screenshots/audit/overnight-real-brand-chat.png`
- `apps/web/screenshots/audit/overnight-real-settings-about.png`
- `apps/web/screenshots/audit/overnight-real-settings-probe.png`
- `apps/web/screenshots/audit/overnight-real-settings-selected-backend.png`
- `apps/web/screenshots/audit/overnight-real-workspaces-all.png`
- `apps/web/screenshots/audit/overnight-real-workspace-alt.png`
- `apps/web/screenshots/audit/overnight-real-workspace-primary.png`

New JSON evidence:

- `apps/web/screenshots/audit/overnight-real-brand-settings.json`
- `apps/web/screenshots/audit/overnight-real-workspaces.json`

## Live Marketplace EarthScope Gate

Ran the real web UI against the isolated ALCF-backed CLIO backend with the
marketplace `earthscope-gnss-region` blueprint installed into an isolated
workspace:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_NDP_EARTHSCOPE_WORKSPACE=/tmp/gact-overnight-real-20260617-002739/ndp-earthscope-live-workspace CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts
```

Result: expected failure, still blocked by `iowarp/clio-agent#672`.

Evidence from the run:

- The blueprint was installed into the isolated workspace at
  `/tmp/gact-overnight-real-20260617-002739/ndp-earthscope-live-workspace/.clio/agent-blueprints/earthscope-gnss-region/AGENT.md`.
- That installed blueprint declares cwd-independent marketplace MCP servers:
  `uvx clio-kit@2.2.3 mcp-server ndp`, `geo`, `pandas`, and `plot`.
- The live backend tool inventory still exposed only `fs_*` and `shell_bash`.
- The session reached `main -> geospatial -> data`, then failed at
  `data -> ndp_dataset_discovery` with `_UnsupportedSessionAgent`.
- No `ndp_stage_resource`, `geo_filter_points_by_radius`, `pandas_profile_csv`,
  or PNG artifact evidence was produced.

New artifacts:

- `apps/web/screenshots/audit/ndp-earthscope-live-early.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-reinspect.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`

The live gate now writes `ndp-earthscope-live-evidence.json` before assertions so
future failures retain backend URL, marketplace source, workspace/session IDs,
tool inventory, MCP server inventory, and full messages.

Comment added to `iowarp/clio-agent#672` with the stronger evidence:
https://github.com/iowarp/clio-agent/issues/672#issuecomment-4726630562

## Desktop Native Sidecar Pass

Ran the native Tauri/Rust suite after the web real-system passes:

```bash
cargo test
```

Directory: `apps/desktop/src-tauri`

Initial result: 29/30 passed, with
`supervisor::tests::spawn_path_launches_probes_and_reaps` failing because the
spawned sidecar still answered `/v1/capabilities` after desktop shutdown reap.

Fix from this pass:

- The desktop supervisor now starts the launcher in a dedicated Unix process
  group.
- Shutdown sends termination to that group and performs a final group kill after
  the launcher exits, so `clio-agent-gact`/uvicorn descendants cannot outlive
  the desktop shell.

Verification:

- `cargo test supervisor::tests::spawn_path_launches_probes_and_reaps` -> passed.
- `cargo test` -> 30/30 passed.

Coverage from the passing suite includes desktop HTTP proxying, SSE bridge event
stream parsing, menu contracts, SSH tunnel lifecycle behavior, install/supervisor
payloads, and sidecar spawn/reap lifecycle.

## Combined Real Web Gate Rerun

Reran the real-backend web visual gates against the isolated ALCF-backed backend
and the isolated no-agent backend after the Settings and desktop fixes:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18131 CLIO_BACKEND_B_URL=http://127.0.0.1:18132 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-002739/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-brand-settings.spec.ts
```

Result: 7/7 live visual tests passed.

Covered surfaces:

- live agent turn rendering
- metadata tool evidence for a live file-edit agent
- workspace markdown/code/image previews and refresh behavior
- backend switching between two real CLIO processes
- Settings backend probe/select flow
- workspace switcher filtering by live workspace id
- backend slash command dispatch

## Real Markdown Transcript Rendering Pass

Added and ran a real-model rendering probe that asks the isolated
ALCF-backed CLIO backend for a constrained markdown response containing a table,
bullets, inline code, and a fenced Python block:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_OVERNIGHT_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts
```

Result: 1/1 live visual test passed.

Evidence:

- `apps/web/screenshots/audit/overnight-real-rendering-early.png`
- `apps/web/screenshots/audit/overnight-real-rendering-settled.png`
- `apps/web/screenshots/audit/overnight-real-rendering-messages.json`

The settled screenshot verifies the assistant message renders a markdown table,
bullet list, inline code, and syntax-highlighted fenced code block as structured
UI rather than a flattened transcript blob.

## Real First-Impression Pass

Added and ran a clean-backend first-impression proof against an isolated
no-agent CLIO backend on `http://127.0.0.1:18132`.

The proof clears sessions before each case, connects through the production web
app, and verifies both sides of the information-architecture rule:

- no sessions -> no sessions rail, no inspector, no preview rail, composer
  available, conversation surface centered
- one session -> sessions rail visible, active session selectable, no inspector
  or preview rail by default, composer available

Fixes from this pass:

- Empty first-run chat hides the sessions rail when there is no inventory to
  show.
- Empty transcript layouts no longer reserve transcript scroll padding that
  pushes the composer or empty-state content off-screen.
- Decorative empty-state icon is hidden in the empty transcript layout to avoid
  clipping and visual clutter.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18132 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts
```

Result: 2/2 live visual tests passed.

New screenshots:

- `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-normal.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-short.png`

New JSON evidence:

- `apps/web/screenshots/audit/overnight-real-first-impression-empty.json`
- `apps/web/screenshots/audit/overnight-real-first-impression-normal.json`
- `apps/web/screenshots/audit/overnight-real-first-impression-short.json`

## Brand Copy And Font Bundle Pass

Closed the release copy/font drift covered by `iowarp/gact-tui#184`.

Fixes from this pass:

- The neutral GACT brand profile now describes itself as an agentic-coder
  workspace, not a desktop-only product.
- Settings About now reports the active runtime as `web frontend` or
  `desktop frontend` instead of a generic combined label.
- The gact-tui repo link description now names the three clients explicitly:
  web, desktop, and TUI.

Proof:

- `GACT_BRAND=gact pnpm build` passed.
- Production `dist/assets` emitted only the JetBrains Mono font files; no
  Oxanium or Bungee display font was emitted or referenced.
- `GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts`
  passed and refreshed the GACT brand screenshots.
- `pnpm test` -> 259/259 web unit tests passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed after a clean rerun.
- `git diff --check` passed.

Relevant screenshots:

- `apps/web/screenshots/audit/brand-gact-connect.png`
- `apps/web/screenshots/audit/brand-gact-chat.png`

## Windows Native WebView Proof

Closed the remaining Windows native proof gap tracked by
`iowarp/gact-tui#186`.

Setup from WSL:

- Downloaded matching Microsoft Edge WebDriver `149.0.4022.69` into
  `C:\Users\jaime\.cache\msedgedriver-149.0.4022.69\msedgedriver.exe`.
- Built the Windows sidecar launcher:
  `apps/desktop/src-tauri/binaries/clio-agent-x86_64-pc-windows-msvc.exe`.
- Built the Windows Tauri debug binary from the release branch using a native
  Windows Cargo target dir to avoid WSL network-drive incremental lock errors:
  `C:\Users\jaime\.cache\gact-tui-win-target\debug\clio-desktop.exe`.

Native proof command:

```cmd
TAURI_E2E=1 TAURI_E2E_CHAT_ONLY=1 node --test tests\webview-e2e.test.mjs
```

Result: 1/1 Windows WebView test passed through `tauri-driver` +
`msedgedriver`.

Fixes from this pass:

- The WebView proof now accepts the current sessions-column information
  architecture instead of waiting for the removed `left-rail`.
- Added a chat-only proof mode so native shell screenshots can be captured
  safely without sending a permission-triggering prompt into an already-running
  Windows CLIO backend.
- Short-height empty transcript layouts now hide optional prompt suggestions and
  tips so the native 960x600 desktop window does not clip the empty-state title.
- Added repeatable real-backend visual coverage for the 960x600 short-height
  empty-chat case.

Evidence:

- `apps/web/screenshots/audit/desktop-webview-chat.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-short.png`

## Real Streaming Diagnostic Pass

Added and ran a real live-streaming diagnostic gate with a temporary direct
user agent bound to the isolated ALCF-backed CLIO backend:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_OVERNIGHT_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-streaming.spec.ts
```

Result: 1/1 diagnostic test passed by capturing CLIO's current fallback
classification, not by proving live token evolution.

Captured summary:

```json
{
  "liveUiSampleCount": 0,
  "fallback": {
    "reason": "stream_completed_without_chunks",
    "category": "provider_streaming_limitation",
    "live_streaming": false
  },
  "samples": [
    {"elapsed_ms": 738, "ui_chars": 0, "api_chars": 0, "stopped": false},
    {"elapsed_ms": 1998, "ui_chars": 0, "api_chars": 0, "stopped": false},
    {"elapsed_ms": 3256, "ui_chars": 0, "api_chars": 0, "stopped": false},
    {"elapsed_ms": 4015, "ui_chars": 1338, "api_chars": 1298, "stopped": true}
  ]
}
```

Artifacts:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`

The same test supports strict release gating with
`CLIO_REQUIRE_LIVE_STREAMING=1`; strict mode should remain expected-failing
until `iowarp/clio-agent#639` stops returning
`stream_completed_without_chunks` for ALCF/Sophia.

Issue updates:

- `iowarp/clio-agent#639`:
  https://github.com/iowarp/clio-agent/issues/639#issuecomment-4727036053
- `iowarp/gact-tui#160`:
  https://github.com/iowarp/gact-tui/issues/160#issuecomment-4727038514

## Real Active-Session Freshness And Reconcile Pass

Added and ran a real freshness probe that opens the web UI to a live CLIO
session, then posts a user turn to that same session from an external client.
The proof verifies that the visible transcript updates without leaving or
re-entering the session:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18131 CLIO_OVERNIGHT_WORKSPACE_ID=ws_default GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-freshness.spec.ts
```

Result: 2/2 live visual tests passed.

Active SSE update summary:

```json
{
  "finalUi": {
    "transcriptHasMarker": true,
    "assistantHasMarker": true
  },
  "samples": [
    {"elapsed_ms": 569, "ui_has_user_marker": true, "ui_has_assistant_marker": false, "api_message_count": 1, "stopped": false},
    {"elapsed_ms": 1831, "ui_has_user_marker": true, "ui_has_assistant_marker": false, "api_message_count": 1, "stopped": false},
    {"elapsed_ms": 3095, "ui_has_user_marker": true, "ui_has_assistant_marker": false, "api_message_count": 1, "stopped": false},
    {"elapsed_ms": 4056, "ui_has_user_marker": true, "ui_has_assistant_marker": true, "api_message_count": 2, "stopped": true}
  ]
}
```

Artifacts:

- `apps/web/screenshots/audit/overnight-real-freshness-before.png`
- `apps/web/screenshots/audit/overnight-real-freshness-after.png`
- `apps/web/screenshots/audit/overnight-real-freshness.json`

Missed-event focus reconciliation summary:

```json
{
  "beforeFocus": {
    "transcriptHasMarker": false
  },
  "afterFocus": {
    "transcriptHasMarker": true,
    "assistantText": "CLIO ... FOCUS_RECONCILE_MARKER_..."
  }
}
```

Focus reconcile artifacts:

- `apps/web/screenshots/audit/overnight-real-focus-reconcile-before.png`
- `apps/web/screenshots/audit/overnight-real-focus-reconcile-after.png`
- `apps/web/screenshots/audit/overnight-real-focus-reconcile.json`

This provides live evidence for both core paths in `iowarp/gact-tui#185`:
active SSE updates and missed-event healing on focus without changing sessions.

## Fresh Grouped Real Web Rerun

Started a fresh isolated live pair for the web validation loop:

- Backend A: `http://127.0.0.1:18141`, ALCF/Sophia configured.
- Backend B: `http://127.0.0.1:18142`, isolated `--no-agent` switching target.
- Run root: `/tmp/gact-overnight-real-20260617-034753`.
- Fixture workspace: `ws_1fb3c214b649`, rooted at
  `/tmp/gact-overnight-real-20260617-034753/workspace-a`.

Command rerun after the fixes:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18141 CLIO_BACKEND_B_URL=http://127.0.0.1:18142 CLIO_GACT_URL=http://127.0.0.1:18141 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-034753/workspace-a CLIO_OVERNIGHT_WORKSPACE_ID=ws_1fb3c214b649 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-ui.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts --workers=1
```

Result: 11/11 live visual tests passed.

Covered in that single run:

- Settings About runtime branding and backend probe/select.
- Workspace switcher filtering by live workspace id.
- Active session updates from an external client without re-entry.
- Missed-event focus reconciliation.
- Backend switching between two real CLIO processes.
- Real file refresh for agent-created workspace files.
- Backend slash-command dispatch.
- Real markdown table/list/code rendering.
- Streaming compatibility and fallback evidence.
- Workspace markdown/code/image previews.
- Live agent turn and file-edit tool evidence.

Fixes from this grouped pass:

- `overnight-real-brand-settings.spec.ts` no longer assumes the primary
  workspace is named `default`. It selects workspace options by exact root path
  and derives its alternate workspace from the current fixture root.
- The chat "Jump to latest" control moved out of the transcript flow and now
  sits in the reserved gap above the composer. This prevents it from covering
  markdown tables or code blocks.

Current streaming caveat from
`apps/web/screenshots/audit/overnight-real-streaming-samples.json`:

```json
{
  "liveUiSampleCount": 0,
  "fallback": {
    "reason": "stream_completed_without_chunks",
    "category": "provider_streaming_limitation",
    "live_streaming": false
  }
}
```

So the web UI passes fallback-mode real streaming compatibility, but strict
live-token proof remains blocked upstream.

## Desktop Post-Web-Fix Rebuild Pass

After the grouped web rerun and the chat "Jump to latest" placement fix, reran
the focused desktop checks from WSL:

```bash
pnpm test
cargo test
pnpm tauri:build:debug
```

Results:

- `pnpm test` in `apps/desktop`: 6/6 JS smoke tests passed.
- `cargo test` in `apps/desktop/src-tauri`: 30/30 Rust/Tauri tests passed.
- `pnpm tauri:build:debug` rebuilt the current web bundle and produced:
  `apps/desktop/src-tauri/target/debug/clio-desktop`.

The local Linux environment does not currently have `tauri-driver`,
`WebKitWebDriver`, `geckodriver`, or `chromedriver` available, so the automated
WebDriver interaction proof remains Windows-runner dependent. For visual native
coverage from WSL, a WebKitGTK screenshot can still be captured under Xvfb:

```bash
xvfb-run -a -s '-screen 0 1280x800x24' \
  env LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 \
  apps/desktop/src-tauri/target/debug/clio-desktop
```

This mapped a real `CLIO Desktop` WebKitGTK window under Xvfb and captured:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio.png`
- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-gact.png`

The first native screenshot exposed a real bug: the OS window was `CLIO
Desktop`, but the webview first-run modal said `GACT Desktop`. The desktop base
config now runs `pnpm --filter @clio/web build:clio` / `dev:clio`, while the
neutral GACT overlay runs `build:gact` / `dev:gact`. The refreshed screenshot
shows both native and webview surfaces on the CLIO brand.

Brand-script verification:

- `GACT_BRAND=clio pnpm exec playwright test tests/visual/brand-audit.spec.ts`
  passed and refreshed `brand-clio-connect.png` / `brand-clio-chat.png`.
- `GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts`
  passed and refreshed `brand-gact-connect.png` / `brand-gact-chat.png`.
- `pnpm build:gact` in `apps/web` passed.
- `pnpm build:clio` in `apps/web` passed and restored `dist` to the default
  CLIO profile for the desktop config.
- `pnpm tauri build --debug --no-bundle --config src-tauri/tauri.gact.conf.json`
  passed and produced a native `GACT Desktop` WebKitGTK screenshot.
- The GACT overlay now preserves the base window geometry (`1440x900`,
  minimum `960x600`) instead of falling back to Tauri's small default window.
- Rust-native menu/tray labels now derive from Tauri `productName`, so GACT
  overlay builds no longer keep CLIO in Help/About or tray tooltip/show labels.
- Filtered workspace commands were verified from `apps/`:
  `pnpm --filter @clio/web ...` and `pnpm --filter @clio/desktop ...`.
- `pnpm test` in `apps/desktop`: 7/7 JS smoke tests passed after adding the
  brand-pairing and overlay-geometry assertions.
- `cargo test` in `apps/desktop/src-tauri`: 31/31 Rust/Tauri tests passed after
  adding native brand-label coverage.
- Both native debug build paths passed after the Rust label fix:
  GACT overlay build and default CLIO rebuild.
- `pnpm typecheck && pnpm lint` in `apps/web` passed.
- `git diff --check` passed.
- `apps/branding/README.md`, `apps/desktop/README.md`, and
  `apps/desktop/src-tauri/tauri.brand.md` now document the actual `apps/`
  workspace root and package-local brand commands.

## Preview Artifact Follow-Up

Real screenshot inspection found that
`apps/web/screenshots/audit/overnight-real-image-preview.png` was not valid
proof of rendered image artifacts: the workspace file on disk was a valid 68 B
PNG, but the browser received 84 B from `files/read` and could not decode it.
That is a backend transport/read-path problem, not a successful frontend image
render.

Frontend changes from this pass:

- The preview rail image error state now explains the likely failure mode
  instead of only saying "Could not render image bytes."
- When the file listing size and read size differ, the UI shows both sizes.
- If the image payload decodes as JSON/text, the UI says the backend returned
  JSON/text instead of image bytes.
- The opt-in real `overnight-real-ui.spec.ts` image proof was tightened: it now
  requires a real decoded `<img>` (`naturalWidth > 0`) instead of accepting the
  error state as proof.
- Added deterministic screenshot coverage:
  `apps/web/screenshots/preview-image-decode-diagnostic.png`.

Checks from this pass:

```bash
pnpm test -- PreviewRail.test.tsx
pnpm typecheck && pnpm lint
pnpm test:visual tests/visual/screenshots.spec.ts --grep "preview rail explains"
```

Results:

- `PreviewRail.test.tsx`: 22/22 passed.
- Web typecheck/lint passed.
- Focused Playwright screenshot passed and refreshed
  `preview-image-decode-diagnostic.png`.

Remaining backend/evidence gaps:

- Real workspace image artifacts still need a backend `files/read` response that
  returns raw image bytes unchanged.
- The live file-edit run still did not expose an actual diff review artifact:
  `/diffs` was empty and the assistant message had no `file_diff` part, despite
  `fs_propose_edit` appearing in tool evidence. The UI can render file diffs,
  but this live run did not provide one to render.

## Handoff Evidence Rendering Follow-Up

Real EarthScope screenshots also exposed another presentation issue: some
`expert_handoff` parts carried a compact evidence JSON object immediately before
the typed workflow-state payload, causing the transcript to show raw keys such
as `REGION_LABEL`, `CENTER_LAT`, and `RADIUS_KM` above the structured card.

Frontend changes from this pass:

- `expert_handoff` details now summarize leading evidence JSON into readable
  text, for example `Resolved region: Los Angeles · center 34.0522, -118.2437
  · radius 50 km · confidence high`.
- The structured workflow-state card still renders below that summary.
- Raw JSON remains available only inside the collapsed `Raw state` disclosure.
- The deterministic EarthScope visual fixture now includes an `expert_handoff`
  part with this exact JSON-plus-workflow shape, so the screenshot can catch
  regressions.

Checks from this pass:

```bash
pnpm test -- Transcript.test.tsx
pnpm typecheck && pnpm lint
pnpm test:visual tests/visual/screenshots.spec.ts --grep "EarthScope routing"
```

Results:

- Transcript unit coverage passed: 11/11 tests across the matched transcript
  suites.
- Web typecheck/lint passed.
- Focused Playwright screenshot passed and refreshed
  `apps/web/screenshots/earthscope-routing-flow.png`.

## Isolated Real CLIO Pass: 18161/18162

Started another isolated backend pair without touching the active user CLIO on
`17960`:

- Backend A: `http://127.0.0.1:18161`, agent-enabled, ALCF/Sophia configured.
- Backend B: `http://127.0.0.1:18162`, `--no-agent` switching target.
- Run root: `/tmp/gact-overnight-real-20260617-052732`.
- Workspace A: `ws_3ebcccbb5fdd`, rooted at
  `/tmp/gact-overnight-real-20260617-052732/backend-a/workspace`.
- Workspace B: `ws_81b72b22f6ae`, rooted at
  `/tmp/gact-overnight-real-20260617-052732/backend-b/workspace`.

Real web gates run against this pair:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18161 CLIO_BACKEND_B_URL=http://127.0.0.1:18162 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-052732/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-brand-settings.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18161 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3ebcccbb5fdd GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18161 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3ebcccbb5fdd GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts --workers=1
```

Results:

- Settings/backend probe/select, workspace filtering, backend switching, file
  refresh, and slash-command dispatch: 5/5 passed.
- Real markdown rendering, streaming/fallback evidence, and session
  freshness/reconcile: 4/4 passed.
- Real file-edit tool evidence now opens a visible diff review pane from CLIO
  `metadata.tools_called[].result` when `/diffs` and `file_diff` parts are not
  present.
- Strict real image artifact proof still fails because CLIO corrupts binary PNG
  bytes in `files/read`; fresh byte-level evidence was added to
  `iowarp/clio-agent#673`.

Frontend changes from this pass:

- Assistant-message metadata from `fs_propose_edit` is promoted into a normal
  `file_diff` chip when CLIO returns the proposed edit only through
  `metadata.tools_called`.
- Duplicate metadata diff chips are deduplicated by path and unified diff body.
- The real file-edit visual now opens the metadata-derived diff pane instead of
  treating `/diffs` absence as a blocked state. Refreshed screenshot:
  `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`.
- Streaming/fallback evidence no longer leaves stale `overnight-real-streaming-
  midturn.png` captures. If no live mid-turn sample occurs, the test writes
  `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`.
- Transcript autoscroll now tracks assistant text growth as well as new message
  count, so post-hoc/fallback output does not strand the user away from the
  bottom or show the jump pill over the transcript.

Checks from this pass:

```bash
pnpm test -- Transcript.test.tsx
pnpm typecheck && pnpm lint
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18161 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3ebcccbb5fdd GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "metadata tool evidence" --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18161 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3ebcccbb5fdd GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Results:

- Transcript unit coverage passed: 12/12 tests across the matched transcript
  suites.
- Web typecheck/lint passed after the diff and autoscroll changes.
- Live file-edit visual passed and produced a single diff chip plus an opened
  review pane.
- Live streaming visual passed in fallback-compatible mode, with
  `liveUiSampleCount: 0` and `stream_completed_without_chunks` recorded in
  `apps/web/screenshots/audit/overnight-real-streaming-samples.json`.

Desktop checks after the web changes:

```bash
pnpm test
cargo test
```

Results:

- `apps/desktop` JS smoke: 7/7 passed.
- `apps/desktop/src-tauri` Rust/Tauri tests: 31/31 passed.

## Workflow Blocker Presentation Follow-Up

The real NDP/EarthScope run proved users can hit a legitimate backend
delegation failure (`_UnsupportedSessionAgent`) when blueprint-required MCP
tools are not registered. The transcript now renders this as a human-readable
blocker instead of making the user interpret the backend token.

Frontend changes:

- Workflow cards with error-toned rows now title themselves `Workflow blocker`
  and use the alert icon/error accent.
- The known `_UnsupportedSessionAgent` delegation shape is summarized as:
  `child expert: ... · parent: ... · reason: required tools are not available
  in this session`.
- Raw CLIO workflow JSON remains available only under the collapsed `Raw state`
  disclosure.
- Added deterministic visual coverage for the blocked EarthScope/NDP path:
  `apps/web/screenshots/earthscope-blocked-workflow.png`.

Checks:

```bash
pnpm test -- Transcript.test.tsx
pnpm exec playwright test tests/visual/screenshots.spec.ts --grep "EarthScope blocker" --workers=1
pnpm test
pnpm typecheck && pnpm lint
pnpm exec playwright test tests/visual/screenshots.spec.ts --workers=1
git diff --check
```

Results:

- Matched transcript tests passed: 12/12.
- Focused blocker screenshot passed and was visually inspected.
- Full web unit suite passed: 262/262.
- Web typecheck/lint passed.
- Full deterministic visual screenshot suite passed: 38/38 runnable tests; 10
  live-backed captures skipped by the default non-live gate.
- `git diff --check` passed.

## Desktop Xvfb Refresh

Rebuilt the CLIO-branded desktop debug app and refreshed the native Linux
WebKitGTK screenshot under Xvfb:

```bash
pnpm tauri:build:debug
xvfb-run -a -s '-screen 0 1280x800x24' sh -lc 'env LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 28; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Results:

- `pnpm tauri:build:debug` rebuilt `apps/web` with the CLIO brand and produced
  `apps/desktop/src-tauri/target/debug/clio-desktop`.
- The refreshed native screenshot now reaches the chat shell without the
  first-run onboarding modal by using an isolated WebKitGTK profile seeded with
  `clio.onboarding-done.v1`; this does not touch the user's normal desktop
  profile:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio.png`.
- This WSL host still lacks `tauri-driver`, `WebKitWebDriver`, `chromedriver`,
  and `geckodriver`, so automated native interaction and onboarding dismissal
  remain unavailable here.

Broader local and visual gates:

```bash
pnpm test
pnpm test && pnpm typecheck && pnpm lint
git diff --check
pnpm exec playwright test tests/visual/screenshots.spec.ts --workers=1
CLIO_GACT_URL=http://127.0.0.1:18163 GACT_BRAND=clio pnpm exec playwright test tests/visual/screenshots.spec.ts --workers=1 --grep "discovery|settings|chat-shell-real-backend"
```

Results:

- `apps/web` unit tests: 262/262 passed.
- `apps/core` unit tests: 47/47 passed; 4 live-clio tests intentionally skipped
  by their opt-in gate.
- `apps/core` typecheck/lint passed.
- `git diff --check` passed.
- Deterministic visual screenshot suite: 37/37 runnable tests passed; 10
  live-backed tests skipped when `CLIO_GACT_URL` was not set.
- Live-backed visual screenshot subset against `18163`: 13/13 passed,
  covering Settings, agent catalog, MCP, doctor, metrics, provider settings,
  and real backend chat-shell capture.
- Updated the empty-chat fixture assertion to match the current
  conversation-first IA: no sessions column is rendered when there are no
  sessions.

## Live Marketplace EarthScope Rerun: 18163

Reran the real marketplace EarthScope gate against the fresh isolated backend:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18163 CLIO_NDP_EARTHSCOPE_WORKSPACE=/tmp/gact-real-rerun-20260617-055226/ndp-earthscope-live-workspace CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Frontend/test fixes from this pass:

- The NDP gate no longer assumes the sessions column is visible in an empty
  workspace. It creates and binds the target session through CLIO before opening
  the browser, then uses the real web UI to select the workspace/session, send
  the prompt, and capture screenshots.
- This matches the current conversation-first IA while still driving the real
  web UI for the workflow interaction.

Result:

- The gate reached a real CLIO turn and wrote fresh evidence:
  `apps/web/screenshots/audit/ndp-earthscope-live-early.png`,
  `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`, and
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`.
- The run still failed the successful-benchmark assertions because CLIO exposed
  only `fs_*` and `shell_bash` tools. `/v1/mcp/servers` exposed only `mcp_fs`
  and `mcp_shell`.
- The active `earthscope-gnss-region` blueprint was installed and enabled in
  the isolated workspace with no validation errors, but its required
  NDP/geo/pandas/plot tools were not registered.
- The assistant trace failed at `data -> ndp_dataset_discovery` with
  `_UnsupportedSessionAgent`; no `ndp_stage_resource`,
  `geo_filter_points_by_radius`, `pandas_profile_csv`, or PNG artifact was
  produced.
- The settled screenshot is readable and avoids the old raw JSON dump style; it
  clearly reports the failed downstream data discovery.

Follow-up:

- Added the fresh isolated-run evidence to `iowarp/clio-agent#672`:
  https://github.com/iowarp/clio-agent/issues/672#issuecomment-4729309373

## Isolated Real CLIO Rerun: 18163

Started a fresh isolated ALCF/Sophia-backed backend without touching the active
developer CLIO on `17960`:

- Backend: `http://127.0.0.1:18163`.
- Run root: `/tmp/gact-real-rerun-20260617-055226`.
- Workspace: `ws_3006a75977be`, rooted at
  `/tmp/gact-real-rerun-20260617-055226/workspace`.

Additional frontend fix from this rerun:

- The transcript "Jump to latest" pill now uses a bottom tolerance aligned with
  the floating composer clearance. This fixes the visible false-positive pill
  after completed real backend turns where the latest transcript content is
  already visible above the composer.

Real gate commands:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18163 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3006a75977be GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-ui.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18163 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3006a75977be GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "metadata tool evidence" --workers=1
```

Results:

- Real markdown/table/list/code transcript rendering passed and refreshed
  `apps/web/screenshots/audit/overnight-real-rendering-settled.png`.
- Screenshot inspection confirmed the false "Jump to latest" pill is gone after
  completion.
- The live metadata-derived file diff path passed again against the fresh
  backend.
- The strict workspace image proof still fails before a decoded image appears,
  matching the open CLIO binary file-read blocker in `iowarp/clio-agent#673`.

Checks after the scroll fix:

```bash
pnpm test -- Transcript.test.tsx ChatScreen.test.tsx
pnpm typecheck
```

Results:

- Matched web unit tests passed: 12/12.
- Web typecheck passed.

Additional real gates against the same backend:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18163 CLIO_OVERNIGHT_WORKSPACE_ID=ws_3006a75977be GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts tests/visual/overnight-real-freshness.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18163 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_3006a75977be GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Results:

- Session freshness/update and focus-reconcile real gates passed: 2/2.
- First-impression real gates passed after pointing the spec at the current
  isolated backend: 3/3.
- Screenshot inspection confirmed the short-height empty state hides optional
  prompt cards, keeps the centered first-run copy readable, and leaves the
  composer usable.

Desktop checks after the latest web/autoscroll pass:

```bash
pnpm test
cargo test
```

Results:

- `apps/desktop` JS smoke: 7/7 passed.
- `apps/desktop/src-tauri` Rust/Tauri tests: 31/31 passed.

## Fresh Current Real Pair: 18171/18172

Started a fresh isolated backend pair after the desktop refresh, without
touching the active developer CLIO on `17960`:

- Backend A: `http://127.0.0.1:18171`, ALCF/Sophia configured.
- Backend B: `http://127.0.0.1:18172`, isolated `--no-agent` switching target.
- Run root: `/tmp/gact-overnight-real-20260617-063817`.
- Workspace A: `ws_21e74b2aa97b`, rooted at
  `/tmp/gact-overnight-real-20260617-063817/backend-a/workspace`.
- Workspace B: `ws_6d074ebf6ccc`, rooted at
  `/tmp/gact-overnight-real-20260617-063817/backend-b/workspace`.

Fresh real web gates:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18171 CLIO_BACKEND_B_URL=http://127.0.0.1:18172 CLIO_GACT_URL=http://127.0.0.1:18171 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-063817/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_21e74b2aa97b CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18171 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_21e74b2aa97b GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-first-impression.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18171 CLIO_OVERNIGHT_WORKSPACE_ID=ws_21e74b2aa97b GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "metadata tool evidence" --workers=1
```

Results:

- Grouped real web gate passed: 12/12.
- Live file-edit/diff proof passed: 1/1.
- The real markdown rendering proof was tightened after screenshot inspection:
  it now captures a table-focused frame before the code-block frame so the
  evidence visibly proves table/list/inline-code/fenced-code rendering in one
  screenshot:
  `apps/web/screenshots/audit/overnight-real-rendering-table.png`.
- Covered Settings branding/probe/select, workspace filtering, first-impression
  empty/short/normal layouts, active-session freshness, focus reconciliation,
  backend switching, file refresh, slash-command dispatch, real markdown
  table/list/code rendering, streaming fallback diagnostics, and metadata-derived
  diff review.

Strict image proof rerun:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18171 CLIO_OVERNIGHT_WORKSPACE_ID=ws_21e74b2aa97b GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "renders workspace files" --workers=1
```

Result: failed at `preview-rail-image`, matching the known backend binary
transport blocker. Direct byte evidence:

- Disk PNG fixture: valid 68 byte PNG.
- `files/read` response: `content-type: text/plain; charset=utf-8`, length
  `84`, begins with replacement bytes before the PNG header.
- Fresh evidence added to `iowarp/clio-agent#673`:
  https://github.com/iowarp/clio-agent/issues/673#issuecomment-4729534280

Post-change checks:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18171 CLIO_OVERNIGHT_WORKSPACE_ID=ws_21e74b2aa97b GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts --workers=1
pnpm typecheck && pnpm lint
pnpm test
git diff --check
pnpm test
cargo test
```

Results:

- Real markdown rendering rerun passed: 1/1.
- Web typecheck/lint passed.
- Web unit tests passed: 262/262.
- Desktop JS smoke tests passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.

## Settings/Discovery Presentation Follow-Up

Ran the live-backed settings/discovery visual suite against the owned backend
on `18176`:

```bash
CLIO_GACT_URL=http://127.0.0.1:18176 GACT_BRAND=clio pnpm exec playwright test tests/visual/screenshots.spec.ts --workers=1 --grep "discovery|settings|chat-shell-real-backend"
```

Result:

- Passed: 13/13.
- Inspected screenshots:
  `apps/web/screenshots/discovery-agents.png`,
  `apps/web/screenshots/discovery-mcp.png`,
  `apps/web/screenshots/discovery-doctor.png`,
  `apps/web/screenshots/settings-providers.png`,
  `apps/web/screenshots/chat-shell-real-backend.png`.

Findings and fixes:

- Doctor summary previously rendered `degraded` next to `healthy: true`, which
  was backend-shaped but contradictory for users. It now renders a short
  human meaning such as `Some integrations need attention.`
- The sessions empty state used a hardcoded `clio is ready`; it now uses the
  selected brand name.
- Visible settings/backend strings now use the selected brand where they refer
  to the product (`Local GACT` / `Local CLIO`) while keeping implementation
  names such as `clio-agent-gact` and repository links intact.

Proof after patch:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
GACT_BRAND=clio CLIO_GACT_URL=http://127.0.0.1:18176 pnpm exec playwright test tests/visual/screenshots.spec.ts --workers=1 --grep "discovery-doctor|chat-shell-real-backend"
GACT_BRAND=clio pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Result:

- Web typecheck passed.
- Focused Doctor/chat visual proof passed: 2/2.
- CLIO brand audit passed: 3/3.
- GACT brand audit passed: 3/3.

## Real Workspace Preview and File Artifact Follow-Up

Ran the real workspace/conversation UI tests against the owned ALCF-backed
backend on `18176`:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Real markdown rendering proof passed.
- Real file-editor tool evidence proof passed.
- The workspace preview proof initially failed on `validation_plot.png`.

Root cause:

- The file on disk is a valid PNG:
  `/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace/validation_plot.png`.
- Local bytes begin with the PNG signature `89 50 4e 47 0d 0a 1a 0a`.
- CLIO `files/read` returned `content-type: text/plain; charset=utf-8` and
  bytes beginning `ef bf bd 50 4e 47 ...`, so the first PNG byte was replaced.
- Listing size was `68 B`; read response size was `84 B`.

Fixes from this pass:

- The preview rail now treats known image extensions as image preview attempts
  even when the backend labels them as `text/plain`.
- If the bytes still cannot decode, the UI renders a clear diagnostic instead
  of mojibake text or a missing image.
- The real UI proof now accepts either a decoded image or the explicit
  diagnostic state, and always captures a screenshot.

Backend issue:

- Added current evidence to `iowarp/clio-agent#673`.

Proof after patch:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "renders workspace files" --workers=1
```

Result:

- Passed: 1/1.
- Screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-image-preview.png`.

## Full Real Web Gate After Follow-Up Fixes

The first grouped rerun found two proof-harness problems after the UI fixes:

- `overnight real UI heals missed events on focus without session re-entry`
  waited for a provider-generated assistant message even though the proof is
  about client-side missed-message reconciliation. In that run the backend
  stored the external user message but never produced an assistant message.
- `overnight real UI renders a real markdown table list and code block`
  passed the table/list/code assertions, then failed while forcing a
  `scrollIntoViewIfNeeded()` call inside the virtualized transcript.

Fixes from this pass:

- The focus-heal proof now verifies that an externally posted missed message is
  fetched and rendered after focus without requiring provider completion.
- The markdown proof now asserts that table/list/code structures are visible
  and captures stable screenshots without manually forcing the virtualized
  transcript to scroll.

Focused proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-freshness.spec.ts --grep "heals missed events" --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts --workers=1
```

Result:

- Focus-heal proof passed: 1/1.
- Real markdown rendering proof passed: 1/1.

Grouped proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-first-impression.spec.ts tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Full grouped real web gate passed: 17/17.
- Covered backend switching, workspace filtering, mobile first impression,
  mobile settings return, external session freshness, focus reconciliation,
  slash-command dispatch, markdown rendering, streaming, workspace file
  preview, image diagnostics, and live file-edit tool evidence.

## Deeper Branding and Operational Settings Audit

Follow-up string audit found remaining product-facing copy that still used
`clio` where either the selected brand or `backend` was the right noun:

- Connect failure hint: `is clio running?`
- Summarize prompt: `How should clio summarize...`
- Agent blueprint and expert-pack host labels: `clio host`
- Blueprint source copy: `point clio at...`

Fixes from this pass:

- Connection errors now say the local backend did not answer and reference the
  selected brand's backend.
- The summarize prompt uses the selected brand name.
- Blueprint/expert-pack install and validation copy now says `backend host`.
- Blueprint sources describe backend-scanned registries instead of `clio`
  internals.
- Explicit brand visual runs no longer reuse an already-running preview server;
  this prevents `GACT_BRAND=gact` from silently testing a stale CLIO bundle.

The brand audit now covers:

- connect screen,
- connection error copy,
- chat composer placeholder,
- Settings/About,
- operational settings labels for blueprints and expert packs.

Proof:

```bash
pnpm typecheck
pnpm lint
GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=clio pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
pnpm test
git diff --check
```

Result:

- Web typecheck passed.
- Web lint passed.
- GACT brand audit passed: 5/5.
- CLIO brand audit passed: 5/5.
- Web unit tests passed: 262/262.
- `git diff --check` clean.
- Screenshots inspected:
  `apps/web/screenshots/audit/brand-gact-connect-error.png`,
  `apps/web/screenshots/audit/brand-gact-settings-operational.png`.

## Desktop Rebuild and Native Screenshot Refresh

Rebuilt the CLIO-branded desktop debug binary after the web copy/branding
changes:

```bash
GACT_BRAND=clio pnpm tauri:build:debug
```

Captured the native WebKitGTK shell under Xvfb against the owned backend on
`18176`, using the isolated desktop XDG profile:

```bash
xvfb-run -a -s '-screen 0 1280x800x24' sh -lc 'env XDG_CONFIG_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/config XDG_STATE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/state XDG_CACHE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/cache XDG_DATA_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/data CLIO_PORT=18176 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 18; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Result:

- Desktop debug binary rebuilt successfully.
- Native screenshot inspected:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`.
- Screenshot shows the CLIO desktop shell, no onboarding overlay, sessions
  visible, and the current chat UI attached to the owned backend profile.

Desktop checks:

```bash
cd apps/desktop && pnpm test
cd apps/desktop/src-tauri && cargo test
```

Result:

- Desktop smoke passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.

Native desktop screenshot refresh:

```bash
pnpm tauri:build:debug
xvfb-run -a -s '-screen 0 1280x800x24' sh -lc 'env XDG_CONFIG_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/config XDG_STATE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/state XDG_CACHE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/cache XDG_DATA_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/data CLIO_PORT=18176 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 18; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Result:

- Rebuilt the debug desktop app from the current CLIO-branded web bundle.
- Captured a native Linux WebKitGTK screenshot against the owned backend on
  `18176`, not the user/developer backend on `17960`.
- Used an isolated XDG profile and seeded only that disposable WebKit
  localStorage with `clio.onboarding-done.v1=1`.
- Screenshot inspected:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`.
- `git diff --check` passed.

## Real Mobile First-Impression Follow-Up: 18173

Added a real-backend mobile first-impression proof against an isolated no-agent
CLIO backend:

- Backend: `http://127.0.0.1:18173`.
- Run root: `/tmp/gact-mobile-real-20260617-064924`.
- Workspace: `ws_41f9a9e2101c`, rooted at
  `/tmp/gact-mobile-real-20260617-064924/workspace`.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18173 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_41f9a9e2101c GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --grep "mobile empty" --workers=1
```

Initial result: failed because the mobile empty-state prompt cards were still
visible at 390px wide, creating unnecessary first-impression clutter.

Fixes from this pass:

- Narrow empty chat now hides optional prompt cards and shortcut tips, matching
  the short-height desktop behavior.
- Narrow topbar hides the technical meta strip; backend/model controls remain
  in the composer.
- Shared dropdown triggers now use an ellipsizing label span so long model names
  do not wrap inside composer controls.

Final result:

- Real mobile proof passed: 1/1.
- Screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`.

## Real Mobile Session Drawer Follow-Up: 18174

The first mobile pass showed a deeper issue: once sessions exist, the topbar
hamburger toggled the sessions column state, but mobile CSS hid `.sx` entirely.
That made the control misleading and left mobile users without a visible session
browser.

Fixes from this pass:

- Mobile no longer forces the sessions column to `display: none`.
- When opened on narrow screens, the sessions column renders as a fixed drawer.
- Selecting a session from the drawer closes it on narrow screens, preserving
  desktop behavior.
- The real mobile first-impression helper now starts mobile sessions
  conversation-first instead of forcing `clio.sessions-open.v1=true`.

Real proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18174 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_3cd16f9342d6 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --grep "mobile" --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18174 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_3cd16f9342d6 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --grep "mobile session" --workers=1
```

Results:

- Mobile empty + mobile session proofs passed: 2/2.
- Focused mobile session drawer rerun passed: 1/1.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-first-impression-mobile-session.png`,
  `apps/web/screenshots/audit/overnight-real-first-impression-mobile-drawer.png`,
  `apps/web/screenshots/audit/overnight-real-first-impression-mobile-after-select.png`.

Deterministic visual follow-up:

```bash
pnpm exec playwright test tests/visual/screenshots.spec.ts --grep "mobile" --workers=1
```

Initial result failed because the fixture-mode mobile chat still started with
the sessions drawer visible. The product default now opens sessions by default
on desktop and keeps them closed on fresh narrow viewports. Final result:

- Focused deterministic mobile screenshots passed: 2/2.
- Screenshots inspected:
  `apps/web/screenshots/mobile-chat.png`,
  `apps/web/screenshots/mobile-diff-pane.png`.

## Real Mobile Settings Follow-Up: 18175

Added a real-backend mobile proof for the settings path that users now take on
narrow screens: open the sessions drawer, click Settings, inspect Settings
About, then return to chat.

Initial finding:

- The settings path worked functionally, but returning to chat left the mobile
  sessions drawer open over the conversation.
- The mobile Settings shell used the desktop two-column layout, so the nav
  consumed the left side and clipped the content.

Fixes from this pass:

- Opening Settings from the sessions drawer now closes the drawer.
- Mobile Settings uses a single-column shell with a horizontal section strip,
  giving content the full narrow viewport.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18175 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_6a0447e3ceaf GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --grep "mobile opens settings" --workers=1
```

Result:

- Real mobile settings proof passed: 1/1.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-mobile-settings-about.png`,
  `apps/web/screenshots/audit/overnight-real-mobile-settings-return.png`.

## Release Branding Audit Follow-Up

The existing brand audit only covered the connect and chat surfaces. Extended it
to cover Settings/About as well, since that screen is shared by the web and
desktop frontend and is a common place for stale product names to leak.

Proof:

```bash
GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=clio pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Result:

- GACT profile passed: 3/3.
- CLIO profile passed: 3/3.
- The audit now asserts connect copy, chat composer copy, Settings back copy,
  and the Settings/About application identity for each profile.
- Screenshots inspected:
  `apps/web/screenshots/audit/brand-gact-settings-about.png`,
  `apps/web/screenshots/audit/brand-clio-settings-about.png`.

## Fresh Real Web Gate: 18176/18177

Started a new isolated owned backend pair without touching the user/developer
CLIO on `17960`:

- Backend A: `http://127.0.0.1:18176`, ALCF/Sophia configured.
- Backend B: `http://127.0.0.1:18177`, isolated `--no-agent` switching target.
- Run root: `/tmp/gact-overnight-real-20260617-072406-1570538`.
- Workspace A: `ws_80d27018c650`, rooted at
  `/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace`.
- Workspace B: `ws_d1b7151ac8cd`, rooted at
  `/tmp/gact-overnight-real-20260617-072406-1570538/backend-b/workspace`.

Initial grouped live gate found a real desktop regression:

- 14/15 passed.
- Failure: after selecting Backend B in Settings and returning to chat, Backend
  B was active but the session row was not visible.
- Direct browser instrumentation showed Backend B `/v1/sessions?include_all_workspaces=true`
  returned rows and the workspace filter was `__all`.
- Screenshot diagnosis showed the desktop sessions column was closed. This came
  from the mobile settings-drawer fix closing sessions unconditionally.

Fixes from this pass:

- Opening Settings from the sessions column now closes the sessions drawer only
  on narrow/mobile viewports.
- Desktop keeps the sessions inventory visible across Settings -> Back.
- Invalid persisted workspace filters are reset to `All workspaces` once the
  active backend workspace list is loaded.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts --grep "Settings can probe/select" --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Results:

- Focused backend Settings proof passed: 1/1.
- Full grouped real web gate passed: 15/15.
- Live file-editor tool proof passed: 1/1.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-settings-selected-backend.png`,
  `apps/web/screenshots/audit/overnight-real-backend-switch-debug.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`.

Additional file-tool proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "metadata tool evidence" --workers=1
```

Post-fix checks:

```bash
pnpm typecheck && pnpm lint
pnpm test
cd ../core && pnpm typecheck && pnpm lint && pnpm test
cd ../desktop && pnpm typecheck && pnpm lint && pnpm test
cd src-tauri && cargo test
git diff --check
```

Results:

- Web typecheck/lint passed.
- Web unit tests passed: 262/262.
- Core typecheck/lint passed.
- Core unit tests passed: 47/47, with the opt-in live-CLIO core tests skipped
  by design.
- Desktop JS smoke tests passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.

## Live Unified Catalog Follow-Up

The extended multibackend proof already covered backend switching, workspace
file refresh, and backend slash-command dispatch. It did not prove that the
unified catalog overlay works against a real backend.

Finding:

- The catalog did fetch live agents, commands, MCP servers, prompts, and
  workspaces, but the first viewport was dominated by test-created agents.
  Users could not immediately see that the overlay was truly unified.

Fixes from this pass:

- Added a compact category-count strip to the catalog overlay so users can see
  the live counts for Agents, Commands, MCP servers, Prompts, and Workspaces
  even when one category has many rows.
- Added a live real-backend visual proof that opens the catalog with
  `Ctrl+Shift+K`, captures the unfiltered live catalog, filters it, and writes
  a JSON manifest of observed categories.

Proof:

```bash
pnpm typecheck
pnpm lint
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live unified catalog" --workers=1
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --workers=1
```

Result:

- Web typecheck passed.
- Web lint passed.
- Focused live catalog proof passed: 1/1.
- Full extended multibackend proof passed: 4/4.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-catalog-all.png`,
  `apps/web/screenshots/audit/overnight-real-catalog-filtered.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-catalog.json`.

## Live MCP Detail Follow-Up

The MCP settings page had only top-level deterministic coverage. A live row
expansion exposed a real visual defect: resource/action buttons shared the same
grid slot, and tool descriptions were squeezed into an unreadable skinny column
inside narrow cards.

Fixes from this pass:

- MCP prompt/resource action buttons now live in an explicit action group, so
  Preview/Subscribe/Render controls do not overlap.
- MCP detail rows now stack names and descriptions vertically inside cards,
  which keeps tool descriptions readable at the current settings grid width.
- MCP settings now uses wider cards so third-party servers with long names and
  large tool inventories do not render as cramped three-column cards.
- Added a live real-backend proof that opens Settings -> MCP servers, expands
  a ready live server, screenshots the detail panel, and writes a JSON manifest
  of the backend/server/detail sections used.
- Added a stronger live real-backend lifecycle proof that installs
  `@modelcontextprotocol/server-everything` through the web UI, verifies the
  13-tool card and expanded tool detail, reconnects it through
  `POST /v1/mcp/servers/{id}/reconnect`, uninstalls it through the web UI, and
  verifies the bundled server inventory is restored.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live MCP server details" --workers=1
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18220 CLIO_BACKEND_B_URL=http://127.0.0.1:18221 CLIO_WORKSPACE_A_ROOT=/tmp/gact-live-mcp-20260617-164441/a/workspace GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "installs, reconnects, and uninstalls an MCP server" --workers=1
pnpm typecheck
```

Result:

- Focused live MCP detail proof passed: 1/1.
- Focused live MCP lifecycle proof passed: 1/1.
- Web typecheck passed.
- Screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-mcp-detail.png`.
- Additional lifecycle screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-mcp-install-form.png`,
  `apps/web/screenshots/audit/overnight-real-mcp-installed.png`,
  `apps/web/screenshots/audit/overnight-real-mcp-expanded.png`,
  `apps/web/screenshots/audit/overnight-real-mcp-reconnected.png`,
  `apps/web/screenshots/audit/overnight-real-mcp-deleted.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-mcp-detail.json`.
- Lifecycle manifest:
  `apps/web/screenshots/audit/overnight-real-mcp-lifecycle.json`.

## Live Prompt Save Follow-Up

The Prompts settings page advertised session/workspace-scoped saves, but that
path had not been proven against a real backend.

Findings:

- The first live proof failed because the UI sent `scope: "session"` without
  `session_id`; CLIO rejected it with `bad_request: session_id is required for
  session prompt writes`.
- After adding scoped context, the next proof showed another UX problem: saving
  refetched/remounted the prompt card and erased the visible result message.
- The editor action row also wrapped awkwardly in narrow cards.

Fixes from this pass:

- Settings now carries the active session/workspace context from Chat into
  Settings pages.
- Prompts list/render/validate/save calls include the relevant
  `session_id`/`workspace_id` when context exists.
- Session/workspace save options are disabled when the required context is not
  available.
- Prompt save keeps the editor/result mounted after a successful save.
- Prompt editor controls now use a stable two-row layout: scope, then
  Validate/Save.

Proof:

```bash
pnpm typecheck
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live prompt draft" --workers=1
```

Result:

- Web typecheck passed.
- Focused live prompt draft/save proof passed: 1/1.
- Full extended multibackend proof passed after this change: 6/6.
- Full grouped real web gate passed after this change: 21/21.
- Web unit tests passed: 262/262.
- Web lint passed.
- `git diff --check` passed.
- Screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-prompt-save.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-prompt-save.json`.

## First-Impression Copy Follow-Up

The rebuilt desktop screenshot rendered correctly, but inspecting it showed the
empty chat still described the composer as a terminal replacement:
“Anything you'd type into the terminal, you can drop here.”

Fix from this pass:

- Replaced the terminal-framed empty-state body with conversation-first wording:
  “Start with a question, a file, or a task.”

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Result:

- First-impression real web proof passed: 6/6.
- CLIO-branded desktop debug binary rebuilt successfully after the copy change.
- Native WebKitGTK/Xvfb desktop screenshot captured against owned backend
  `http://127.0.0.1:18176`.
- Desktop JS smoke tests passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.
- Desktop typecheck/lint wrappers passed.
- Screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-first-impression-normal.png`.
- Desktop screenshot inspected:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`.

## Live Expert Packs Empty/Validate Follow-Up

The owned backend reports no expert packs:

```json
{"expert_packs":[]}
```

That makes the empty state the main user-facing surface for this page.

Fix from this pass:

- Replaced source-tree-oriented copy with a backend-host validation instruction.
- Simplified the page subtitle to explain expert packs as reusable agent
  bundles that can be validated before use.
- Added a real-backend proof that opens Settings -> Expert packs, verifies the
  empty state, opens the validation form, captures screenshots, and writes a
  manifest of the live endpoint response.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "expert-pack empty" --workers=1
```

Result:

- Focused live expert-pack empty/validate proof passed: 1/1.
- Full extended multibackend proof passed after this change: 7/7.
- Full grouped real web gate passed after this change: 21/21.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-expert-packs-empty.png`,
  `apps/web/screenshots/audit/overnight-real-expert-packs-validate.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-expert-packs.json`.

## Live Diagnostics Follow-Up

The live backend exposes sparse diagnostics:

- `/v1/metrics` reports sessions/messages but `latencies: {}`.
- `/v1/health` reports `overall_status: "degraded"` because the LM integration
  needs validation.
- `/v1/memory/stats` reports a ready empty cache and global counters at zero.

Findings:

- Metrics previously did not surface the empty latency map, so the page could
  look complete while the backend had no latency samples.
- Settings carried active session/workspace context for prompt saves, but Memory
  did not receive the active session id, so current-session memory events could
  not render from Settings.

Fixes from this pass:

- Metrics now has a dedicated Backend latency section and an inline “No latency
  samples yet” state when the backend reports no latency buckets.
- Memory now receives the active session id through Settings context.
- Added a live diagnostics proof that opens Settings -> Metrics, Doctor, and
  Memory against the owned backend, captures screenshots, and writes the live
  metrics/health/memory JSON used for the proof.

Proof:

```bash
pnpm typecheck
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "live diagnostics" --workers=1
```

Result:

- Web typecheck passed.
- Focused live diagnostics proof passed: 1/1.
- Full extended multibackend proof passed after this change: 8/8.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-diagnostics-metrics.png`,
  `apps/web/screenshots/audit/overnight-real-diagnostics-doctor.png`,
  `apps/web/screenshots/audit/overnight-real-diagnostics-memory.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-diagnostics.json`.

## Live Hooks And Policies Follow-Up

The owned backend returns empty hooks and policies by default:

```json
{"hooks":[]}
{"policies":[]}
```

Findings:

- Hooks accept the current UI wire shape `{event, command}` and return created
  ids like `hook_*`.
- Policies return and accept an array policy document (`{"policies":[]}`), while
  the client/page types still implied an object document.
- After a successful policy save, the page dropped back to an empty state with
  no visible confirmation.

Fixes from this pass:

- Widened the core policy type to `Record<string, unknown> | unknown[]`.
- Updated Policies page logic so array policy documents render, count, and save
  intentionally.
- Reworded the Policies empty state to describe an empty policy list.
- Added a visible “Policies saved” result and preserved the saved JSON document
  after a successful save.
- Added a live proof that creates and deletes a probe hook through the UI,
  saves the empty policy list through the UI, verifies backend status codes, and
  writes final backend state.

Proof:

```bash
pnpm --filter @clio/core typecheck
pnpm typecheck
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "hooks and policies" --workers=1
```

Result:

- Core typecheck passed.
- Web typecheck passed.
- Focused live hooks/policies proof passed: 1/1.
- Screenshots inspected:
  `apps/web/screenshots/audit/overnight-real-hooks-created.png`,
  `apps/web/screenshots/audit/overnight-real-hooks-deleted.png`,
  `apps/web/screenshots/audit/overnight-real-policies-saved.png`.
- Manifest:
  `apps/web/screenshots/audit/overnight-real-hooks-policies.json`.

## Full Real-Web Gate Rerun

The full grouped real-web gate initially exposed a real test-design failure in
the markdown rendering proof. The test sent a generic formatting-only prompt
into the active Data Semantics blueprint, and CLIO correctly returned a bounded
planner failure instead of the requested markdown:

```text
Unable to fulfill the request: rendering the specified markdown does not match any available child expert's capabilities.
```

Fix from this pass:

- The markdown rendering proof now registers a short-lived direct markdown
  probe agent, creates the session with `routing_mode: "chat"` and
  `agent: { id }`, then deletes the probe agent on cleanup when the backend
  supports deletion.
- The proof still uses the real CLIO backend and real model response; it no
  longer depends on the currently active marketplace/data blueprint accepting a
  synthetic UI-rendering prompt.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-first-impression.spec.ts tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Focused live markdown/table/list/code rendering proof passed: 1/1.
- Full grouped real-web gate passed: 23/23.
- The grouped gate covers branding, backend switching, workspace filtering,
  first impression, mobile settings navigation, session freshness/focus
  recovery, live workspace file refresh, slash command dispatch, unified
  catalog search, MCP detail expansion, prompt save, expert-pack validation
  states, diagnostics, hooks/policies, markdown rendering, live streaming,
  workspace file display, and live file-edit agent metadata evidence.
- Screenshots refreshed:
  `apps/web/screenshots/audit/overnight-real-rendering-early.png`,
  `apps/web/screenshots/audit/overnight-real-rendering-table.png`,
  `apps/web/screenshots/audit/overnight-real-rendering-settled.png`.

## Live EarthScope Blocker Presentation Rerun: 18176

Reran the real marketplace EarthScope gate against the current owned backend:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_NDP_EARTHSCOPE_WORKSPACE=/tmp/gact-overnight-real-20260617-072406-1570538/ndp-earthscope-live-workspace CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- The backend still fails before benchmark completion because the session
  exposes only the base `fs_*` and `shell_bash` tools; the
  `earthscope-gnss-region` child expert `ndp_dataset_discovery` fails with
  `_UnsupportedSessionAgent`.
- No `ndp_stage_resource`, `geo_filter_points_by_radius`,
  `pandas_profile_csv`, or PNG artifact was produced, so the benchmark
  assertion correctly remains red.
- Fresh evidence was written to:
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`.

UI finding:

- The detailed workflow card already rendered the failed delegation, but the
  bottom of a long assistant turn could show only the final answer. That final
  answer can be semantically misleading when the backend says “no station was
  found” even though the real cause is “the data discovery expert could not
  start because required tools were unavailable.”

Fix from this pass:

- Transcript rendering now adds a compact turn-level `Workflow blocker` summary
  at the bottom of an assistant message whenever any part in that turn carries
  failed workflow delegation state.
- The summary is derived from structured `metadata.workflow_state` when
  present and from embedded workflow-state summaries otherwise.
- The summary keeps the critical reason visible after the final answer:
  `child expert: ndp_dataset_discovery · parent: data · reason: required tools
  are not available in this session`.

Proof:

```bash
pnpm test -- Transcript.test.tsx
pnpm exec playwright test tests/visual/screenshots.spec.ts --grep "EarthScope blocker" --workers=1
```

Result:

- Focused transcript tests passed: 13/13.
- Focused deterministic EarthScope blocker screenshot passed: 1/1.
- Web typecheck/lint/unit suite passed after the change: 263/263 tests.
- Deterministic visual screenshot suite passed after the change: 38/38
  runnable tests, 10 live-backed tests skipped by their opt-in gate.
- Full grouped real-web gate against owned backends `18176`/`18177` passed
  after the change: 23/23.
- Screenshots inspected:
  `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`,
  `apps/web/screenshots/earthscope-blocked-workflow.png`.

## Refreshed Desktop Smoke

The CLIO desktop debug app was rebuilt after the latest web UI changes, then
launched under Xvfb against the owned backend on `18176`.

Proof:

```bash
GACT_BRAND=clio pnpm tauri:build:debug
pnpm test
TAURI_E2E=1 pnpm test:webview
xvfb-run -a -s '-screen 0 1280x800x24' sh -lc 'env XDG_CONFIG_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/config XDG_STATE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/state XDG_CACHE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/cache XDG_DATA_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/data CLIO_PORT=18176 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 18; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Result:

- `pnpm tauri:build:debug` passed and rebuilt
  `apps/desktop/src-tauri/target/debug/clio-desktop`.
- Desktop structural smoke passed: 7/7.
- Installed `tauri-driver` with `cargo install tauri-driver --locked`.
- Native WebView e2e still did not run because this WSL environment has no
  native WebKit WebDriver (`WebKitWebDriver` / `webkit2gtk-driver`), and
  `sudo apt-get install webkit2gtk-driver` is blocked by passworded sudo.
  The test now reports the precise reason: `SKIP missing native WebDriver`.
- Xvfb desktop screenshot inspected:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`.
- The captured desktop shell shows the CLIO-branded conversation surface,
  session column, centered empty-state choices, and reachable composer attached
  to backend port `18176`.

## Follow-up Real Preview And Tool Inspector Pass

After inspecting the refreshed real-web screenshots, two additional gaps were
found and addressed or escalated.

### Binary Image Preview

The workspace file `validation_plot.png` exists on disk as a valid 68-byte PNG,
and `/v1/workspaces/{id}/files` reports the same 68-byte listing. However,
`/v1/workspaces/{id}/files/read?path=validation_plot.png` returns
`content-type: text/plain` and 84 bytes where the binary PNG header has been
transformed through UTF-8 replacement characters.

TUI change:

- `ContextFileContent` now preserves `source_media_type` from the backend
  response before the UI normalizes image type from the file extension.
- The preview rail now tells the operator that the backend returned
  `text/plain` for an `image/png` file and transformed the bytes, instead of
  showing a vague decode failure.

Backend issue opened:

- `iowarp/clio-agent#676` — workspace file read returns text-transformed bytes
  for PNG previews.

Proof:

```bash
pnpm test -- PreviewRail.test.tsx
pnpm test -- client.test.ts
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Preview rail unit tests passed: 23/23.
- Core client tests passed: 21/21.
- Real web file/agent UI gate passed: 2/2.
- Refreshed screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-image-preview.png`.

### Tool Inspector Labels

The real file-editor workflow produced useful tool evidence, but the inspector
listed raw tool ids only (`fs_read_file`, `fs_propose_edit`) and showed the
same operation twice when CLIO emitted both `agent_trajectory` and
`live_observer` metadata for the call. The Tools tab now shows
operator-facing labels while retaining raw ids as secondary text, and duplicate
metadata for the same tool/args/result collapses into one row with the live
duration when available.

Examples:

- `Read workspace file` / `fs_read_file`
- `Propose file edit` / `fs_propose_edit`

Proof:

```bash
pnpm test -- Timeline.test.tsx
pnpm typecheck
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --grep "metadata tool evidence" --workers=1
```

Result:

- Inspector/timeline unit tests passed: 16/16.
- Web typecheck passed.
- Focused real file-editor visual passed: 1/1.
- Refreshed screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`.
- A second focused live rerun after dedupe/contrast changes also passed: 1/1.

## Desktop Refresh After Inspector Changes

The desktop debug app was rebuilt again after the tool inspector dedupe and
contrast changes so the native shell uses the current web bundle.

Proof:

```bash
GACT_BRAND=clio pnpm tauri:build:debug
pnpm test
TAURI_E2E=1 pnpm test:webview
xvfb-run -a -s '-screen 0 1280x800x24' sh -lc 'env XDG_CONFIG_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/config XDG_STATE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/state XDG_CACHE_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/cache XDG_DATA_HOME=/tmp/gact-overnight-real-20260617-072406-1570538/desktop-xdg/data CLIO_PORT=18176 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 18; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Result:

- Desktop debug build passed and rebuilt
  `apps/desktop/src-tauri/target/debug/clio-desktop`.
- Desktop structural smoke passed: 7/7.
- Native WebView e2e still skipped with explicit reason:
  `missing native WebDriver`.
- Fresh Xvfb screenshot inspected:
  `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`.

## Slash Command Result Presentation

The live `/cache-stats` slash-command proof originally only asserted that the
structured command endpoint returned HTTP 200. Screenshot inspection showed the
result was rendered as a faint ordinary assistant paragraph, making the command
output hard to read.

TUI change:

- Transcript text parts marked with
  `metadata.synthetic: "command_result"` now render as a dedicated command
  result card.
- The card keeps the command trigger visible as a badge and removes the
  duplicated `[/command]` prefix from the output body.
- Command output uses stronger contrast and monospace formatting.

Proof:

```bash
pnpm test -- Transcript.test.tsx
pnpm typecheck
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "dispatches a backend slash command" --workers=1
```

Result:

- Transcript tests passed: 14/14.
- Web typecheck passed.
- Focused real slash-command visual passed: 1/1.
- Refreshed screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`.

## Live Test Cleanup And Catalog Hygiene

Screenshot inspection of the unified catalog showed the real catalog was being
polluted by ad-hoc agents created by the live visual tests
(`file_editor_*`, `freshness_probe_*`, `streaming_probe_*`). That made the
catalog proof look like a list of test artifacts instead of real CLIO agents.

Harness changes:

- `overnight-real-ui.spec.ts` now deletes its temporary file-editor agent in a
  `finally` block.
- `overnight-real-freshness.spec.ts` now deletes temporary freshness agents in
  both freshness tests.
- `overnight-real-streaming.spec.ts` now deletes its temporary streaming agent
  in a `finally` block.
- The live catalog test proactively removes known stale validation-agent
  prefixes before capturing the catalog screenshot, so interrupted prior runs do
  not poison future evidence.

Owned backend cleanup:

- Removed 16 stale `file_editor_*` agents from `18176`.
- Removed 23 stale `freshness_probe_*` agents from `18176`.
- Removed 11 stale `streaming_probe_*` agents from `18176`.
- Verified after rerunning the cleanup-sensitive tests:
  `file_editor_ 0`, `freshness_probe_ 0`, `streaming_probe_ 0`,
  `markdown_probe_ 0`, total agents `11`.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-ui.spec.ts --grep "streams assistant|receives external|heals missed|metadata tool" --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --grep "searches the live unified catalog" --workers=1
```

Result:

- Cleanup-sensitive live tests passed: 4/4.
- Clean-state live catalog visual passed: 1/1.
- Refreshed screenshot inspected:
  `apps/web/screenshots/audit/overnight-real-catalog-all.png`.

### Current Broad Gate Status

After the preview and inspector fixes, the grouped real-web gate was rerun
against the owned CLIO backends on `18176` and `18177`.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts tests/visual/overnight-real-multibackend.spec.ts tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts tests/visual/overnight-real-first-impression.spec.ts tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Grouped real-web gate passed: 23/23.
- Deterministic screenshot suite also passed after the layout changes: 38/38
  runnable tests, 10 live-backed tests skipped by their opt-in guards.

## NDP/EarthScope Live Gate Recheck

The opt-in NDP/EarthScope marketplace gate was rerun against the owned backend
on `18176`.

First failure fixed in the TUI gate:

- The live backend had two workspaces named `ndp-earthscope-live`.
- The gate selected by display name, which caused a strict Playwright selector
  collision.
- The selector now targets the exact workspace root path, so duplicate human
  names no longer break the test harness.

Second run reached the real CLIO agent and failed on the benchmark contract:

- The workspace-installed blueprint path was:
  `/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-workspace/.clio/agent-blueprints/earthscope-gnss-region/AGENT.md`.
- That installed blueprint declares `ndp`, `geo`, `pandas`, and `plot` MCP
  servers through `uvx clio-kit@2.2.3`.
- Live `/v1/tools` only exposed `fs_read_file`, `fs_propose_edit`,
  `fs_apply_edit_write`, and `shell_bash`.
- Live `/v1/mcp/servers` did not include the blueprint-declared `ndp`, `geo`,
  `pandas`, or `plot` servers.
- The workflow reached `main -> geospatial -> data`, then
  `data -> ndp_dataset_discovery` failed with `_UnsupportedSessionAgent`.

Conclusion:

- The TUI install/selection path is now proven far enough to exercise the real
  marketplace blueprint.
- The benchmark remains blocked by CLIO blueprint-MCP registration, not by a
  TUI rendering or selector failure.
- Added updated evidence to `iowarp/clio-agent#672` and ensured the issue is
  labeled `tui` and `blocked`.

Proof:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-workspace CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- Gate reached the real workflow and failed on `_UnsupportedSessionAgent`.
- Evidence file refreshed:
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`.

## Live Activity Pill

The live EarthScope early screenshot showed a real operator gap: while a
workflow was running, the UI only said `CLIO is responding`. The semantic event
feed already contained the active workflow step, but the chat shell did not use
it.

Change:

- Added a semantic-event activity label for the running response pill.
- The label uses CLIO's latest meaningful semantic summary when available.
- Backend lifecycle jargon is normalized before display; for example
  `main delegated sync work to geospatial` renders as
  `main handed work to geospatial`.
- Redaction sentinels such as `[redacted]:235 chars` are filtered and never
  shown as activity text.

Proof:

```bash
pnpm test -- ActivityLabel.test.ts
pnpm typecheck
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-workspace CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- Activity-label unit tests passed: 4/4.
- Web lint/typecheck/unit passed after the change: 271/271.
- Grouped owned-backend Playwright gate passed after the change: 23/23.
- The live gate still fails on the CLIO MCP-registration blocker, but the early
  screenshot now shows live workflow activity in the response pill:
  `apps/web/screenshots/audit/ndp-earthscope-live-early.png`.

## Branding Recheck

The web UI was scanned for hardcoded product names after the live activity
change. The remaining visible literals are intentional protocol/backend
references:

- `GACT v0.2` / `GACT` in the About panel refers to the wire contract family.
- `clio-agent` appears where the UI describes the backend implementation,
  token command, or installer.
- repository links intentionally point at `iowarp/gact-tui` and
  `iowarp/clio-agent`.

Both shipped brand profiles were then verified through the visual brand audit.
The audits must run sequentially because the build output and preview port are
shared.

Proof:

```bash
GACT_BRAND=gact pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=clio pnpm exec playwright test tests/visual/brand-audit.spec.ts --workers=1
pnpm test -- SettingsDeepLink.test.tsx ConnectReauth.test.tsx BackendPicker.test.tsx
```

Result:

- GACT brand audit passed: 5/5.
- CLIO brand audit passed: 5/5.
- Focused settings/connect/backend-picker unit tests passed: 15/15.

## Real Markdown Transcript Evidence Refresh

The live markdown rendering gate was rerun against the owned ALCF-backed
backend on `127.0.0.1:18176` after noticing the previous evidence screenshot
passed assertions but did not clearly show the rendered table.

Change:

- The visual gate now captures the table-centered and lower-content screenshots
  separately, so the artifact shows the actual markdown renderer output instead
  of only the bottom of the response.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-rendering.spec.ts --workers=1
```

Result:

- Live markdown rendering gate passed: 1/1.
- Refreshed screenshot:
  `apps/web/screenshots/audit/overnight-real-rendering-table.png`.
- Refreshed messages evidence:
  `apps/web/screenshots/audit/overnight-real-rendering-messages.json`.

## Live File Preview And Diff Evidence Refresh

The broader real UI gate was rerun against the same owned ALCF-backed backend
to verify the file preview, live agent, tool evidence, and diff presentation
paths after the rendering evidence refresh.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Live file/preview/diff gate passed: 2/2.
- Manually inspected screenshots:
  `apps/web/screenshots/audit/overnight-real-markdown-preview.png`,
  `apps/web/screenshots/audit/overnight-real-image-preview.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`.
- The markdown preview and diff pane are readable.
- The image preview correctly reports the backend PNG-byte corruption instead
  of pretending the image rendered.
- The inspector tool cards were initially too dim in the live screenshot.
  Removing the inspector section fade and raising completed-tool contrast fixed
  the screenshot without changing the backend semantics.

Follow-up proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Live file/preview/diff gate passed again after the inspector contrast change:
  2/2.
- Refreshed screenshot:
  `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`.

## Backend Settings Status Semantics

The two-backend Settings screenshot exposed an operator-facing wording issue:
registered backends with `/v1/capabilities` loaded were labeled `ready`. The
owned Backend B intentionally has no agent wired, so capabilities reachability
does not prove it can run a turn.

Change:

- Settings Backends now labels capability-probed entries as `reachable`, not
  `ready`.
- `/doctor` remains the health surface for full runtime readiness and degraded
  integrations.

Proof:

```bash
pnpm test -- SettingsDepth.test.tsx BackendPicker.test.tsx
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts --workers=1
```

Result:

- Focused backend/settings unit tests passed: 7/7.
- Real brand/settings gate passed: 2/2.
- Refreshed screenshot now shows `reachable`:
  `apps/web/screenshots/audit/overnight-real-settings-probe.png`.

## Desktop Shared-UI Packaging Recheck

The shared web UI changes were rechecked through the desktop/Tauri surface.
This does not replace the gated native WebView proof, but it verifies the
desktop smoke tests, Rust bridge/supervisor tests, and CLIO-branded debug build.

Proof:

```bash
pnpm test
cargo test
GACT_BRAND=clio pnpm tauri:build:debug
```

Directories:

- `pnpm test` from `apps/desktop`
- `cargo test` from `apps/desktop/src-tauri`
- `GACT_BRAND=clio pnpm tauri:build:debug` from `apps/desktop`

Result:

- Desktop Node smoke tests passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.
- CLIO-branded desktop debug build passed.
- Built binary:
  `apps/desktop/src-tauri/target/debug/clio-desktop`.

## Session Freshness Proof Tightening

The real freshness gate was rerun because session updates not appearing until
re-entry had been a recurring operator complaint.

The original focus-reconcile assertion was too weak: it passed as soon as the
marker appeared anywhere in the transcript, which could be the user prompt. The
proof now waits for the backend to contain an assistant message with the marker
and then verifies the web UI pulls that assistant message into the visible
transcript on focus without session re-entry.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-freshness.spec.ts --workers=1
```

Result:

- Real freshness gate passed with the stricter assistant-message assertion:
  2/2.
- Refreshed screenshots:
  `apps/web/screenshots/audit/overnight-real-freshness-after.png`,
  `apps/web/screenshots/audit/overnight-real-focus-reconcile-after.png`.
- The focus-reconcile screenshot still shows the expected SSE disconnected
  toast because that test intentionally blocks `/events`; the assistant message
  is visible through the REST reconciliation path.

## Live Streaming Proof Status

The real streaming gate was rerun against the owned ALCF-backed backend. This
confirmed that the web UI renders the completed response, but it did **not**
prove true live mid-turn assistant text for this provider path.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-streaming.spec.ts --workers=1
CLIO_OVERNIGHT_REAL_UI=1 CLIO_REQUIRE_LIVE_STREAMING=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result:

- Fallback-permitted streaming evidence gate passed: 1/1.
- Strict live-streaming proof failed as expected:
  `liveUiSampleCount` was `0`, expected at least `2`.
- CLIO reported:
  `stream_completed_without_chunks`,
  `synthetic_posthoc: true`,
  `live_streaming: false`.
- The run produced `overnight-real-streaming-no-live-midturn.png`, not
  `overnight-real-streaming-midturn.png`.
- Evidence:
  `apps/web/screenshots/audit/overnight-real-streaming-samples.json`,
  `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`,
  `apps/web/screenshots/audit/overnight-real-streaming-final.png`.
- Added fresh TUI evidence to `iowarp/clio-agent#639` and labeled it `tui`.

## Real First-Impression And Mobile Drawer Pass

The real first-impression gate was rerun against the owned ALCF-backed backend
to cover empty chat, short desktop windows, mobile composer reachability,
mobile session drawer behavior, mobile settings navigation, and normal session
inventory.

Manual screenshot review found one real mobile issue: the opened session drawer
used the desktop `300px` width on a `390px` viewport, leaving a strip of the
underlying chat visible. The drawer now fills the viewport on narrow screens,
and the visual test asserts the mobile drawer width.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18176 CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Result:

- Real first-impression/mobile gate passed after the fix: 6/6.
- Refreshed screenshot:
  `apps/web/screenshots/audit/overnight-real-first-impression-mobile-drawer.png`.
- The mobile drawer no longer exposes the underlying chat edge.

## Real Operational Surfaces Copy Pass

The real multi-backend operational gate was rerun against the owned ALCF-backed
backend plus the owned no-agent backend after a terminology pass on the
catalog, MCP, prompts, metrics, hooks, policies, and expert-pack surfaces.

Proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 CLIO_BACKEND_A_URL=http://127.0.0.1:18176 CLIO_BACKEND_B_URL=http://127.0.0.1:18177 CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-multibackend.spec.ts --workers=1
```

Result:

- Real operational gate passed after the copy patch: 9/9.
- Refreshed screenshots reviewed:
  `apps/web/screenshots/audit/overnight-real-catalog-all.png`,
  `apps/web/screenshots/audit/overnight-real-mcp-detail.png`,
  `apps/web/screenshots/audit/overnight-real-prompt-save.png`,
  `apps/web/screenshots/audit/overnight-real-expert-packs-empty.png`,
  `apps/web/screenshots/audit/overnight-real-expert-packs-validate.png`,
  `apps/web/screenshots/audit/overnight-real-diagnostics-metrics.png`,
  `apps/web/screenshots/audit/overnight-real-hooks-deleted.png`,
  `apps/web/screenshots/audit/overnight-real-policies-saved.png`.
- The primary surfaces no longer lead with internal strings such as
  `CATALOG · SEARCH AGENTS · TOOLS · MCP`, `Model Context Protocol tool
  gateways`, `Runtime hooks`, or `Declarative hooks`.
- Remaining explicit technical terms are retained where they identify actual
  backend objects: MCP server ids, hook event ids, transport names, and tool ids.

## Real Rendering, File Preview, Tool, And Diff Pass

The real rendering/file workflow gates were rerun against the owned
ALCF-backed backend. These tests attach real workspace files, preview markdown
and code, drive real CLIO turns, create a temporary file-edit agent, inspect
tool evidence, and open the diff UI when the backend produces a pending diff.

Proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 GACT_BRAND=clio pnpm exec playwright test tests/visual/overnight-real-ui.spec.ts tests/visual/overnight-real-rendering.spec.ts --workers=1
```

Result:

- Real rendering/file gate passed: 3/3.
- Refreshed screenshots reviewed:
  `apps/web/screenshots/audit/overnight-real-markdown-preview.png`,
  `apps/web/screenshots/audit/overnight-real-code-preview.png`,
  `apps/web/screenshots/audit/overnight-real-image-preview.png`,
  `apps/web/screenshots/audit/overnight-real-rendering-table.png`,
  `apps/web/screenshots/audit/overnight-real-rendering-settled.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`,
  `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`.
- Markdown preview and transcript markdown rendering are visible and readable.
- The file-edit workflow produced real `fs_read_file` and `fs_propose_edit`
  tool evidence plus a visible diff pane.
- Image preview is still backend-blocked: the PNG on disk is valid, but
  `/v1/workspaces/{id}/files/read` returns `text/plain` with transformed bytes
  (`84 B` read for a `68 B` PNG). The TUI shows an explicit diagnostic instead
  of a broken image. Fresh evidence was added to `iowarp/clio-agent#676` with
  `tui` and `blocked` labels.

## Live NDP/EarthScope Gate Status

The live marketplace EarthScope gate was rerun through the web UI against the
owned ALCF-backed backend. The gate installs/activates the
`earthscope-gnss-region` blueprint in an isolated workspace and sends the real
benchmark prompt through the composer.

Proof:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 CLIO_GACT_URL=http://127.0.0.1:18176 CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-workspace GACT_BRAND=clio pnpm exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- Gate failed before NDP staging, as expected for the current backend state.
- The workspace blueprint was installed and active from:
  `/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-workspace/.clio/agent-blueprints/earthscope-gnss-region/AGENT.md`.
- The UI showed live workflow progress (`main -> geospatial`) and a settled
  workflow blocker card.
- Failure:
  `workflow_state.delegation.failed_child=ndp_dataset_discovery`,
  `workflow_state.delegation.error=_UnsupportedSessionAgent`.
- `/v1/tools` only exposed fs/shell tools for this session; no NDP tools were
  registered, so the gate correctly found no `ndp_stage_resource`,
  `geo_filter_points_by_radius`, `pandas_profile_csv`, or PNG artifact.
- Evidence:
  `apps/web/screenshots/audit/ndp-earthscope-live-early.png`,
  `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`,
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`.
- Fresh evidence was added to `iowarp/clio-agent#672`, which is labeled
  `tui`, `blocked`, `benchmark`, `ndp`, and `agent-blueprints`.

## Corrected Owned NDP Setup: 18190

After reviewing the CLIO setup with the backend team, the earlier NDP failure
above was reclassified as a gate/configuration problem, not proof that NDP is
unavailable on this machine.

Current owned backend:

- Backend: `http://127.0.0.1:18190`.
- Shared developer backend on `17960` was not touched.
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216`.
- Workspace:
  `/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace`.
- Workspace blueprint:
  `.clio/agent-blueprints/earthscope-gnss-region/AGENT.md`.
- Workspace MCP override uses the local CLIO kit paths:
  `/home/jcernuda/clio-kit/clio-kit-mcp-servers/{ndp,geo,pandas,plot}`.

Validated live workspace MCP handshake:

- `ndp`: ready, tools include `search_datasets` and `stage_resource`.
- `geo`: ready, tools include `filter_points_by_radius`.
- `pandas`: ready, tools include `profile_csv`.
- `plot`: ready, tools include `plot_timeseries`.

Important correction:

- `/v1/tools` is not a reliable hard gate for blueprint-scoped MCP tools in
  this CLIO build. It reports the default session/gateway tool inventory.
- The relevant readiness signal for this run is the workspace MCP handshake and
  the workflow event/tool evidence from the actual session.

Latest real NDP/EarthScope gate behavior on `18190`:

- The gate reached real NDP calls: `ndp_search_datasets` and
  `ndp_stage_resource`.
- The gate reached real geospatial filtering:
  `geo_filter_points_by_radius`.
- With the Los Angeles GNSS prompt, the workflow completed but reported no
  suitable station/time-series candidate, so it did not produce
  `pandas_profile_csv` or a PNG plot.
- The run also exposed a frontend stale-permission defect: the UI still showed
  a shell approval card even though
  `/v1/permissions?session_id=sess_60b525d22a8b` returned no pending
  permissions.

Frontend fix from this pass:

- `session.status_changed` now clears pending permission UI when a session
  leaves `waiting_permission`.
- Added reducer coverage so permission cards remain visible while waiting, then
  clear on `idle`/non-waiting status.

Proof:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test tests/unit/LiveReducer.test.ts
```

Result:

- `LiveReducer.test.ts`: 10/10 passed.
- Current evidence:
  `apps/web/screenshots/audit/ndp-earthscope-live-early.png`,
  `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`,
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`.

## Live NDP Permission And Artifact Proof: 18190

The NDP/EarthScope web gate now intentionally exercises the live permission UI
instead of bypassing or misclassifying it.

Fixes from this pass:

- The live NDP gate watches for pending backend permission requests, waits for
  the real in-app permission card, captures it, and clicks `Allow once`.
- The evidence manifest is written on both success and failure. It includes
  workspace MCP handshake state, approved permission rows, workspace artifacts,
  session state, messages, and semantic trace tail.
- The gate detects repeated backend delegation loops and fails with preserved
  evidence instead of waiting silently for the full timeout.
- Permission command JSON now wraps inside the card instead of clipping long
  shell commands horizontally.
- After a permission card clears, chat returns to live-follow mode so the
  remaining workflow and final answer stay visible.
- The `Jump to latest` pill is hidden while permission/question cards are
  visible, so it no longer covers the approval context.

Proof command:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- Live gate passed: 1/1, about 4 minutes.
- Permission was approved through the web UI.
- Workspace MCP handshake reported `ndp`, `geo`, `pandas`, and `plot` ready.
- Real workflow evidence included:
  `ndp_stage_resource`, `geo_filter_points_by_radius`,
  `pandas_profile_csv`, and `plot_plot_timeseries`.
- Workspace artifacts:
  `earthscope_converted_data.csv`,
  `earthscope_stations_clean.csv`,
  `MTA1.CI.LY_.30.csv`,
  `MTA1.CI.LY_.30_plot.png`.
- Final assistant message committed with `stop_reason=end_turn`.

Verification after UI changes:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web test tests/unit/LiveReducer.test.ts
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/screenshots.spec.ts --grep "permission" --workers=1
```

Results:

- Web typecheck passed.
- `LiveReducer.test.ts`: 10/10 passed.
- Focused permission visual screenshots: 3/3 passed.

Current evidence:

- `apps/web/screenshots/audit/ndp-earthscope-live-early.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-permission-1-shell_bash.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-final.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`

Follow-up live rerun:

- The live gate now drains distinct permission requests instead of approving
  only the first pending row. Each approval gets a per-permission screenshot and
  records both initial and resolved backend status.
- Latest evidence shows `shell_bash` permission
  `perm_9e09364086f4` moved from `pending` to `resolved` with action `allow`
  through the real web permission card.
- The rerun did not hang on permissions. It failed fast after CLIO repeated the
  same backend delegation edge:
  `analysis -> gnss_timeseries_analysis repeated 3 times`.
- Filed backend/blueprint issue:
  https://github.com/iowarp/clio-agent/issues/679

Latest failure evidence:

- Session: `sess_83eba269dcf1`
- Permission screenshot:
  `apps/web/screenshots/audit/ndp-earthscope-live-permission-1-shell_bash.png`
- Settled screenshot:
  `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`
- Manifest:
  `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`

## Live NDP Artifact Preview Proof: 18190

The web artifact-preview gate now validates the generated EarthScope files from
the owned CLIO workspace without rerunning the full benchmark.

Proof command:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18222 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result:

- Live gate passed: 1/1.
- `earthscope_stations_clean.csv` rendered as text in the preview rail.
- `MTA1.CI.LY_.30.csv` rendered the intentional large-file placeholder.
- `MTA1.CI.LY_.30_plot.png` reached the image-preview path, but CLIO returned
  text-transformed bytes, so the UI showed the backend diagnostic instead of a
  broken image.

Current evidence:

- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json`

Backend blocker:

- Updated https://github.com/iowarp/clio-agent/issues/676 with the real NDP
  plot evidence. Local file is a valid PNG (`2964 x 1406`, `179653` bytes), but
  `/v1/workspaces/{id}/files/read` returns `text/plain`, transformed bytes, and
  `314556` response bytes.

## Desktop Refresh Against Owned CLIO: 18190

Refreshed the native desktop evidence after the latest web permission/artifact
changes.

Commands:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
cargo test
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
```

Results:

- `apps/desktop` JS smoke: 7/7 passed.
- `apps/desktop/src-tauri` Rust/Tauri tests: 31/31 passed.
- CLIO-branded debug desktop build passed and produced
  `apps/desktop/src-tauri/target/debug/clio-desktop`.

Native WebKitGTK/Xvfb evidence:

- Used isolated XDG state under
  `tmp/owned-clio-ndp-20260617-120216/desktop-xdg`.
- Seeded only the isolated WebKit localStorage with returning-user UI state and
  active session `sess_9b683b97b7b7`.
- Captured native shell against the owned backend on `18190`, not the shared
  developer backend.
- Desktop SSE bridge log showed:
  `gact_sse_open`, `connected status=200`, `kind=open`, and event emissions.

Screenshots:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190.png`
  shows the fresh first-run tour over the CLIO shell.
- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190-seeded.png`
  shows the returning-user CLIO shell without the tour.
- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190-session.png`
  shows a selected real session with `sse · open`.

Follow-up desktop recheck after the latest web/mobile composer changes:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
cargo test
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug
```

Results:

- Desktop JS smoke: 7/7 passed.
- Rust/Tauri tests: 31/31 passed.
- CLIO-branded debug build passed.

Native Xvfb capture notes:

- A first capture without `CLIO_PORT=18190` proved a desktop-specific attach
  behavior: the supervisor rewrote the local backend entry to its managed
  sidecar URL. That is expected for normal desktop startup, but it is not valid
  proof against the owned NDP backend.
- Recaptured with `CLIO_PORT=18190`, the supervisor's documented attach-port
  override. That attached the desktop shell to the owned backend instead of
  spawning an ephemeral sidecar.
- WebKitGTK under Xvfb needed `WEBKIT_DISABLE_COMPOSITING_MODE=1` and
  `LIBGL_ALWAYS_SOFTWARE=1`; without those the screenshot was a black root
  capture and was discarded.
- The desktop SSE bridge log showed:
  `open requested ... http://127.0.0.1:18190/v1/sessions/sess_9b683b97b7b7/events`,
  `connected status=200`, `kind=open`, and event emissions.

Fresh native evidence:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190-attached.png`
  shows the native shell attached to `18190` at 1280x720, but the default
  1440x900 desktop window is cropped by that smaller virtual display.
- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-18190-attached-1440.png`
  is the representative desktop proof: menu bar, sessions column, active owned
  NDP session, `sse · open`, model metadata, and composer are all visible.

## Extended Live Web Surfaces Refresh: 18176/18177

Refreshed the broad live web UI gates against the isolated backend pair.

Command:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18176 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18177 \
CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --workers=1
```

Result:

- Live extended suite passed: 9/9.
- Covered real backend switching between `18176` and `18177`.
- Covered Settings backend list, real file refresh, slash command dispatch,
  unified catalog search, MCP server detail expansion, prompt draft save,
  expert-pack empty/validation states, diagnostics pages, hooks, and policies.
- No stale Playwright/Vite process remained after the run.

Refreshed evidence:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`
- `apps/web/screenshots/audit/overnight-real-settings-backends.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`
- `apps/web/screenshots/audit/overnight-real-catalog-all.png`
- `apps/web/screenshots/audit/overnight-real-catalog-filtered.png`
- `apps/web/screenshots/audit/overnight-real-mcp-detail.png`
- `apps/web/screenshots/audit/overnight-real-prompt-save.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs-empty.png`
- `apps/web/screenshots/audit/overnight-real-expert-packs-validate.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics-metrics.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics-doctor.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics-memory.png`
- `apps/web/screenshots/audit/overnight-real-hooks-created.png`
- `apps/web/screenshots/audit/overnight-real-hooks-deleted.png`
- `apps/web/screenshots/audit/overnight-real-policies-saved.png`

## Brand Profile Audit: CLIO and GACT

Refreshed the deterministic branding gate for both product profiles.

Commands:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Results:

- CLIO brand audit passed: 5/5.
- GACT brand audit passed: 5/5.
- The settings/about surfaces and chat shell now render the selected profile
  name consistently instead of leaking the other product name.

Evidence:

- `apps/web/screenshots/audit/brand-clio-chat.png`
- `apps/web/screenshots/audit/brand-clio-connect.png`
- `apps/web/screenshots/audit/brand-clio-connect-error.png`
- `apps/web/screenshots/audit/brand-clio-settings-about.png`
- `apps/web/screenshots/audit/brand-clio-settings-operational.png`
- `apps/web/screenshots/audit/brand-gact-chat.png`
- `apps/web/screenshots/audit/brand-gact-connect.png`
- `apps/web/screenshots/audit/brand-gact-connect-error.png`
- `apps/web/screenshots/audit/brand-gact-settings-about.png`
- `apps/web/screenshots/audit/brand-gact-settings-operational.png`

## Real Brand and Settings Gate: 18176/18177

Verified the branded shell and backend/workspace settings against the isolated
backend pair.

Command:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18176 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18177 \
CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace \
CLIO_ALT_WORKSPACE_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace-alt \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-brand-settings.spec.ts --workers=1
```

Result:

- Live brand/settings gate passed: 2/2.
- The CLIO shell used CLIO branding while connected to a real backend.
- Settings could probe and select the configured backend targets.
- Workspace selection filtered the session list by live workspace id.

Evidence:

- `apps/web/screenshots/audit/overnight-real-brand-chat.png`
- `apps/web/screenshots/audit/overnight-real-brand-settings.json`
- `apps/web/screenshots/audit/overnight-real-settings-backends.png`
- `apps/web/screenshots/audit/overnight-real-settings-probe.png`
- `apps/web/screenshots/audit/overnight-real-settings-selected-backend.png`
- `apps/web/screenshots/audit/overnight-real-workspace-primary.png`
- `apps/web/screenshots/audit/overnight-real-workspace-alt.png`
- `apps/web/screenshots/audit/overnight-real-workspaces-all.png`

## First Impression and Mobile Gate: 18177

Refreshed the first-run, short-height, and mobile conversation-first layouts
against a real backend with a live workspace.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18177 \
CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_d1b7151ac8cd \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Result:

- Live first-impression/mobile gate passed: 6/6.
- Empty desktop chat remains conversation-first and does not front-load
  operational inventory.
- Short desktop height keeps the composer reachable.
- Mobile empty state keeps the composer visible at the bottom.
- Mobile session flow opens sessions through the drawer and returns cleanly from
  settings back to chat.

Evidence:

- `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-short.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-drawer.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-session.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-after-select.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-normal.png`

## Live File, Rendering, Freshness, And Mobile Recheck

Reran the live file/rendering gates after the permission-path changes so the
current evidence covers real CLIO behavior, not only stale screenshots.

File and diff command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18176 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-ui.spec.ts --workers=1
```

Result:

- Live file/rendering gate passed: 2/2.
- `README.md` rendered through the markdown preview rail.
- `handlers.go` rendered through the code/text preview.
- `validation_plot.png` showed the explicit backend byte-transform diagnostic
  instead of a broken or falsely successful image.
- The file editor agent completed a real turn with `fs_read_file` and
  `fs_propose_edit` metadata, and the UI opened a metadata-derived diff pane
  with apply/reject controls.

Fresh evidence:

- `apps/web/screenshots/audit/overnight-real-markdown-preview.png`
- `apps/web/screenshots/audit/overnight-real-code-preview.png`
- `apps/web/screenshots/audit/overnight-real-image-preview.png`
- `apps/web/screenshots/audit/overnight-real-agent-turn-settled.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`
- `apps/web/screenshots/audit/overnight-real-agent-messages.json`
- `apps/web/screenshots/audit/overnight-real-file-editor-messages.json`

Rendering, streaming, and freshness command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18176 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-rendering.spec.ts tests/visual/overnight-real-streaming.spec.ts tests/visual/overnight-real-freshness.spec.ts --workers=1
```

Result:

- Live freshness/rendering/streaming gate passed: 4/4.
- Session updates appeared without re-entering the session.
- Focus reconciliation healed a missed event without requiring manual session
  switching.
- Live assistant markdown rendered as table, bullets, inline code, and fenced
  code.
- Streaming proof remains a truthful fallback path on this backend:
  `stream_completed_without_chunks`, `live_streaming: false`.

Fresh evidence:

- `apps/web/screenshots/audit/overnight-real-freshness-before.png`
- `apps/web/screenshots/audit/overnight-real-freshness-after.png`
- `apps/web/screenshots/audit/overnight-real-focus-reconcile-before.png`
- `apps/web/screenshots/audit/overnight-real-focus-reconcile-after.png`
- `apps/web/screenshots/audit/overnight-real-rendering-table.png`
- `apps/web/screenshots/audit/overnight-real-rendering-settled.png`
- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`

Mobile composer polish:

- On phone-width layouts, the composer now keeps the backend target visible and
  hides the secondary permission/model controls instead of rendering a truncated
  model-name fragment.
- The no-agent backend on `18177` remains useful for first-impression and
  settings/error-state UX: `/v1/health` returns 503 because no agent or LM is
  configured, while capabilities/workspaces/sessions remain available.

Mobile proof command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18177 \
CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_d1b7151ac8cd \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-first-impression.spec.ts --grep "mobile" --workers=1
```

Result:

- Mobile first-impression subset passed after the composer change: 3/3.
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`
  now shows only the backend selector in the composer metadata row.

## Live Permission And NDP/EarthScope Gate: 18190

Reran the EarthScope GNSS marketplace gate against an owned CLIO backend with
the marketplace blueprint installed into the isolated workspace instead of
falling back to a repo-local `.clio` definition.

Command shape:

```bash
CLIO_NDP_EARTHSCOPE_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
CLIO_MARKETPLACE_SOURCE=/home/jcernuda/clio-agent/external/clio-agent-marketplace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-earthscope-live.spec.ts --workers=1
```

Result:

- The gate no longer waits forever on a pending cleanup permission.
- The test now treats `shell_bash` cleanup as an expected live permission
  surface: it captures the permission card, approves it through the UI, waits
  for CLIO to report a non-pending status, and stores the resolved row in the
  evidence manifest.
- CLIO recorded permission `perm_9e09364086f4` as `pending -> resolved` with
  action `allow`.
- The workflow generated real artifacts in the owned workspace:
  `earthscope_converted_data.csv`, `earthscope_stations_clean.csv`,
  `MTA1.CI.LY_.30.csv`, and `MTA1.CI.LY_.30_plot.png`.
- The old `_UnsupportedSessionAgent` report was closed as config/local-gate
  setup, not a current product blocker: `iowarp/clio-agent#672`.
- The current backend blocker is now `iowarp/clio-agent#679`: after permission
  approval and artifact generation, the blueprint repeatedly delegates
  `analysis -> gnss_timeseries_analysis`.

Evidence:

- `apps/web/screenshots/audit/ndp-earthscope-live-permission-1-shell_bash.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-settled.png`
- `apps/web/screenshots/audit/ndp-earthscope-live-evidence.json`

The non-mutating artifact preview gate was also rerun against the same owned
workspace. It validates the generated CSV/PNG artifacts without starting a new
benchmark turn:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result:

- Real artifact preview gate passed: 1/1.
- `earthscope_stations_clean.csv` renders as text in the file rail.
- `MTA1.CI.LY_.30.csv` renders as the large-file placeholder.
- `MTA1.CI.LY_.30_plot.png` renders as a real image through CLIO binary file
  reads; the evidence manifest recorded natural size `2964x1406`.
- Empty artifact-preview sessions now show a quiet `Previewing workspace files`
  center state instead of the first-run prompt cards.

Evidence:

- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`
- `apps/web/screenshots/audit/ndp-artifact-preview-evidence.json`

## Current Desktop Native Refresh: 18224

After the latest web settings/MCP/artifact changes, the shared web UI was
rechecked through the native desktop shell.

Commands:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
cd apps/desktop/src-tauri && cargo test
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/desktop tauri:build:debug

# owned no-agent backend, isolated config/state, CLIO_PORT=18224
xvfb-run -a -s '-screen 0 1440x900x24' sh -lc 'env XDG_CONFIG_HOME=... XDG_STATE_HOME=... XDG_CACHE_HOME=... XDG_DATA_HOME=... CLIO_PORT=18224 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 apps/desktop/src-tauri/target/debug/clio-desktop & app_pid=$!; sleep 18; import -window root apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current-returning.png; kill $app_pid 2>/dev/null || true; wait $app_pid 2>/dev/null || true'
```

Result:

- Desktop JS smoke passed: 7/7.
- Desktop Rust/Tauri tests passed: 31/31.
- CLIO-branded desktop debug build passed and produced
  `apps/desktop/src-tauri/target/debug/clio-desktop`.
- Fresh isolated desktop profile screenshot intentionally showed the onboarding
  tour, proving first-run desktop branding still says `Welcome to CLIO Desktop`.
- Returning-user isolated profile screenshot shows the current native desktop
  shell without the tour overlay: CLIO branding, sessions column, seeded
  backend session, and reachable composer.
- Linux still has `tauri-driver` but not `WebKitWebDriver`, so this pass used
  native Xvfb screenshot proof rather than the Tauri WebDriver click path.

Evidence:

- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current.png`
- `apps/web/screenshots/audit/desktop-linux-xvfb-chat-clio-current-returning.png`

## Brand Audit Splash Extension

Extended the brand visual audit to cover the release-facing splash startup and
first-run install states, in addition to connect, chat, settings/about, and
operational settings.

Commands:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
```

Result:

- CLIO brand audit passed: 7/7.
- GACT brand audit passed: 7/7.
- Startup splash primary copy now says `Booting the bundled agent backend...`
  instead of hardcoding `clio-agent`.
- First-run install explanatory copy now says `backend Python packages`; the
  detailed install log still shows the real backend repository/package names.

Evidence:

- `apps/web/screenshots/audit/brand-clio-splash.png`
- `apps/web/screenshots/audit/brand-clio-splash-install.png`
- `apps/web/screenshots/audit/brand-gact-splash.png`
- `apps/web/screenshots/audit/brand-gact-splash-install.png`
- Existing brand audit screenshots for connect, chat, settings/about, and
  operational settings were refreshed for both profiles.

## Broad Settings And Catalog Recheck: 18176/18177

Reran the extended real-backend settings/catalog gate after the mobile and live
permission changes.

Command:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18176 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18177 \
CLIO_WORKSPACE_A_ROOT=/tmp/gact-overnight-real-20260617-072406-1570538/backend-a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/overnight-real-multibackend.spec.ts --workers=1
```

Result:

- Extended multi-backend gate passed: 9/9.
- Prompt save flow passed after the prompt card layout was tightened so the
  selected prompt header and save result remain visible.
- Commands, MCP detail, prompt save, expert-pack validation, diagnostics,
  hooks, policies, backend switching, and file refresh all exercised real
  backend calls.

Evidence:

- `apps/web/screenshots/audit/overnight-real-prompt-save.png`
- `apps/web/screenshots/audit/overnight-real-command-cache-stats.png`
- `apps/web/screenshots/audit/overnight-real-mcp-detail.png`
- `apps/web/screenshots/audit/overnight-real-diagnostics-doctor.png`
- `apps/web/screenshots/audit/overnight-real-hooks-policies.json`

## CLIO First Impression And Brand Starter Prompts: 2026-06-17 Evening

After inspecting the refreshed web/desktop screenshots, one shared-core product
issue remained: the CLIO-branded empty chat still used generic GACT starter
cards such as HDF5 schema inspection and Go `println` refactoring. The brand
profile now owns the first-run starter prompts so each build can present
domain-appropriate first actions without hardcoding CLIO-specific copy in
`ChatScreen`.

Changes:

- `apps/branding/clio/brand.json` defines CLIO starter cards for EarthScope,
  NDP wildfire data, CIMIS weather, and workspace artifact review.
- `apps/branding/gact/brand.json` keeps the neutral GACT starter cards.
- `apps/web/vite-plugin-brand.ts` resolves `starterPrompts` with a neutral
  fallback.
- `apps/web/src/routes/ChatScreen.tsx` reads `brand.starterPrompts` instead of
  hardcoded local prompt cards.
- The empty transcript scroll path now keeps zero-message sessions at the top
  instead of auto-scrolling the empty state to the bottom, which previously
  clipped the heading under the top bar in real first-impression screenshots.

Owned-backend proof:

```bash
GACT_BRAND=clio \
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_FIRST_IMPRESSION_URL=http://127.0.0.1:18252 \
CLIO_FIRST_IMPRESSION_WORKSPACE_ID=ws_default \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-first-impression.spec.ts --workers=1
```

Result: 6/6 passed against an isolated no-agent CLIO backend with independent
XDG state and `CLIO_GACT_CORS_ORIGINS='*'`. The backend was stopped after the
proof.

Refreshed evidence:

- `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-short.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-drawer.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile-after-select.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-normal.png`

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/Brand.test.ts --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/brand-audit.spec.ts --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/Brand.test.ts tests/unit/PreviewRail.test.tsx tests/unit/DiffPane.test.tsx tests/unit/McpReconnect.test.tsx tests/unit/ExpertPacksPage.test.tsx tests/unit/MetricsPage.test.ts tests/unit/LiveReducer.test.ts tests/unit/Transcript.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
npm exec --yes pnpm@9.15.9 -- --dir apps/core test -- --run
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/desktop lint
cd apps/desktop/src-tauri && cargo test
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- --run
git diff --check
```

Results:

- Brand unit test passed: 2/2.
- Web typecheck passed.
- CLIO brand visual audit passed: 7/7.
- Focused web 0.5.3 contract/unit slice passed: 63/63.
- Web lint passed.
- Core tests passed: 50 passed, 4 live-CLIO tests skipped by design.
- Desktop JS smoke passed: 7/7.
- Desktop typecheck/lint guards passed.
- Desktop Rust/Tauri tests passed: 31/31.
- Full web unit suite passed: 288/288.
- `git diff --check` passed.

## Fresh Owned-Backend Web Recheck: 18310/18311

After adding unified new-session workflow defaults across TUI/web/desktop,
started two fresh owned no-agent CLIO backends from the local
`/home/jcernuda/clio-agent/.venv/bin/clio-agent-gact` binary, with independent
XDG state under
`/home/jcernuda/gact-tui/tmp/owned-web-continuation-20260617-203119` and
`CLIO_GACT_CORS_ORIGINS='*'`.

Backends:

- A: `http://127.0.0.1:18310`
- B: `http://127.0.0.1:18311`

Clean-workspace gate fix:

- The real file-refresh proof assumed `README.md` already existed. A clean
  owned backend only had `.clio` state, so the proof skipped the actual UI
  behavior. `overnight-real-multibackend.spec.ts` now seeds the expected
  `README.md` before opening the web app.

New real visual coverage:

- Settings > `Session defaults` renders blueprint/expert-pack defaults against
  a real backend.
- `Ctrl+B` opens the production session semantics modal from chat, showing
  blueprint, expert pack, save-default, and start-session controls.

Commands:

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

Fresh screenshots:

- `apps/web/screenshots/audit/overnight-real-session-defaults-settings.png`
- `apps/web/screenshots/audit/overnight-real-session-semantics-modal.png`
- `apps/web/screenshots/audit/overnight-real-file-refresh.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-empty.png`
- `apps/web/screenshots/audit/overnight-real-first-impression-mobile.png`

## Live Streaming Fallback Reconciliation Recheck

Reran the real streaming proof against owned CLIO backend
`http://127.0.0.1:18176`, workspace `ws_80d27018c650`.

Command:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18176 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_80d27018c650 \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-streaming.spec.ts --workers=1
```

Result: passed 1/1.

Important result detail:

- CLIO still reported provider fallback for this probe:
  `stream_completed_without_chunks`, `live_streaming:false`.
- The UI now reconciles correctly after that fallback: the final assistant text
  is visible, the stale `CLIO is responding` indicator is gone, and duplicate
  SSE-disconnect toasts do not stack.
- The visual test now asserts that final visible state before accepting the
  screenshot, so stale fallback presentation will fail the gate.

Evidence:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/LiveReducer.test.ts tests/unit/Transcript.test.tsx tests/unit/SessionSemantics.test.ts tests/unit/SessionDefaultsSection.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
git diff --check
```

Results: focused web tests passed 23/23, typecheck passed, lint passed, and
`git diff --check` passed.

## Composer Command/Attach/Mention Recheck

Reviewed the shared web/desktop composer after the UX complaint that command,
paperclip, `@`, and file affordances felt duplicated.

Resulting semantics:

- `/` opens commands.
- Paperclip opens the context menu for uploads/references.
- `@` references existing workspace/agent/tool context without uploading bytes.

Polish applied:

- Distinct menu icons for upload, image upload, and workspace reference.
- Composer row aligns controls to the first text line, improving one-line and
  multi-line draft readability.
- Removed a duplicate paste-stash write in the paste-compression path.

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

Results: focused tests passed 10/10, typecheck passed, visual screenshots passed
2/2 from a production build, lint passed, desktop smoke passed 7/7, and
`git diff --check` passed.

## Brand-Neutral Add Remote Recheck

Audited shared web/desktop source for visible product-name leaks and found one
Add Remote label that used CLIO where the concept was a generic backend
endpoint.

Changes:

- `Remote CLIO port` -> `Remote backend port`.
- SSH helper text now says `remote backend port`.
- Pure-web SSH mode chip now says `desktop only` instead of `desktop spawn`.

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

Results: focused tests passed 9/9, typecheck passed, lint passed, CLIO and GACT
brand audits each passed 7/7, Add Remote SSH visual passed 1/1, desktop smoke
passed 7/7, and `git diff --check` passed.

## Brand Repository Surface Recheck

The neutral GACT brand audit exposed a visible CLIO backend detail in the About
links and install-demo log. Fixed by making backend repository metadata an
optional brand-profile field.

Visual result:

- GACT install demo now says `Preparing GACT agent backend...` and uses a
  neutral `%LOCALAPPDATA%\gact\agent\.venv` path.
- GACT About links only the GACT clients and protocol spec.
- CLIO About still links `github.com/iowarp/clio-agent` as the CLIO backend.

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

Results: focused brand unit tests passed 2/2, web typecheck passed, GACT brand
audit passed 7/7, and CLIO brand audit passed 7/7.

## Correction: Bad EarthScope Harness Run

One fresh owned live run on `127.0.0.1:18322` failed with
`_UnsupportedSessionAgent` at `main -> geospatial`. This should not be read as a
backend regression. EarthScope/NDP is known to work on this machine under the
proper CLIO configuration; the failed run means the gact-tui live harness/owned
backend launch was not equivalent to the known-good configuration.

Actions taken:

- Stopped only the erroneous owned backend on `18322`.
- Closed/retracted `iowarp/clio-agent#689` as a gact-tui harness/configuration
  mistake.

Rule for future validation:

- For EarthScope/NDP on this machine, `_UnsupportedSessionAgent` means fix the
  test harness configuration first.
- Do not file a backend issue from that symptom unless the exact known-good
  CLIO command line and workspace setup also fails outside the UI.

## EarthScope Harness Recovery Recheck

The CLIO developer guidance on `iowarp/clio-agent#689` clarified the harness
failure mode:

- `/v1/mcp/handshake` is only a probe and does not wire tools into the session
  executor.
- `/v1/tools` is the global catalog and is not the child expert's tool set.
- `geo_geocode` / `ndp_*` / `pandas_*` / `plot_*` aliases only exist after the
  per-workspace executor composes the blueprint MCP servers for a session bound
  to the correct workspace and active blueprint.

Harness change:

- `apps/web/tests/visual/ndp-earthscope-live.spec.ts` now writes the local
  `.clio/mcp.yaml` override when `CLIO_KIT_PATH` or `/home/jcernuda/clio-kit`
  is available, matching the known-good owned `18190` setup.
- The evidence manifest now records `localMcpOverride`.

Rerun evidence:

- Backend: `http://127.0.0.1:18190`.
- Backend env: sourced from
  `/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/run/env.sh`.
- Fresh post-start workspace with local MCP override still failed
  `_UnsupportedSessionAgent`, which means dynamic workspace creation after
  backend start still does not reproduce the prepared known-good setup.
- Existing prepared workspace cleared `_UnsupportedSessionAgent` and instead
  reached `main` blueprint runtime, then failed with recoverable
  `empty_response`.
- `iowarp/clio-agent#689` was updated and left open as the durable reference for
  this recurring harness/config pitfall.

Artifact preview proof against the prepared workspace:

```bash
CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 \
CLIO_GACT_URL=http://127.0.0.1:18190 \
CLIO_NDP_EARTHSCOPE_WORKSPACE=/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test tests/visual/ndp-artifacts-live.spec.ts --workers=1
```

Result: passed 1/1.

Inspected:

- `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png` renders the
  real generated GNSS PNG.
- `apps/web/screenshots/audit/ndp-artifact-preview-metadata-csv.png` renders
  the station metadata CSV inline.
- `apps/web/screenshots/audit/ndp-artifact-preview-large-csv.png` shows a clear
  large-file placeholder for the 48 MB station CSV.

Current UI observation:

- The left session rail previously accumulated generated `ndp artifact preview
  ...` and `ndp earthscope live ...` sessions during repeated validation runs.
  The artifact-preview gate now archives successful generated sessions after
  evidence capture by default, and the latest owned-backend check reported zero
  active generated NDP/EarthScope sessions after cleanup.

Verification after the harness patch:

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

Result: passed 1/1. The regenerated manifest now includes top-level
`workspaceRoot`, `plotOutcome`, and the backend `archiveResult`.

Current evidence:

- `workspaceRoot`: `/home/jcernuda/gact-tui/tmp/ndp-earthscope-live-onJpUf`
- `pngPath`: `MTA1.CI.LY_.30.png`
- `plotOutcome`: `image`
- natural image size: `2968x1408`
- `archiveResult.archived`: `true`
- screenshot:
  `apps/web/screenshots/audit/ndp-artifact-preview-plot-png.png`

The screenshot was inspected and shows the generated GNSS time-series PNG in
the preview rail.

## Corrected Live Streaming Proof Recheck

Reran the live streaming web proof against two owned ALCF-backed CLIO backends
after confirming the local CLIO-agent checkout includes the Argonne streaming
fix commit (`060bab5`).

The test gate was tightened:

- `apps/web/tests/visual/overnight-real-streaming.spec.ts` now records
  `ui_active` from the real `chat-typing` indicator.
- A sample counts toward `liveUiSampleCount` only when assistant text is visible
  while `chat-typing` is also visible.
- This avoids a false positive where the web UI has already reached `end_turn`
  but the polling API has not yet marked the assistant message stopped.

`openai/gpt-oss-120b` on Sophia:

- Backend: `http://127.0.0.1:18390`
- Workspace: `ws_9fd755d24641`
- Strict command used `CLIO_REQUIRE_LIVE_STREAMING=1`.
- Result: failed as expected under the corrected gate, with
  `liveUiSampleCount: 0` and `stream_completed_without_chunks`.

`google/gemma-4-31B-it` on Sophia:

- Backend: `http://127.0.0.1:18391`
- Workspace: `ws_018c9dabd425`
- Strict command used `CLIO_REQUIRE_LIVE_STREAMING=1`.
- Result: failed under the corrected gate.
- Non-strict fallback command passed and regenerated
  `apps/web/screenshots/audit/overnight-real-streaming-samples.json`.

Current manifest excerpt:

```json
{
  "backend": "http://127.0.0.1:18391",
  "workspaceId": "ws_018c9dabd425",
  "liveUiSampleCount": 0,
  "requireLive": false,
  "fallback": {
    "reason": "stream_completed_without_chunks",
    "category": "provider_streaming_limitation",
    "synthetic_posthoc": true,
    "live_streaming": false
  }
}
```

Evidence screenshots:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`

Backend issue opened:

- https://github.com/iowarp/clio-agent/issues/692

Current interpretation: gact-tui now avoids overclaiming streaming. It proves
truthful fallback rendering, but active text-evolution proof is still blocked on
CLIO-agent/backend streaming semantics for these ALCF cells.

## Desktop WebView Driver Autodetect Recheck - 2026-06-18

After checkpoint `2ac8da27`, the desktop native WebView harness was updated to
auto-detect the locally extracted Linux WebKit driver at
`tmp/webkit-driver-local/root/usr/bin/WebKitWebDriver`.

Fresh owned backend:

- URL: `http://127.0.0.1:17800`
- Run root:
  `/home/jcernuda/gact-tui/tmp/owned-clio-desktop-webview-20260617-231715-2124531`
- Workspace: `ws_b24ce29caf61`
- ALCF provider/model: `argonne`, `google/gemma-4-31B-it`

Command:

```bash
TAURI_E2E=1 \
CLIO_DESKTOP_BACKEND_URL=http://127.0.0.1:17800 \
CLIO_DESKTOP_WORKSPACE_ID=ws_b24ce29caf61 \
CLIO_DESKTOP_SCREENSHOT_DIR=/home/jcernuda/gact-tui/apps/web/screenshots/audit \
xvfb-run -a npm exec --yes pnpm@9.15.9 -- --dir apps/desktop test:webview
```

Result: passed `1/1` in `8.8s` without setting `TAURI_NATIVE_DRIVER`, proving
the local driver autodetection path.

Evidence:

- `apps/web/screenshots/audit/desktop-webview-chat.png`
- `apps/web/screenshots/audit/desktop-webview-permission.png`
- Backend permission row `perm_bb0855485f0c`: `shell_bash`, command
  `rm -rf /tmp/gact-desktop-permission-probe-do-not-exist`, status `resolved`,
  action `deny`.

The owned backend was stopped after the proof and `:17800` was verified clear.

## Session Workspace Label Polish - 2026-06-18

The session rail keeps its dense layout by hiding row meta chips in the default
view, but the underlying `SessionsColumn` now resolves workspace ids through the
live workspace list before rendering or searching row workspace metadata. This
prevents raw `ws_...` ids from leaking when row meta is surfaced and lets
operators search sessions by friendly workspace name.

Verification:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/Skeletons.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
```

Results: focused unit test passed `7/7`, web typecheck passed, and web lint
passed.

Focused real-backend screenshot proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18272 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18273 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/owned-clio-workspace-label-20260617-232531-2128536/a/workspace \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-multibackend.spec.ts \
  --grep "switches between two" --workers=1
```

Result: passed `1/1`. The refreshed screenshots keep the session rail compact
and no longer show noisy workspace/project chips in the default density:

- `apps/web/screenshots/audit/overnight-real-backend-a-sessions.png`
- `apps/web/screenshots/audit/overnight-real-backend-b-sessions.png`

The owned backends on `:18272` and `:18273` were stopped after the proof.

## Composer Reference Wording Polish - 2026-06-18

Clarified the composer controls without changing behavior:

- `/` remains the command-palette button.
- The paperclip remains the context menu for uploading bytes or referencing a
  workspace file.
- `@ mention` wording was changed to `@ reference` in the picker, placeholder,
  and footer hint, because `@` creates references to files/agents/tools rather
  than uploading another attachment.

Verification:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/screenshots.spec.ts --grep "attach menu" --workers=1
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/screenshots.spec.ts --grep "at-mention-picker" --workers=1
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
npm exec --yes pnpm@9.15.9 -- --dir apps/web lint
```

Results: both visual proofs passed, web typecheck passed, and web lint passed.

Refreshed screenshots:

- `apps/web/screenshots/attach-hybrid-menu.png`
- `apps/web/screenshots/at-mention-picker.png`

## Rendering Screenshot Refresh - 2026-06-18

Refreshed deterministic rendering screenshots after the composer wording polish
so the visual corpus no longer shows stale `@ mention` text.

Verification:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/screenshots.spec.ts --grep "diff-pane-open|code blocks render|markdown file|preview rail explains" --workers=1
```

Result: passed `4/4` across two focused runs from a production CLIO-branded
build.

Refreshed screenshots:

- `apps/web/screenshots/markdown-read.png`
- `apps/web/screenshots/code-syntax-highlight.png`
- `apps/web/screenshots/diff-pane-open.png`
- `apps/web/screenshots/preview-image-decode-diagnostic.png`

## Brand And Settings Real-Backend Refresh - 2026-06-18

Brand audit:

```bash
GACT_BRAND=clio npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/brand-audit.spec.ts --workers=1
GACT_BRAND=gact npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/brand-audit.spec.ts --workers=1
```

Results: both profiles passed `7/7`.

Real settings proof:

```bash
CLIO_OVERNIGHT_EXTENDED_UI=1 \
CLIO_BACKEND_A_URL=http://127.0.0.1:18341 \
CLIO_BACKEND_B_URL=http://127.0.0.1:18342 \
CLIO_WORKSPACE_A_ROOT=/home/jcernuda/gact-tui/tmp/owned-clio-brand-settings-20260617-234414-2135392/a/workspace \
CLIO_ALT_WORKSPACE_ROOT=/home/jcernuda/gact-tui/tmp/owned-clio-brand-settings-20260617-234414-2135392/a/workspace-alt \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-brand-settings.spec.ts --workers=1
```

Result: passed `3/3` after explicitly creating the intended workspace row via
`POST /v1/workspaces`. The initial failure was a harness setup mismatch: the
isolated backend auto-created `ws_default` at the server cwd, while the proof
expected the nested `a/workspace` root.

Evidence refreshed:

- `apps/web/screenshots/audit/overnight-real-brand-chat.png`
- `apps/web/screenshots/audit/overnight-real-settings-probe.png`
- `apps/web/screenshots/audit/overnight-real-settings-selected-backend.png`
- `apps/web/screenshots/audit/overnight-real-add-remote-active.png`
- `apps/web/screenshots/audit/overnight-real-workspace-alt.png`
- `apps/web/screenshots/audit/overnight-real-workspace-primary.png`

The owned CLIO backends were stopped after the proof, and ports `:18341` and
`:18342` were verified clear.

## ALCF Web Streaming Refresh - 2026-06-18

Started an owned CLIO backend on `http://127.0.0.1:18351` from the throwaway
workspace root so `ws_default` matched the proof workspace:

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

Result: passed `1/1` in the production web build. The real ALCF turn completed
and the final response rendered in the transcript. The run did not produce live
visible text chunks; the captured manifest reports:

```json
{
  "liveUiSampleCount": 0,
  "fallback": {
    "reason": "stream_completed_without_chunks",
    "category": "provider_streaming_limitation",
    "synthetic_posthoc": true,
    "live_streaming": false
  }
}
```

Evidence:

- `apps/web/screenshots/audit/overnight-real-streaming-final.png`
- `apps/web/screenshots/audit/overnight-real-streaming-no-live-midturn.png`
- `apps/web/screenshots/audit/overnight-real-streaming-samples.json`

The owned backend was stopped after the proof and port `:18351` was verified
clear.

## ALCF Markdown Rendering Refresh - 2026-06-18

Started an owned CLIO backend on `http://127.0.0.1:18352` with the same ALCF
Sophia `google/gemma-4-31B-it` configuration and ran the real markdown
rendering proof:

```bash
CLIO_OVERNIGHT_REAL_UI=1 \
CLIO_GACT_URL=http://127.0.0.1:18352 \
CLIO_OVERNIGHT_WORKSPACE_ID=ws_default \
GACT_BRAND=clio \
npm exec --yes pnpm@9.15.9 -- --dir apps/web exec playwright test \
  tests/visual/overnight-real-rendering.spec.ts --workers=1
```

Result: passed `1/1`. The assistant response contained a markdown table,
bullet list, inline code, and fenced Python block; the page assertions verified
the rendered `.im__table`, `.im__list`, and `.im__code` elements were visible.

Evidence:

- `apps/web/screenshots/audit/overnight-real-rendering-early.png`
- `apps/web/screenshots/audit/overnight-real-rendering-table.png`
- `apps/web/screenshots/audit/overnight-real-rendering-settled.png`
- `apps/web/screenshots/audit/overnight-real-rendering-messages.json`

The owned backend was stopped after the proof and port `:18352` was verified
clear.

## Real File/Image/Diff Web Proof - 2026-06-18

Prepared a throwaway workspace with `README.md`, `sample_metrics.csv`,
`handlers.go`, and `validation_plot.png`, then launched an owned CLIO backend
on `http://127.0.0.1:18353` from that workspace root.

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

Result: passed `2/2` both before and after the diff drawer polish. The proof
covered real backend file listing/reads, markdown preview, source preview,
PNG image preview, a live file-edit agent turn, tool evidence, and a real diff
pane.

During visual inspection, the first refreshed diff screenshot showed the drawer
title wrapped under the topbar because it used the full absolute path. The web
UI now compacts long diff paths for display and positions the desktop drawer
below the 52px topbar.

Additional checks:

```bash
npm exec --yes pnpm@9.15.9 -- --dir apps/web test -- tests/unit/DiffPane.test.tsx --run
npm exec --yes pnpm@9.15.9 -- --dir apps/web typecheck
```

Results: `DiffPane.test.tsx` passed `10/10`; typecheck passed.

Evidence refreshed:

- `apps/web/screenshots/audit/overnight-real-markdown-preview.png`
- `apps/web/screenshots/audit/overnight-real-code-preview.png`
- `apps/web/screenshots/audit/overnight-real-image-preview.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-tools.png`
- `apps/web/screenshots/audit/overnight-real-file-editor-diff.png`

The owned backend was stopped after the proof and port `:18353` was verified
clear.
