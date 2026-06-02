# apps/ — STATUS

**Last updated:** 2026-06-02 (distribution + release-0.7 run)
**Branch:** `feat/distribution-and-release` (PR #74 / feat-apps-harness already merged into develop @ `8d7d9a3`)
**Phase:** distribution engineering + release-pipeline test (0.7) → then 0.9 lab release after clio verification

## DISTRIBUTION + RELEASE 0.7 BOARD (2026-06-02 — newest run, READ THIS FIRST)

The user's direction: "lets do proper not easy" — a real distribution story for
the whole stack, every channel, then exercise the actual release pipeline with a
test tag. The install-script path stays supported; everything below is ADDITIVE.

| # | Item | State | Proof |
|---|------|-------|-------|
| D1 | **Docker: clio-api** — standalone GACT REST API container (host TUI/desktop connect to it) | **DONE (local)** | `docker/Dockerfile.clio-api`; built 1.03 GB; live container test: /v1/capabilities 200 + POST /sessions + healthcheck healthy |
| D2 | **Docker: clio-web** — clio + web UI in one container (nginx + SSE-safe /v1 proxy) | **DONE (local)** | `docker/Dockerfile.clio-web`; built 1.05 GB; live test: index.html served, capabilities through proxy, session create, SSE `server.connected` streamed through nginx |
| D3 | **Docker: clio-tui** — clio + Bubbletea TUI interactive container | **DONE (local)** | `docker/Dockerfile.clio-tui`; built 1.06 GB; boot smoke: clio up + `gact new` created a session inside the container |
| D4 | **Docker compose + ghcr publishing** | **DONE (local)** | `docker/docker-compose.yml` (api/web profiles, up/down clean); `.github/workflows/docker.yml` publishes ghcr.io/iowarp/clio-{api,web,tui} on release tags |
| D5 | **Desktop "one-swoop" first launch** — auto-installs clio with streamed progress instead of a dead-end error card; manual card stays as fallback | **DONE (local)** | supervisor.rs `needs_install` status + `install_clio` command (streams `clio:install-progress`); splash auto-install view; cargo 27/27, web 153/153, fixture PNG `first-run-install.png` |
| D6 | **Desktop bundled variant** — clio runtime (329 MB, relocatable uv venv) embedded as Tauri resources; launcher resolves bundled-first | **DONE (local)** | `build-clio-runtime.{ps1,sh,mjs}` + `tauri.bundled.conf.json` + launcher priority-0 + 8 Go tests; end-to-end proof: launcher → bundled runtime → clio boots → capabilities 200 |
| D7 | **Launcher hygiene** — hardcoded dev-machine path removed from shipped binaries (replaced by `CLIO_DEV_REPO` env) | **DONE** | `main_test.go` TestCandidatePathsNoHardcodedDevPath |
| D8 | **CI release matrix** — lite + bundled × 4 OS targets (8 installer jobs) + docker images + pure-web zip | **DONE (needs tag to prove)** | apps.yml release matrix `variant: [lite, bundled]`; proven by the 0.7 tag run |
| D9 | **TUI live test vs real clio** | **DONE** | Protocol-level live proof via the gact CLI vs :17803 (develop @ `176518d` + ALCF): `ping` ok → `new` → `ask` returned a real assistant reply ("Paris is the capital of France.", session `sess_b92fe41b38dd`) → `log` dumps both messages. Same client stack the interactive TUI uses; interactive rendering covered by the TUI's own teatest suite (all green, 271s). VHS visual recording is environment-blocked on Windows (vhs cannot spawn ttyd); the tape `visual_loop/tapes/release_07_tui_live_turn.tape` is committed for Linux/CI use. |
| D10 | **Release semantics test** — develop→main PR, delete stale v0.9.0 release+tag (user-authorized), tag `clio-desktop-v0.7.0`, verify all pipeline artifacts | IN PROGRESS | v0.9.0 release+tag DELETED ✓; PR #115 (feat/distribution-and-release → develop) open; remaining: CI green → merge → develop→main PR → tag → pipeline verification |

Versioning decision (user): delete the stale GitHub release `clio-desktop-v0.9.0`
(2026-05-28, obsolete) + its tag, then the sequence is 0.7 (pipeline test) → 0.9
(lab demo / bug-hunt build) → 1.0 (public).

### Session log — distribution run (append-only)
- 2026-06-02 Three parallel background agents built D1-D8 (Docker / auto-install /
  bundled variant); all gates green on the combined tree (pnpm 3×, cargo 27, go 8,
  fixture visual 39/39). TUI test + release steps run in the main session.

## PREVIOUS RUN — CLIO #534 SUPPORT BOARD (2026-06-02)

The user asked whether the desktop supports clio's newly-merged feature set
(develop commit `6e064d9`, PR #534: semantic execution event spine + runtime/
declarative hooks + the #479/#480/#482 workspace-management provenance that
landed alongside it). A multi-agent gap analysis found **7 gaps**; all 7 are
now closed with live proof against a self-run clio at **:17803** (develop @
`176518d`, ALCF Metis wired via runtime PUT, and a `CLIO_HOOKS_DIR` pre_message
hook that blocks messages containing "BLOCKME").

Ground truth artifact: the captured SSE wire trace (blocked turn + successful
turn, 15 semantic events) is saved at
`D:\Libraries\Documents\projects\clio-hooks-test\sse-trace-blocked-and-success.log`.

| Gap | What | State | Proof |
|-----|------|-------|-------|
| gap-01 (CRITICAL) | Hook-blocked turns were a **silent failure** — clio sends `message.completed {message_id:<USER msg>, stop_reason:"blocked", error_info}` + `session.status_changed(error)`, no assistant message ever exists; desktop dropped it all | **DONE** | core: `error_info` on MessageCompletedPayload; live.ts copies it + preserves `stop_reason:"blocked"`; Transcript renders a warning-toned "Turn blocked" pill (`msg-blocked-<id>`) on the USER message, no Regenerate. Unit: LiveReducer.test 6/6 + BlockedTurn.test 4/4. **LIVE**: `534-events.spec.ts` gap-01 ×2 — pill renders with the real hook message, and the session recovers (next clean turn completes) (`audit/534-blocked-turn.png`, `audit/534-blocked-then-recovered.png`) |
| gap-02 (CRITICAL) | Hooks editor sent the WRONG wire shape (`{type, handler_uri}`) — every declarative add 400'd | **DONE** | client createHook now sends `{event, command?\|url?}`, hooks() parses `{id,event,command,url,...}` rows. Unit: client.test +4. **LIVE**: add → row renders → delete round-trip vs :17803 (`audit/534-hooks-page.png`, `534-hooks-deleted.png`) |
| gap-03 (IMPORTANT) | `semantic.event` SSE stream (26 event types) not subscribed/stored/rendered | **DONE** | live.ts subscribes + capped per-session feed (500, deduped by event_id); Inspector Timeline gains a capability-gated "Semantic trace" section (summary/status/time only — never the redactable dicts). Unit: SemanticTimeline.test 7/7. **LIVE**: real ALCF turn → llm.request/response + turn.completed rows render (`audit/534-semantic-timeline.png`) |
| gap-04 (IMPORTANT) | Runtime (file-based) hooks invisible — users couldn't see what actually fires | **DONE** | Read-only "Runtime hooks" panel on the hooks page fed from `x_clio_hook_backend` + `x_clio_hook_events` counts. Unit: HooksPage.test 6/6. **LIVE**: shows `local_python` + `pre_message × 1` vs :17803 (same PNG as gap-02) |
| gap-05 (IMPORTANT) | Editor offered 4 of 6 hook kinds + a false "these fire during turns" subtitle | **DONE** | All 6 kinds (`pre_tool post_tool pre_message post_message semantic_event on_error`); honest subtitle: declarative hooks are stored-not-dispatched on this build, runtime hooks are what fire. Same tests/PNG as gap-02 |
| gap-06 (POLISH) | CapabilityFlags typing rejected non-boolean flags (`x_clio_hook_backend` is a string, `x_clio_hook_events` a dict) | **DONE** | Index signature loosened to `boolean\|string\|number\|Record<string,unknown>\|undefined` + the 3 new flags typed. Unit: capabilities.test 3/3 (assigns the real :17803 capabilities JSON) |
| gap-07 (POLISH) | Workspace-management provenance (#479/#480/#482): agent-blueprint binding's `workspace_id`/`agent_overlay`/`activation` not surfaced; **worse — the desktop read `blueprint_id`/`pack_id`, which current clio renamed to `active_agent_blueprint_id`/`active_expert_pack_id`, so bound blueprints/packs NEVER displayed** | **DONE** | client types both field generations; ChatScreen reads new-with-fallback; Inspector Bindings tab gains a read-only "Binding provenance" block (workspace/path/overlay/activation). Unit: BindingsProvenance.test 3/3. **LIVE**: UI dropdown bind → POST → refetch → bound id + provenance render vs :17803 (`audit/534-binding-provenance.png`) |

**Final verification (combined state):** `pnpm -r typecheck` ✓ · `pnpm -r lint` ✓ ·
`pnpm -r test` ✓ (core 49 / web 149 / desktop 5) · `pnpm --filter @clio/web build` ✓ ·
fixture visual 38/38 ✓ · live `534-events.spec.ts` **5/5** vs :17803 ✓.

**Desktop (Tauri) note:** the Rust SSE bridge forwards `data:` payloads without
filtering on SSE event names, so `semantic.event` flows through the desktop path
with zero Rust changes; only the web `EventSource` path needed the named-event
subscription. No sse_bridge.rs change required.

### Session log — #534 support run (append-only)
- 2026-06-02 **All 7 gaps closed.** Two parallel background agents (A: gaps
  1/3/6 — wire/live/Transcript/Inspector; B: gaps 2/5/4 — client hooks methods +
  hooks page), then gap-07 (binding provenance + the field-rename fix) done in
  the main session after both agents landed (it needed files both agents owned).
  Wire contracts verified against clio source AND live :17803 before
  implementation; the captured SSE trace is the ground-truth artifact. New spec
  `web/tests/visual/534-events.spec.ts` (5 tests, all live-proven). Six new
  audit PNGs. Commits: see below.

## PREVIOUS RUN — 1.0 CLOSURE `/goal` (2026-06-02)

**Goal:** implement, test, review, and close ALL 9 pending vNext items + any emergent
issues; extensive hardening + testing of web AND desktop; 100% 1.0-ready. **DEFERRED is
not a legal terminal state this run** — every item ends DONE-with-proof, or (only where
a backend capability is genuinely missing) ABSENT→stacked-PR-opened with the desktop
side capability-gated.

**Environment this run:** the user's clio at **:17800 is back UP** (develop build — no
PR-gated capabilities). The self-run **:17801** PR-stack instance (develop + PRs
#522/#523/#527/#530) is still up and advertises `session_summary`/`attachments_upload`/
mcp-reconnect. Use :17800 for production-parity verification, :17801 for PR-gated
surfaces. Same rules as before: NEVER kill/restart/rebind :17800.

### 1.0 item board (this run's source of truth)
| # | Item | State | Proof |
|---|------|-------|-------|
| 1 | Light theme (+ Auto/system preset) | **DONE** | LightTheme.test 7/7 (full token coverage + auto-mode matchMedia); fixture `light-theme-chat.png` + `light-theme-diff.png` + live-switch `settings-light-theme.png` (suite 36/36) |
| 2 | Inline file & image previews (transcript + @-picker) | **DONE** | Backend: clio PR **#533** (GET context-file content + `x_clio_files_content`). Desktop: PartImage renderer (base64/url + honest file-ref placeholder), capability-gated Inspector Context-tab preview (image/text). PreviewsAndAttempts.test 9/9 (shared with item 3); fixture `previews-and-retry.png` (38/38); LIVE audit "(1.0 item 2)" vs **:17802 running PR #533** — real PNG uploaded → preview button → real bytes round-tripped + rendered (`audit/item2-context-preview.png`). @-picker hover preview documented as out of scope: the backend only serves REGISTERED context files; arbitrary workspace-file bytes need a future clio endpoint. |
| 3 | Message edit history / "edited" markers (honest design) | **DONE** | Honest design = clio's retry/attempts lineage (no fake desktop state): ↻ retry chip on `metadata.retry_attempt_id` messages + Inspector **Attempts tab** (status/notes/model/timestamps from GET /attempts). Unit tests in PreviewsAndAttempts.test; fixture `previews-and-retry.png`; LIVE (extended item-4 test) vs :17801 — real retry → chip renders + Attempts tab shows the real notes (`audit/item3-attempts-tab.png`) |
| 4 | Retry-with-notes + retry-with-model menu | **DONE** | RegenMenu.test 7/7; fixture `retry-menu-open.png` + `retry-model-submenu.png`; LIVE oneturn "(1.0 item 4)" vs :17801 — real ALCF retry turn, TurnAttempt.notes recorded server-side (`audit/item4-retry-notes-turn.png`) |
| 5 | Inspector execution timeline | **DONE** | assembleTimeline + Timeline tab; Timeline.test 7/7; fixture `inspector-timeline.png` (suite 37/37); LIVE oneturn "(1.0 item 5)" vs :17801 — real ALCF turn timeline with wire timestamps/tokens/elapsed (`audit/item5-timeline-live.png`) |
| 6 | Large-transcript virtualization (1000+ msg proof) | **DONE** | VirtualTranscript.test 5/5; LIVE oneturn "(1.0 item 6)" vs :17801 — 1000 imported messages → DOM stays <200 nodes, top/bottom scroll mounts the right rows (`audit/item6-virtual-1000.png` + `item6-virtual-top.png`); 120-msg under-threshold test still full-renders |
| 7 | Settings import/export | **DONE** | SettingsExport.test 6/6 (roundtrip + credential-exclusion guard); fixture `settings-data-section.png` + `settings-data-exported.png` (suite 34/34); LIVE audit "(1.0 item 7)" vs :17801 — real download → modify → import → values restored (`audit/item7-settings-roundtrip.png`) |
| 8 | Notification-center search/filter | **DONE** | NotificationCenter.test 7/7; fixture `notification-center{,-search,-filtered}.png` (suite 33/33); LIVE audit "(1.0 item 8)" vs :17801 — real send-failure notification searched + tone-filtered (`audit/item8-notif-search.png`) |
| 9 | Native window menus (Tauri) | **DONE** | Rust: menu.rs + cargo --lib 21/21. JS: menu-actions.ts dispatch + MenuActions.test 3/3 (incl. JS↔Rust contract test reading menu.rs). REAL-APP PROOF: debug exe launched → **OS screenshot shows the native File/Edit/View/Help menu bar on the running app** (`item9-native-menu.png`) → graceful close, zero leaked processes |
| E1 | Transcript code-block line-number gutter | **DONE** | InlineMarkdown.test 12/12 (gutter numbers, no-gutter on 1-line, copy-without-numbers); refreshed `code-syntax-highlight.png` shows the gutter; fixture suite 36/36 |
| E2 | hljs lazy-load (pure-web bundle size) | **DONE** | HljsLazy.test 4/4; initial chunk **524→366 kB minified (156→104 kB gzip)**, hljs in its own async chunk; highlighting still asserted in fixture tests (eventually-consistent) |
| E3 | Restore MCP Reconnect button (capability-gated on #523) | **DONE** | McpReconnect.test 4/4; LIVE audit "(1.0 item E3)" run against BOTH backends — :17801 (PR stack, route exists) = success toast + refetch; :17800 (develop, no route) = 404 → button disabled + latched + "not supported" tooltip (`audit/item-e3-mcp-reconnect.png`). No silent failures either way. |
| H | Final hardening + full test sweep (web + desktop + Rust) | **DONE** | Full sweep all green: fixture visual 38/38 · FULL live audit 42 passed (+1 isolation-cleared flake, 2 legit skips) · FULL live oneturn 19 passed (2 legit skips) · cargo --lib 21/21 · **WebView e2e 1/1** · unit 170 (core 42 / web 123 / desktop 5). **TWO REAL BUGS FOUND + FIXED by the sweep:** (1) gact_http bridge threw on ALL 204 responses (null-body Response constructor) — every desktop 204 endpoint (permission resolve, deletes, compact) failed client-side while succeeding server-side; (2) permission card depended solely on the SSE round-trip to clear — now also clears optimistically on a 200 resolve. |

States: PENDING → IN-PROGRESS → **DONE** (named test + PNG + live proof, cited in the
session log) or **ABSENT→PR-OPENED** (backend gap proven in source, stacked clio PR
opened, desktop side capability-gated). Nothing else is terminal.

### Session log — 1.0 closure run (append-only)
- 2026-06-02 **CLIO PR STACK: REVIEWED → FIXED → REBASED → ALL MERGED INTO develop.**
  The user reviewed the 5 open clio-agent PRs and requested fixes + merge. Executed:
  **(1) Stack restructure + review fixes** (6-agent workflow): rebased everything onto
  current develop in a NEW order (#530 first, per the user's "merge early" call), then
  per-PR fixes as visible commits — #530: subscriber_count("") fan-in audited (no reader
  affected; documented in code); #522: summary prompt moved from hardcoded route text to
  a packaged prompt-registry entry (`session_summarize`, profile-aware, overridable, with
  in-code fallback) + 3 new tests; #523: transport-spec validation (structured 4xx for
  malformed stdio/http specs) + timeout around reconnect/probe; #527: unique temp-file
  for atomic writes (concurrency race fixed), confinement checked before any disk write,
  oversized-base64 rejected BEFORE decode; #533: workspace confinement tightened (rows
  with workspace_id are ALWAYS rechecked against the workspace root, absolute paths
  served as-is only when boundary-less). Stack verification: ancestry intact, 1418
  passed / 6 pre-existing-on-develop failures / 0 new, mypy clean.
  **(2) Merge cascade** (squash merges, bottom-up, tree-identity-verified rebases between
  each): develop now carries `acad868` (#530) → `4bb04e9` (#535*) → `d3e3df2` (#523) →
  `b2f9d59` (#527) → `176518d` (#533). *#535 replaces #522: GitHub auto-closed #522
  unrecoverably when its base branch was deleted by the #530 merge (same branch, same
  commits, tree-identical). Procedure was corrected after that first bite (retarget
  dependents BEFORE deleting parent branches) — no other PR was lost. All 5 feature
  branches deleted from origin; local clio-agent develop synced to `176518d`.
  **Implication for the desktop:** every capability-gated feature (summarize, MCP
  reconnect, attachments upload, global event toasts, file-content previews) lights up
  on any clio built from develop ≥ `176518d`. The :17801/:17802 test instances are now
  obsolete (their PR-stack purpose is merged); :17801 left running as a test backend.
- 2026-06-02 **Item H DONE — 1.0 CLOSURE RUN COMPLETE. All 13 board rows terminal.**
  Final sweep: fixture 38/38 · full live audit suite 42 passed (1 catalog-browser
  flake re-passed in isolation; 2 legit voice/mic skips) · full live oneturn suite 19
  passed (2 legit skips: voice gap + homelab-tunnel-gated) · cargo --lib 21/21 ·
  **real-WebView2 e2e 1/1** · unit 170/170 · web+desktop builds clean.
  **The e2e exposed and led to fixing TWO real production bugs:**
  (1) `tauriFetch` (gact_http bridge) constructed `new Response(body, {status:204})`
  — a TypeError for null-body statuses (204/205/304) — so EVERY desktop 204 endpoint
  (permission resolve, session delete, context-file remove, compact) threw client-side
  while the server applied the change. Web builds never hit this (native fetch).
  Fixed: null body for null-body statuses.
  (2) The permission card cleared ONLY via the `permission.resolved` SSE round-trip;
  now it also clears optimistically when the resolve POST returns 200.
  Both verified by the now-green WebView e2e (card renders + clears through the real
  Tauri stack vs :17801). Environmental notes: the user's :17800 went unhealthy
  (health=503) mid-run and could not be used for the e2e — `CLIO_PORT=17801` attach
  override used instead (documented supervisor env). :17802 (PR #533 test instance)
  stopped after item-2 verification, no leaks; :17800/:17801 untouched.
- 2026-06-02 **Items 2 + 3 DONE — ALL 9 ITEMS + 3 EXTRAS NOW TERMINAL.**
  **Item 2 — inline file & image previews:** core client gains
  `getContextFileContent()` + the `x_clio_files_content` capability type (PR #533 wire
  contract). Transcript now renders `image` parts (base64/url → real `<img>`; backend
  file references → honest placeholder; they used to silently DROP — real gap fixed).
  Inspector Context tab gains a capability-gated "view" button per context file →
  fetches real bytes through the new endpoint → image or decoded-text preview panel.
  PROOF: unit 9/9; fixture `previews-and-retry.png`; LIVE vs a third clio instance
  **:17802 built from the PR #533 worktree** — uploaded a real PNG attachment via the
  API → preview button → bytes round-tripped + rendered (`audit/item2-context-preview.png`).
  Scope note (honest): @-picker hover previews are NOT possible with #533 alone (it
  serves registered context files only, not arbitrary workspace files) — documented as
  a future clio endpoint, not faked.
  **Item 3 — edit history (honest design):** clio's model is retry-creates-new-turns,
  so the desktop surfaces exactly that: a ↻ retry chip on messages carrying
  `metadata.retry_attempt_id` + a new Inspector **Attempts** tab listing server-recorded
  TurnAttempts (status, steering notes, model override, timestamps; auto-refreshed when
  messages change). No fabricated "edited" state. PROOF: unit tests; fixture chip PNG;
  LIVE — the item-4 retry test now also asserts the chip + the Attempts tab showing the
  real notes after a real ALCF retry (`audit/item3-attempts-tab.png`).
- 2026-06-02 **Items 5 + E3 DONE.**
  **Item 5 — Inspector execution timeline:** new Timeline tab assembled by a pure
  `assembleTimeline(message)` (exported, unit-tested): started → routing → thinking →
  tools (paired with results: status + measured duration_ms + duration bars) → diffs →
  response text → completed (stop reason, real token counts, cost, elapsed from the
  wire's own created/updated stamps). Honest representation: the wire orders parts but
  doesn't timestamp them — so the timeline shows sequence + only real timestamps/
  durations, never fabricated ones. PROOF: Timeline.test 7/7; fixture
  `inspector-timeline.png` (37/37); LIVE vs :17801 real turn
  (`audit/item5-timeline-live.png`).
  **Item E3 — MCP Reconnect button restored** (background-agent + live verification):
  graceful-degradation gating since clio has no reconnect capability flag — on a backend
  WITH the route (PR #523 stack, :17801): success toast + list refetch; on develop
  (:17800): the 404 disables + latches the button with a "not supported" tooltip + one
  info toast. LIVE-PROVEN against BOTH backends in one parameterized audit test;
  `audit/item-e3-mcp-reconnect.png`. McpReconnect.test 4/4.
- 2026-06-02 **Items 6 + 9 + E1 + E2 DONE (one combined landing).**
  **Item 6 — transcript virtualization:** Transcript.tsx gains estimate-based windowed
  rendering past 150 messages (scroll-position window + buffer, spacer divs preserve
  scroll geometry, measured-height refinement, off-window Cmd+F/permalink jump fallback,
  entrance animation suppressed in virtual mode). Below the threshold behavior is
  unchanged (the 120-msg W4 test still full-renders). PROOF: VirtualTranscript.test 5/5;
  LIVE "(1.0 item 6)" vs :17801 — 1000 imported messages → DOM <200 nodes at every scroll
  position, scroll-to-top mounts msg #0, scroll-to-bottom mounts msg #999
  (`audit/item6-virtual-1000.png`, `audit/item6-virtual-top.png`); test session deleted after.
  **Item 9 — native window menus (JS half + real-app proof):** tauri.ts `onMenuAction()`
  listener + menu-actions.ts dispatch map (12 action-ids routed to the SAME handlers the
  keybinds use); MenuActions.test 3/3 including a cross-language contract test that reads
  menu.rs and asserts the id sets match exactly. REAL-APP PROOF: launched the debug
  clio-desktop.exe (spawn path, real sidecar) → OS-level window screenshot shows the
  native **File Edit View Help** menu bar above the live app (`item9-native-menu.png`) →
  graceful close → process set identical to pre-launch (zero leaks).
  **E1 — code-block line gutter** (background-agent): per-line hljs splitting with a
  sticky non-selectable gutter (>1-line blocks only); Copy still copies raw source.
  **E2 — hljs lazy-load** (background-agent): dynamic import → initial web chunk
  524→366 kB minified (156→104 kB gzip), hljs in its own async chunk; the 500 kB chunk
  warning is gone. InlineMarkdown.test 12/12, DiffPane.test 8/8, HljsLazy.test 4/4.
  All gates green: typecheck/lint, web unit 103/103, build, fixture visual 36/36.
  **Emergent issue (noted for item H):** `pnpm fetch-sidecar` is broken on this box (Go
  tries to fetch a linux/amd64 toolchain under git-bash); bypassed by calling
  `tauri build` directly since the launcher binary already exists. Needs a fix or a
  documented workaround before the next release build.
- 2026-06-02 **Item 1 DONE — Light theme + Auto mode.** New `src/theme.ts` module (extracted
  from SettingsShell): full 24-token light palette (every design-system color token + new
  override-only tokens for hljs string/number colors and diff add/del tints — those were
  hardcoded dark values in CSS, now `var(--…, fallback)`). Theme modes: Dark (design-system
  default), Light (applies the palette), Auto (follows `prefers-color-scheme` LIVE via a
  matchMedia listener; re-armed on reload by `initTheme()`). The Appearance theme buttons
  are now real (were decorative); presets and modes stay in sync (Light preset == light
  mode). `apps/design/` untouched (read-only) — light lives at the web layer as overrides.
  PROOF: unit `LightTheme.test.ts` 7/7 (token coverage incl. hljs/diff, persistence,
  matchMedia auto-switch live, init from bare flag); fixture `light-theme-chat.png` +
  `light-theme-diff.png` (light chat + light diff pane); live-switch test clicks
  Light in Settings → computed `--color-bg` flips to `#f4f6fa` → `settings-light-theme.png`
  → Dark restores `#000000`. Suite 36/36.
- 2026-06-02 **Item 9 (Rust half) — native window menus + REGRESSION FIX.** Background-agent
  built `src-tauri/src/menu.rs`: File/Edit/View/Help native menu (declarative MENU_SPEC →
  build_menu interpreter), Edit/Quit as OS-predefined items, accelerators (CmdOrCtrl+N/S/
  Comma/I/B/K//, Ctrl+O, F11), non-predefined items emit `clio:menu` `{action}` to all
  windows (12 documented action-ids); fullscreen also toggles natively. 6 cargo tests
  (spec structure, id→action coverage, accelerator contract). **Regression found+fixed:**
  the prior accidental commit (df48b26) carried a `tauri` dev-dependency with the `test`
  feature — on Windows that links wry into the test binary → `STATUS_ENTRYPOINT_NOT_FOUND`
  → EVERY cargo --lib test failed at HEAD. Removed; pure-data spec tests need no mock
  runtime. cargo build 0 / cargo test --lib **21/21**. JS listener half is next.
- 2026-06-02 **Item 7 DONE — Settings export/import (Data & backups).** New
  `settings-export.ts`: versioned envelope (`{version:1, exportedAt, app, prefs}`) of
  every `clio.*` localStorage key as raw strings — EXCEPT `clio.backends.v1` (bearer
  tokens never leave the machine; also never applied on import even from a tampered
  file). New Settings → "Data & backups" section: Export downloads
  `clio-settings-<timestamp>.json`; Import restores via file picker + reload.
  PROOF: unit `SettingsExport.test.ts` 6/6 (roundtrip, credential exclusion both ways,
  version/JSON validation); fixture `settings-data-section.png` +
  `settings-data-exported.png` with a real browser download asserted (suite 34/34);
  LIVE audit "(1.0 item 7)" vs :17801 — export → file content verified (prefs in, registry
  out) → prefs changed → import → values restored (`audit/item7-settings-roundtrip.png`).
- 2026-06-02 **Item 8 DONE — Notification-center search + tone filter.** Bell popover
  gains a fuzzy search input (shared `fuzzy.ts` matcher; title outranks body) + tone
  filter chips (All/Errors/Warnings/Success/Info) + a no-match empty state. New
  `toast.push({silent: true})` option records history-only entries (no visible toast) —
  used to seed the fixture suite deterministically and genuinely useful for ambient
  events. PROOF: unit `NotificationCenter.test.tsx` 7/7 (incl. silent-push semantics +
  a non-silent regression guard); fixture `notification-center.png` +
  `notification-center-search.png` + `notification-center-filtered.png` (suite 33/33);
  LIVE audit.spec "(1.0 item 8)" vs :17801 — a REAL send-failure notification (aborted
  POST → error toast → history) searched, no-match state shown, tone-filtered
  (`audit/item8-notif-search.png`).
- 2026-06-02 **Item 4 DONE — Regenerate variant menu (plain / with-notes / with-model).**
  Transcript's Regenerate action now opens a variant menu: plain retry, "with notes…"
  (inline textarea → `RetryTurnRequest.notes`), "with model" (submenu fed by the live
  providers list → `provider_id`/`model_id` override). Fixture mode passes no-op message
  actions + a static model list so the menu is provable deterministically.
  PROOF: unit `RegenMenu.test.tsx` 7/7; fixture `retry-menu-open.png` +
  `retry-model-submenu.png` (suite 32/32); LIVE oneturn-audits "(1.0 item 4)" vs :17801 —
  menu on a real turn → notes submitted → clio created the retry user message + a second
  assistant turn + recorded a TurnAttempt with our notes (verified via GET /attempts);
  PNGs `audit/item4-retry-menu.png` + `audit/item4-retry-notes-turn.png`.
  **Two real findings fixed along the way (test-infra hardening):**
  (1) `sendOneTurn` clicked the FIRST session row — wrong whenever any old session is
  pinned (pinned rows sort first); every test was silently dumping turns into a stale
  pinned session. Now: API-created session + exact `session-row-{sid}` selection.
  (2) clio's planner rejects direct answers as `stale_or_invalid_answer_text` when the
  IDENTICAL prompt is replayed across runs (DSPy LM cache) → intermittent "Turn failed"
  on the fixed test question. Now: unique nonce per test turn. Also unpinned the stale
  test session on :17801 (environment hygiene).
- 2026-06-02 **Item 2 backend half DONE — clio PR iowarp/clio-agent#533** (closes #532,
  stacked 5th on #530): `GET /v1/sessions/{sid}/context/files/content?path=…` serves
  registered context-file/attachment bytes as base64-JSON (`{"file":{path, display_path,
  size, media_type, encoding:"base64", data}}`) with traversal confinement + 10MiB preview
  cap; advertises `x_clio_files_content`. 14 endpoint tests; zero new full-suite failures;
  mypy clean. Worktree kept at `D:\...\clio-agent-content-pr` for a live test server.
  Desktop half (capability-gated preview UI) is next for item 2.
- 2026-06-02 Run started. Grounding workflow launched (11 read-only agents mapping all
  items + extras against gact + clio-agent source). Baseline gates re-verified at
  b422d22 (lint/typecheck/unit/build + fixture visual 31/31 after a browser-crash flake
  re-run). :17800 answered 200 at run start but went 503 (degraded) shortly after — NOT
  touched per the never-rebind rule; all live verification targets :17801.

## PRIOR RUN LEDGER — release-readiness `/goal` (COMPLETE 2026-06-01)

Live ledger for the long-horizon release-readiness goal. Full plan:
`~/.claude/plans/mellow-yawning-map.md`. Update the boards in place; append to the
session log. **No item is DONE without a named proof artifact** (test name + PNG, a
`cargo --lib` line, or a flag-gated UI drive). **Source of truth = clio-agent source
(`gact/types.py`, `app.py`) + live `/v1/capabilities`, NOT `contract/SPEC.md`** (stale).

**ID convention (2026-06-01):** internal audit-gap IDs are written `gap-NN` (NO bare
`#NN` — GitHub auto-links those to unrelated repo issues); only genuine issues use
`owner/repo#NN`. **Backend gaps now → file issue + IMPLEMENT + open PR** (the user
lifted the clio-agent no-touch rule on 2026-06-01; PRs stack from `develop`, PR-N
branched off PR-(N-1); the user reviews+merges). PRs only — never push develop/main.

### Wave board
| Wave | Exit criterion | State |
|------|----------------|-------|
| W0 Baseline | house cmds + `cargo --lib` (CLIO_GACT_URL=:17800) green-or-logged | EXIT-MET 2026-06-01: lint/typecheck/unit(core+web+desktop 5/5)/web-build green; cargo --lib 14/14 vs live :17800; tauri:build:debug green this session; fixture screenshots.spec 28/28 (fixed connect-screen env-sensitivity). clio agent=ready. |
| W1 Verifier trust | tauri-driver WebView e2e green-or-documented | EXIT-MET 2026-06-01: real-WebView2 permission round-trip passes (TAURI_E2E=1 webview-e2e.test.mjs 1/1; proof w1-webview-permission.png). Two fixes below. |
| W2 Parity re-verify | every wired surface LIVE/FLAG-GATED-PROVEN or ABSENT→issue; zero limbo | **EXIT-MET 2026-06-01** — see "W2 CLOSURE" section below the action queue: every queue item now [x] fixed-with-proof, RESOLVED-VIA-PR, or DEFERRED-LATENT with reason; zero in limbo. Earlier in-progress note: | live caps confirm `x_clio_user_questions=True` (#94 verifiable, not blocked) + clio publishes authoritative `x_clio_capability_gaps` (voice/lsp=unsupported, /optimize=unavailable, render_disabled) — clio-DECLARED gaps, not desktop bugs. Next: trigger ask_user + drive the card; confirm desktop honors capability_gaps; re-verify remaining labels. |
| W3 UX (tiered) | every backlog item DONE-with-PNG or DEFERRED-with-reason | **EXIT-MET 2026-06-01**: all 23 backlog items terminal — T1 8/8 DONE, T2 6 DONE + 3 DEFERRED, T3 6 DEFERRED (see "W3 CLOSURE" section; every DONE has a PNG, every DEFERRED a concrete reason). Prior in-progress note: | T1 done = fuzzy search (palette+@-picker, `slash-palette-fuzzy.png`), code syntax-highlight (`code-syntax-highlight.png`; line numbers deferred sub-item), a11y focus-visible ring, **actionable error states** (`audit/w3-error-discovery-retry.png` + `w3-error-toast-action.png`), **skeleton loaders + motion + prefers-reduced-motion** (`audit/w3-skeleton-discovery.png`), **topbar overflow menu** (`audit/w3-topbar-overflow.png`), **a11y: focus traps + aria-live + focus ring + reduced-motion + high-contrast** (`audit/w3-a11y-focus-trap.png`, `audit/w3-settings-high-contrast.png`), **settings depth: presets + test-connection + notif prefs** (`audit/w3-settings-test-connection.png`), **first-run onboarding tour** (`audit/w3-onboarding-welcome.png` + `w3-onboarding-composer.png`). **TIER 1 COMPLETE** (one deferred sub-item: code-block line numbers). Now: Tier-2 → Tier-3. |
| W4 Hardening + homelab | each row PROVEN or DOCUMENTED; homelab real-turn once | IN-PROGRESS 2026-06-01: ✅SSE drop→reconnect PROVEN (oneturn-audits "W4: SSE drop", `audit/w4-sse-drop.png` + `w4-sse-reconnected.png`; **found+fixed a real gap: no offline/online listeners — a dropped network left the EventSource silently dead; live.ts now tears down on `offline` and reconnects instantly on `online`**). ✅Concurrent turns PROVEN (2 parallel ALCF turns, `w4-concurrent-turns.png`). ✅Large transcript PROVEN (120-msg import renders+scrolls, `w4-large-transcript.png`). ✅Rust rows: cargo --lib 14/14 vs :17801 (gact_http ×3, sse_bridge ×2, supervisor ×6, ssh bad_host). ✅Supervisor SPAWN PROVEN (new `spawn_path_launches_probes_and_reaps` test — real launcher → real clio spawn → capabilities answer). ✅Shutdown reaping PROVEN — **REAL BUG FOUND+FIXED: on Windows, killing the Go launcher orphaned the clio-agent-gact grandchild (every app close leaked a Python process); Supervisor::shutdown now tree-kills via `taskkill /T /F`**. ✅SSH tunnel forward + reaping + bad-host PROVEN against the REAL homelab (10.0.0.102, localhost-only :18900 service; cargo 15/15 with SSH_TUNNEL_* env). ✅**Homelab real-turn hop PROVEN (open→prove→close)**: clio-agent@develop provisioned on the homelab (GitHub clone + uv, Python 3.12, ~/clio-w4-test), started with the **claude_code provider** (the homelab's authed claude CLI) on localhost-only :17901 → `ssh -L 17901` tunnel from this machine → capabilities + health (agent:ready, lm:ready) through the tunnel → real turn ("homelab", end_turn, 29.8k/595 tokens, model=sonnet) → **desktop UI drove the tunneled backend** (oneturn-audits "homelab hop" test, `audit/w4-homelab-hop.png`) → tunnel closed + remote clio stopped + port verified free (no leaks). **W4 = EXIT-MET.** |
| W5 Release readiness | 3 blockers cleared/documented + `apps/RELEASE-READINESS.md` | **EXIT-MET 2026-06-01**: `apps/RELEASE-READINESS.md` written (blocker 1 CORS=DOCUMENTED Windows-proven, blocker 2 macOS installer=DOCUMENTED fix-on-branch, blocker 3 ALCF round-trip=**CLEARED with proof** — multiple real ALCF turns this run). **Local Windows release dry-run PASSED**: `tauri build` → clio-desktop.exe + `CLIO Desktop_0.9.0_x64_en-US.msi` (4.9MB). Includes the exact human tag-push command + pre-push checklist. Remaining: none for the W5 exit (the macOS/Linux legs are CI-on-tag by design). |

### Verification matrix — RE-VERIFY against clio-agent SOURCE (do NOT trust prior "blocked" labels)
- **user_question / ask-user retry — NOT blocked** (I mislabeled it). clio-agent
  implements it: `app.py` emits `user_question.created/answered/resumed/cancelled`;
  capability advertised `x_clio_user_questions=True` (`app.py:7267`); trigger = the
  DSPy agent returning an `ask_user` action. → **FLAG-GATED**: enable on a SEPARATE
  clio, induce a question, drive the desktop card + answer round-trip; verify the
  desktop reads the question shape (watch for an E-27-style wire mismatch).
- **user_question / ask-user (#94)** — ✅ LIVE-PROVEN (was mislabeled "blocked"). Found + fixed an E-27-class WIRE BUG: clio emits the `UserQuestion` fields FLAT in the `user_question.created` payload (`Event payload = row.model_dump()`), but `live.ts` read `payload.question` → card never rendered. Fixed to read the flat shape. Proven against live :17800: POST a confirmation question → card renders (`94-ask-user-card.png`) → Yes clears it (`94-ask-user-answered.png`). Test: oneturn-audits `(#94)`.
- **TTS `/voice/synthesize` + voice transcribe** — clio's own `x_clio_capability_gaps.voice` declares status=`unsupported`, advertised=false, client_behavior=`render_disabled`, category=future_capability. → DOCUMENTED (clio-declared gap, NOT a desktop bug, NO issue needed); verify the desktop renders voice controls disabled/hidden per the gap.
- **LSP** — clio `x_clio_capability_gaps.lsp` = `unsupported`/render_disabled. → verify the desktop Doctor LSP surface honors the gap (render-disabled), DOCUMENTED.
- **/optimize command** — clio gap `optimizer_command` = `unavailable`/render_disabled. → verify palette renders it disabled, DOCUMENTED.
- **MCP `/resources/read`** — re-check source; if absent → issue.
- **autorename `session.updated(title)`** — re-check whether clio emits it under any path; else issue.
- **`lm.provider.{changed,failed}` on session SSE** — re-check emit path; else issue.
- **diff-emitting edit tool (`file.diff.*`)** — re-check whether any tool proposes diffs; else issue.
- **PATCH `/v1/sessions` partial; policies PUT write shape** — re-check + fix desktop or issue.
- **All other wired surfaces** (sessions/messages/permissions/tasks/context/frames/
  schedules/agents/blueprints/expert-packs/prompts/providers/mcp/workspaces/commands/
  memory/sharing/doctor) — confirm LIVE-PROVEN (many already are via audit/oneturn specs).
- **Hardening (W4):** SSE drop→reconnect (Rust bridge), concurrent turns, large
  transcript, supervisor SPAWN path, shutdown reaping, ssh error paths, homelab real-turn hop.
- **FINDING (W1) — Rust SSE bridge must be the only desktop stream path.** Earlier
  W1 work used a bridge-first raw-`EventSource` fallback when the Rust SSE bridge did
  not open in WebView2. That made desktop streaming work but defeated #111's
  CORS-independence goal. Current `live.ts` keeps the pure-web `EventSource` path, but
  Tauri now retries the Rust bridge through the normal reconnect ladder instead of
  falling back to WebView SSE. If WebView2 bridge startup regresses, it should surface
  as `sse · reconnecting` rather than silently returning to CLIO CORS/trust_socket.

### W2 ACTION QUEUE — from the parity verification workflow (wf_a9bd8de8, 7 agents, exhaustive)
Each item: fix → verify (live where possible) → commit (STATUS in same commit). Work Tier-A first.

**🔴 WIRE-FIX Tier A (silent failures on advertised, user-reachable surfaces):**
- [x] SSE `user_question.created` nested `p.question` → flat (DONE, commit 06321a0; workflow independently re-derived it).
- [x] `GET workspaces/{id}/files` reads `res.files`; clio sends `{entries}` → @-mention picker showed ZERO files. **DONE** (commit pending): `workspaceFiles` now normalizes `entries`→`files`; ALSO found+fixed a `??`-vs-`?:` operator-precedence bug in ChatScreen `workspaceId` that resolved to `undefined` whenever the session had a workspace (double root cause). LIVE-PROVEN: strengthened #96 asserts real file items appear.
- [x] `POST agent-blueprints/install` POSTed bare `/v1/agent-blueprints` (GET-only → 405). **DONE**: repointed to `/v1/agent-blueprints/install`, body `{source, scope}`; verified vs clio source (install handler reads `source|url|path` + scope global|workspace). Client test asserts the /install URL.
- [x] `agent-blueprints/validate` + `expert-packs/validate` sent an inline JSON doc + read `{ok,errors}`; clio validates BY PATH (`{path, scope}`) and returns `{enabled, validation_errors}`. **DONE**: client now sends `{path, scope}` + normalizes `{enabled,validation_errors}`→`{ok,errors}`; the RoadmapPages modals collect a **path + scope** (not a pasted doc — that never matched clio's filesystem model) — git URLs install-only (no pre-validate). Client test asserts the validate body + enabled→ok mapping. typecheck/lint/web-build green; core 40/40.
- [x] `POST sessions/{sid}/summarize` was 404 (clio had no route) + UI waited on `session.summarized` (never fired). **RESOLVED via the build-the-backend doctrine, NOT delete** (per user: summarize is a distinct planned feature ≠ compact): implemented the route in clio-agent (PR `iowarp/clio-agent#522`, closes #521 — non-destructive TLDR, emits `session.summarized`, advertises `session_summary`; 8 tests, full gate green). Desktop gates both summarize palette commands on `capabilities.session_summary` (hidden until a backend advertises it; light up once #522 merges). `live.ts` `session.summarized` branch marked forward-compat; core test asserts the client POST. LIVE-PROVEN after #522 merges + clio restart.
- [x] `DELETE context/files` sent `?path=` query; clio reads JSON body only → silent no-op. **DONE**: `removeContextFile` now sends `{path}` body. Confirmed live (query→204 but stays; body→removed). LIVE-PROVEN: oneturn `(#80)` seeds a file, removes it via the inspector, asserts it's gone.

### W2 CLOSURE (2026-06-01) — every queue item terminal

**Tier B — both remaining items now [x]:**
- [x] `DELETE agent-blueprints/{id}` scope/workspace_id → **FIXED**: `uninstallAgentBlueprint`
  takes `{scope, workspace_id}` opts (query params per clio's route signature, verified at
  app.py:13613); BlueprintsPage passes the blueprint's own `scope` (live :17801 list response
  confirms blueprints carry `scope`). Core client test asserts the query param.
- [x] `compact` reducer `removed_count`→`archived_count` → **WAS ALREADY FIXED** in an earlier
  loop (live.ts session.compacted reads `archived_count`, tolerates legacy name; verified
  against app.py:11337) — only this checkbox was stale.

**Tier C (latent/cosmetic) — all DEFERRED-LATENT with reasons (none user-reachable today):**
- rewind: no UI call site exists (the client method is forward-compat; palette uses undo) → latent by definition.
- `files/read` JSON-vs-text: latent — no UI surface calls files/read directly today.
- frame chips (`tokens_estimated`) + schedule chips (`question`/`last_fired_at`/`fire_count`):
  cosmetic dead chips in inspector lists; the core data (frame/schedule rows) renders. → vNext.
- `user_question.resumed` ids-only payload: the resumed path requires clio's orchestrator to
  resume a cancelled question — not reachable from the desktop; the created/answered/cancelled
  paths are LIVE-PROVEN (#94). → latent.
- blueprint/pack `*_id:null` clear → 400: the UI doesn't expose an "unbind" button (only bind);
  → latent until an unbind affordance ships.
- `answer_metadata` missing from UserQuestion type + subagent `agent_name`/`agent_id` fallback:
  cosmetic type-completeness; behavior correct. → vNext.

**ABSENT items — resolved:**
- [x] MCP reconnect → PR iowarp/clio-agent#523 (implemented).
- [x] latent MCP 404s (resources/read, resources/subscribe, prompts/get, resource_templates):
  DEFERRED-LATENT — these UI affordances render only when an MCP server advertises resources/
  prompts; clio's gateway exposes tools only today. The buttons cannot be reached. (A clio-side
  resources gateway is the prerequisite — candidate future PR.)
- [x] dead SSE branches → resolved by the earlier dead-SSE audit (forward-compat documented).

**DOCUMENTED-GAP confirmations:**
- [x] voice=false → desktop hides voice controls (oneturn-audits skip + composer gate) ✓
- [x] lsp=false → Doctor LSP section renders only when clients exist ✓
- [x] `/optimize` render_disabled → not in the palette default set; backend commands list is
  capability-driven ✓
- [x] routing_decision Part renders → **CONFIRMED** (visible in `audit/w4-homelab-hop.png`:
  "routed to chat · dspy" card) ✓

**🔴 WIRE-FIX Tier B (wrong/degraded, not crashing):**
- [x] **DONE (one unit):** Regenerate now calls `retryTurn(sid, msg.id, {execute:true})` (`POST /v1/sessions/{sid}/messages/{id}/retry`, 202 → TurnAttempt) instead of blindly re-sending the user text — preserves attempt lineage; clio derives the source user message. Added `retryTurn()` + `listAttempts()` + the `TurnAttempt` wire type. Subscribed `turn.retry_{running,completed,failed,cancelled}` (was only `_requested`) so the toast resolves. Verified vs clio source (retry route + `turn.retry_{status}` emit family + RetryTurnRequest/TurnAttempt models). core 41/41 (retryTurn URL/body test); typecheck+lint+web-build green.
- [x] **DONE**: `expert_handoff` Part was dropped (no renderer; `'expert_handoff'` wasn't in the Part union, and a dead top-level SSE reducer case + named-event subscription pretended it was an event). Added `PartExpertHandoff` to the wire union + a Transcript renderer (mirrors routing_decision: who handled it + status + summary, from `metadata`/`text`); removed the dead live.ts event case + subscription. Verified vs clio source (Part emit app.py:3224 + `_expert_handoff_summary` field names). typecheck/lint/web-build green; core 41/41.
- [ ] `DELETE agent-blueprints/{id}` omits `scope`+`workspace_id` → won't match builtin/global. http.ts:1470.
- [ ] `compact` reducer reads `p.removed_count`; clio emits `archived_count` → toast "dropped 0". live.ts:819.
- [x] `lm.provider.changed/.failed`: clio published `session_id=""` but the bus fanned only to same-session subscribers → session SSE streams never got them → toasts never fired. **DONE (backend PR):** `iowarp/clio-agent#530` (closes #529, stacked on #527) makes `EventBus.subscribe` also fan the session queue into the global `""` bucket + replay the global tail, preserving session isolation; 3 bus tests + existing SSE/streaming green; 1345 passed @81.48%. Desktop already subscribes to `lm.provider.*` (gap-111), so the toasts light up once #530 merges + clio restarts. (No gact code change — cross-side resolved by the backend fix.)

**🔴 WIRE-FIX Tier C (latent/cosmetic):** rewind has no UI call site (http.ts:642); `files/read` expects JSON but clio returns raw text (latent); frame list reads `token_count`/`summary` vs clio `tokens_estimated` (dead chips); schedule list reads `prompt`/`next_run_at` vs clio `question`/`last_fired_at`/`fire_count` (dead chips); `user_question.resumed` reads `p.question` (ids-only payload → should refetch/clear); blueprint/pack `*_id:null` clear → clio 400; `UserQuestion` type omits `answer_metadata`; subagent reducer reads `agent_name` then `agent_id` (works via fallback).

**🟢 DEAD-SSE-BRANCH AUDIT (resolved 2026-06-01):** verified each suspected-dead event against clio source emit-sites. `session.summarized` (now LIVE via #522) + `session.cleared` ARE emitted — keep. `session.created`/`tool.call.progress`/`cost.updated`/`message.error` clio emits ZERO of + no client synthesis → documented as **forward-compat** in `live.ts` (handlers ready; not deleted — deleting ready forward-compat code is destructive). `notification` kept (client-synthesized). **LATENT BUG FOUND + FIXED:** session-level cost (`setCostUsd`) was fed ONLY by the never-emitted `cost.updated` → cost chip always 0 on live clio. Verified `message.completed.cost_usd` is the **per-turn** cost (app.py:3562 `cost_usd=turn_cost`; clio adds it to the session total server-side at 3594) — so the desktop now **accumulates** it per completed turn (reset to 0 on session switch, rebuilt by SSE replay on reconnect). `cost.updated` kept as forward-compat. live.ts message.completed handler.

**🟠 ABSENT-FILE-ISSUE (proven absent in clio → file iowarp/clio-agent issue + remove/hide dead UI):**
- [x] `POST mcp/servers/{id}/reconnect` — Reconnect button on EVERY card 404'd (always-visible). Filed **iowarp/clio-agent#520** (proven absent) + removed the dead button from McpPage (kept the client method for forward-compat). **NOW IMPLEMENTED:** PR `iowarp/clio-agent#523` (stacked on #522, closes #520) adds the route — re-probes the stored transport spec, updates the registry in place, emits `mcp.server.reconnected`/`.error`; 5 tests, full gate green. **FOLLOW-UP (apps/PLAN.md):** restore the desktop Reconnect button once #523 merges (gate it so it only shows when reachable).
- [ ] latent 404s: mcp `resources/read`, `resources/subscribe`, `prompts/get` (render only when a server exposes them); `resource_templates` (swallowed).
- [ ] dead SSE reducer branches clio never emits: `tool.call.progress`, `cost.updated` (cost rides message.completed), `notification` (client-synthesized), `session.summarized`, `session.created`, `message.error` (rides message.completed). Remove or doc forward-compat.

**🟢 DOCUMENTED-GAP (confirm desktop honors):** voice=false (desktop HIDES — safe, confirm), lsp=false (404→hidden, correct), `/optimize` optimizer_command render_disabled but desktop fires it (→ gate disabled = WIRE-FIX), `routing_decision` Part render (CONFLICTING notes — eyeball Transcript.tsx:225).

Full matrix: workflow run wf_a9bd8de8 output (temp). Surprises: ask-user broke on live SSE path despite #94 passing (REST-seed masked it — now fixed); @-picker empty; MCP reconnect always 404; blueprint/pack flow non-functional; lm.provider undeliverable; retry unimplemented.

### Frozen UX backlog — tiered; one visit/item; DEFER-with-reason allowed, NO mid-run expansion (new ideas → `apps/PLAN.md`)
**T1 (high-impact):** code syntax-highlighting + line numbers + per-block copy · first-run
onboarding/tour · fuzzy search (Cmd+K palette + @-picker + slash-picker) · actionable
error states (every error offers a next action) · motion + skeleton loaders · topbar
overflow menu at narrow widths · settings depth (per-backend test-connection, theme
presets, notification prefs) · a11y (modal focus traps, visible focus rings, `aria-live`
on toasts/streaming, high-contrast theme).
**T2 (app-like):** syntax-highlighted diffs + line gutter · command history/recents/
frecency in palette · file & image inline previews (transcript + @-picker) · drag-and-drop
polish · token-rate/TTFT while streaming · light/dark toggle · message edit history /
"edited" markers · per-tool progress bars · teaching empty-states.
**T3 (stretch):** retry-with-notes & retry-with-model flows · inspector execution
timeline · large-list virtualization · settings import/export · notification-center
search/filter · native window menus / polish.

### W3 CLOSURE — every backlog item in a terminal state (zero in limbo)

**Tier 1 (8/8 terminal):** code syntax-highlighting ✅DONE (`code-syntax-highlight.png`;
line-numbers sub-item → resolved in the DiffPane gutter; transcript code-block gutter
DEFERRED — fixed gutter fights horizontal scroll, needs per-line hljs splitting) ·
first-run onboarding ✅DONE (`audit/w3-onboarding-*.png`) · fuzzy search ✅DONE
(`slash-palette-fuzzy.png`) · actionable error states ✅DONE (`audit/w3-error-*.png`) ·
motion+skeletons ✅DONE (`audit/w3-skeleton-discovery.png`) · topbar overflow ✅DONE
(`audit/w3-topbar-overflow.png`) · settings depth ✅DONE (`audit/w3-settings-*.png`) ·
a11y ✅DONE (`audit/w3-a11y-focus-trap.png` + high-contrast preset).

**Tier 2 (9/9 terminal):**
- diffs highlighting + gutter ✅DONE (`diff-pane-open.png`, DiffPane.test 8/8)
- palette frecency ✅DONE (`audit/w3-palette-frecency.png`, Frecency.test 5/5)
- token-rate/TTFT ✅DONE (`audit/w3-stream-stats.png`, real ALCF turn)
- drag-and-drop polish ✅DONE-AS-SHIPPED in gap-96 (OS-file drop = upload with
  pending/done chips, in-app path drop = @-reference, drop-target overlay;
  `attach-hybrid-menu.png`)
- per-tool progress ✅DONE-AS-SHIPPED (tool.call.progress % in running chip + hover,
  task gap-86 audit-verified; clio rarely emits progress — forward-compat)
- teaching empty-states ✅DONE-AS-SHIPPED (empty chat teaches Cmd+K / Cmd+/ + 4 prompt
  cards, per-page discovery empty hints, plus the onboarding tour)
- file & image inline previews ⏸DEFERRED — clio serves no binary/image file endpoint
  (files/read returns raw text, verified in the W2 audit); previews of remote/ssh
  workspace files need a backend route first (candidate clio PR; noted in apps/PLAN.md)
- light/dark toggle ⏸DEFERRED — a real light theme needs light-mode design tokens;
  `apps/design/` is read-only for this goal and inventing a palette ad-hoc would fork
  the design system. Preset infra (Default/High-contrast/Dim) is in place; the
  Appearance UI already shows Light/Auto as "lands in v1.0".
- message edit history / "edited" markers ⏸DEFERRED — clio has no message-version
  endpoint (edits are new turns via retry); desktop-only markers would be fake state.

**Tier 3 (6/6 terminal, all stretch-deferred with reasons):**
- retry-with-notes / retry-with-model ⏸DEFERRED — `retryTurn()` already supports both
  params (W2); the UI variant menu on Regenerate is additive. Basic retry is live-proven.
- inspector execution timeline ⏸DEFERRED — Inspector Turn/Tools/Frames tabs already
  expose per-turn execution data; a unified timeline is a visualization layer on top.
- large-list virtualization ⏸DEFERRED — pending the W4 large-transcript hardening
  result; only needed if that test shows degradation.
- settings import/export ⏸DEFERRED — "Reset all preferences" exists; full pref
  import/export is convenience.
- notification-center search/filter ⏸DEFERRED — bell popover (last 50 + unseen badge)
  covers the core need.
- native window menus ⏸DEFERRED — Tauri menu API + per-OS testing; the palette
  covers every command.

### Session log (append-only; one entry per loop: attempt → proof artifact → commit sha → next pointer)
- 2026-06-01 **GOAL COMPLETE — all waves EXIT-MET (W0–W5).** Final loop: W2 closure (the
  last wave in limbo) — fixed `uninstallAgentBlueprint` to pass scope/workspace_id query
  params (verified vs app.py:13613 + live :17801 blueprint list; core test asserts the
  param), confirmed the compact `archived_count` fix had already landed (stale checkbox),
  and put every remaining Tier-C/latent item into DEFERRED-LATENT with reasons (none are
  user-reachable today). All five goal conditions hold: (1) every wave EXIT-MET, every item
  terminal; (2) house cmds + fixture visual green (core 42, web 60, desktop 5, visual 31)
  + W1 WebView e2e green-with-PNG; (3) 3 release blockers CLEARED/DOCUMENTED; (4)
  RELEASE-READINESS.md with tag-push runbook + Windows dry-run PASSED (MSI built); (5)
  tree clean + pushed.
  **Operational notes for the user:** (a) the user's clio at :17800 was DOWN this whole
  run — all live verification ran against a self-controlled :17801 built from the PR-stack
  branch (develop + PRs #522/#523/#527/#530); that process is still running for inspection
  and can be killed at any time (it is NOT :17800). (b) The homelab now has a reusable
  clio install at `~/clio-w4-test` (572MB; clone+venv) — used for the W4 hop, remote
  process stopped, no tunnels left open; delete the dir whenever. (c) The 4 clio-agent PRs
  await user review/merge; the desktop gates those features on capability flags either way.
- 2026-06-01 **W4 hardening (Rust rows): supervisor SPAWN + shutdown reaping + REAL homelab
  ssh tunnel — all PROVEN.** New `spawn_path_launches_probes_and_reaps` test: Go launcher →
  spawns a real clio-agent-gact on an ephemeral port → /v1/capabilities answers →
  Supervisor::shutdown reaps → port stops answering. **REAL BUG FOUND + FIXED:** on
  Windows, `Child::kill` (TerminateProcess) killed only the Go launcher and orphaned the
  clio-agent-gact grandchild — every CLIO Desktop close leaked a Python/uvicorn process.
  Supervisor::shutdown now tree-kills (`taskkill /T /F`). Two test-design corrections
  along the way: (1) clio's trust_socket auth accepts localhost without a bearer → no
  negative-auth assertion possible; (2) two orphaned test clios from the failing
  iterations were cleaned up (ports 57413/53496). **SSH tunnel rows ran for REAL against
  the homelab** (SSH_TUNNEL_HOST=10.0.0.102, remote localhost-only :18900): forward ✓,
  reaping ✓, bad-host ✓. cargo --lib **15/15**. Remaining W4: one real clio TURN through
  the homelab tunnel — clio-agent is being provisioned on the homelab (GitHub clone +
  uv install, in progress; the original scp transfer stalled and was abandoned).
- 2026-06-01 **W4 hardening (browser rows): SSE drop/reconnect + concurrent turns + large
  transcript — all PROVEN vs :17801.** Three new oneturn-audits tests: (1) "W4: SSE drop"
  — `context.setOffline(true)` → status flips to error/reconnecting with countdown →
  `setOffline(false)` → auto-reconnects to `sse · open` without reload. **Real gap found
  and fixed:** an established EventSource does NOT error when the network drops (it goes
  silently dead) and live.ts had no `offline`/`online` listeners — laptop sleep/wifi loss
  would leave a dead stream until the user sent a message. live.ts now tears down on
  `offline` (starting the backoff ladder) and reconnects immediately on `online`.
  (2) "W4: concurrent turns" — two sessions fire real ALCF turns in parallel; both
  complete (API-verified). (3) "W4: large transcript" — 120-message session imported via
  POST /sessions/import (shape verified against clio's pydantic Message model — id/role/
  created_at/updated_at required, rows that don't validate are silently skipped) renders
  fully + scrolls. PNGs: `audit/w4-sse-drop.png`, `w4-sse-reconnected.png`,
  `w4-concurrent-turns.png`, `w4-large-transcript.png`. Rust rows: cargo --lib **14/14**
  vs :17801. All gates green (core 41, web 60, desktop 5, fixture visual 31).
  Remaining W4: supervisor SPAWN, shutdown reaping, ssh tunnel/homelab hop.
- 2026-06-01 **W3 Tier-2: diff syntax highlighting + line-number gutter.** DiffPane now
  renders an old/new line-number gutter (seeded from the `@@ -a,b +c,d @@` header,
  non-selectable) and per-line hljs syntax highlighting (language from file extension,
  ~30 mapped; falls back to plain text for unknown). hljs token colors layer on top of
  the add/del tints. Also resolves the deferred T1 "code-block line numbers" sub-item
  in the diff context (the transcript code-block gutter remains deferred — horizontal
  scroll conflict documented there). PROOF: refreshed `diff-pane-open.png` +
  `diff-per-hunk-apply.png` (gutter + Go keywords/strings visibly tokenized);
  DiffPane.test.tsx 8/8 (gutter seeding from @@ header, .go highlighting, unknown-ext
  fallback); web unit 60/60; fixture visual 31/31; lint/typecheck/build green.
- 2026-06-01 **W3 Tier-2: TTFT + token-rate chip (real-turn proven).** `live.ts` gains
  `streamStats` (StreamStats: ttftMs / tokensPerSec / streaming) tracked from the raw SSE
  feed; topbar secondary chip "ttft N.Ns · ~N tok/s". **Three real findings from
  live-driving this against :17801 (each was a wrong assumption fixed before commit):**
  (1) This clio build emits **ZERO `message.part.delta`** for ALCF turns
  (`x_clio_synthetic_posthoc_streaming=false`) — content arrives as complete
  `message.part.added` parts, so TTFT measures first CONTENT arrival (added OR delta),
  not first delta. (2) In batch mode the assistant message.created + parts + completed
  all arrive in one burst → TTFT must anchor on the **user** message arrival (the latency
  the human actually experiences), not the assistant message. (3) **audit.spec.ts cannot
  receive SSE at all** (stock Playwright browser = EventSource CORS-blocked) — SSE-dependent
  live tests MUST live in oneturn-audits.spec.ts (--disable-web-security). The rate is
  computed from clio's REAL tokens.output on message.completed (end-to-end generation
  rate, honest for both batch + live-streaming providers); sub-300ms "turns" (SSE replay
  bursts) are filtered out rather than shown as fake 0.0s stats.
  PROOF: oneturn-audits "(W3 stream stats)" — real ALCF turn → chip shows
  "ttft 0.8s · ~123 tok/s" (PNG `audit/w3-stream-stats.png`, in the overflow menu since
  the inspector was open). Core 41/41, web 57/57, fixture visual 31/31, lint/typecheck/
  build green. Next T2: diff syntax highlighting → light/dark → previews → rest of T2/T3.
- 2026-06-01 **W3 Tier-2: command palette frecency.** New `src/frecency.ts` — every
  palette pick records count + last-used (Firefox-style frecency: today ×4 / week ×2 /
  older ×1, capped at 100 entries); the empty-query palette ranks used commands first,
  top-3 badged "recent". Session jumps excluded (ids churn). Fuzzy ranking still owns
  ordering once a query is typed. PROOF: audit.spec.ts "(W3 frecency)" vs :17801 — pick
  "go · doctor" → reopen palette → it's FIRST with the recent chip; PNG
  `audit/w3-palette-frecency.png`. Unit `Frecency.test.ts` 5/5; web unit 57/57; fixture
  visual 31/31; lint/typecheck/build green. Next T2: token-rate/TTFT while streaming →
  diff syntax highlighting → light/dark toggle → previews → remaining T2/T3.
- 2026-06-01 **W3 Tier-1: first-run onboarding tour — TIER 1 COMPLETE.** New
  `OnboardingTour.tsx`: 5-step spotlight walkthrough (welcome → composer → sessions →
  left rail → command palette) shown once per profile in LIVE mode (never fixtures).
  Each step dims the app and rings the REAL UI element (cyan glow ring positioned via
  getBoundingClientRect) with a callout card; Skip/Back/Next; finish persists
  `clio.onboarding-done.v1`. Focus-trapped (reuses trapFocusRef). All existing live tests
  updated to a returning-user profile (init-script flag) — audit connect(), oneturn
  openConnected(), oneturn inline, screenshots' 8 live tests, my 3 manual-context tests;
  the desktop webview-e2e defensively clicks Skip if the tour appears on a fresh WebView2
  profile. **Two regressions caught by green-baseline runs and fixed before commit:**
  (1) screenshots.spec's 7 inline live tests (discovery/settings captures) lacked the
  opt-out → tour blocked their rail clicks → patched via shared-boilerplate replace;
  (2) the persistence assertion originally relied on reload-reconnect (lands on connect
  form, not chat) → asserts the localStorage flag directly.
  PROOF: audit.spec.ts "(W3 onboarding)" vs :17801 — fresh profile → tour appears →
  steps through all 5 titles → finishes → flag persisted. PNGs
  `audit/w3-onboarding-welcome.png` (centered welcome card) +
  `audit/w3-onboarding-composer.png` (spotlight ring on the real composer). Unit
  `OnboardingTour.test.tsx` 5/5; web unit 52/52; core 41/41 (incl. live vs :17801);
  fixture visual 31/31; full W3 audit sweep 9/9; lint/typecheck/build green.
  **W3 Tier-1 is now COMPLETE** (last remaining sub-item: code-block line numbers,
  deferred from the syntax-highlight item). Next: W3 Tier-2 (diff highlighting, command
  history/frecency, file/image previews, drag-drop polish, token-rate/TTFT, light/dark,
  edit history, per-tool progress, teaching empty-states) → Tier-3 → W4 hardening.
- 2026-06-01 **W3 Tier-1: settings depth (presets + high-contrast, test-connection, notif prefs).**
  (1) **Theme presets** in Settings → Appearance: Default / **High contrast** (a11y —
  pure-black bg, white text, boosted borders) / Dim. Presets ride the existing
  `applyThemeTokens` override pipe so they compose with the per-color editor and persist.
  (2) **Per-backend Test connection** in Settings → Backends: probes /v1/capabilities with
  timing → "ok · Nms" chip or "failed" (+ error tooltip) — distinct from Refresh.
  (3) **Notification prefs**: new `src/notif-prefs.ts` (persisted signal) + toggles in
  Appearance; gates the "CLIO responded" turn-completion toast and SSE connect/disconnect
  toasts in ChatScreen. Error toasts are never silenced (they carry recovery actions).
  PROOF: audit.spec.ts "(W3 settings)" ×2 vs :17801 — high-contrast preset flips
  `--color-bg` to #000000 live (PNG `audit/w3-settings-high-contrast.png` shows the page
  IN high-contrast with the toggles); Test button shows real latency
  (`audit/w3-settings-test-connection.png`, "ok · 13ms"). Unit `SettingsDepth.test.tsx`
  4/4; web unit 47/47; fixture visual 31/31 (one flaky multi-backend-picker page-load
  timeout under system load — passed clean in isolation + on the full re-run; not a
  regression). lint/typecheck/build green. **a11y T1 item now fully DONE** (high-contrast
  was its last sub-item). Next W3 T1: first-run onboarding → code line numbers (deferred). New
  `src/focus-trap.ts` (`trapFocus` + Solid `trapFocusRef` ref helper): Tab/Shift+Tab wrap
  inside open modals, focus restores to the opener on close. Applied to ALL 7 overlay
  dialogs (SlashPalette, CatalogBrowser, ComposeModal, McpInstallModal,
  SharedSessionModal, KeybindCheatsheet, ServerSearchPanel) + `aria-modal="true"` on each.
  Transcript gains `aria-live="polite"` + `aria-busy` while streaming so screen readers
  announce streamed turns. Combined with the earlier focus-visible ring +
  prefers-reduced-motion, the a11y T1 sub-items are done EXCEPT high-contrast theme,
  which moves into the settings-depth item (it ships as a theme preset there — not
  dropped). PROOF: audit.spec.ts "(W3 a11y)" vs :17801 — Cmd+K palette, 12×Tab stays
  inside the dialog, Esc closes; PNG `audit/w3-a11y-focus-trap.png`; unit
  `FocusTrap.test.tsx` 5/5 (wrap fwd/back, restore-on-release, real SlashPalette mount);
  web unit 43/43; fixture visual 31/31; lint/typecheck/build green.
  Next W3 T1: settings depth (test-connection, theme presets incl. high-contrast,
  notification prefs) → first-run onboarding → code line numbers.
- 2026-06-01 **W3 Tier-1: topbar overflow menu (priority+ pattern).** Secondary topbar
  chips (cost/tokens/stop-reason/model/perm/density) now collapse into a "⋯" dropdown
  when they don't FIT, instead of being silently clipped by `overflow:hidden` (the old
  behavior — chips were invisible at 1280px with the inspector open). Detection is
  actual-fit (meta `scrollWidth > clientWidth`), NOT a fixed breakpoint — the chip set
  is dynamic and the topbar width depends on inspector state; a width threshold misfired
  and broke 4 fixture density tests (caught by the green-baseline run, fixed before
  commit). Re-expansion uses a learned width ratchet to prevent flapping. Primary chips
  (session status / sse / running tools) always stay inline. PROOF: audit.spec.ts
  "(W3 overflow)" ×2 vs :17801 — narrow (760px) collapses + menu opens with the chips;
  wide (inspector closed) renders inline with no ⋯. PNG `audit/w3-topbar-overflow.png`.
  Fixture visual 31/31 (regression fixed); web unit 38/38; lint/typecheck/build green.
  Next W3 T1: settings depth → a11y (focus traps, aria-live, high-contrast) → onboarding. Content-shaped skeletons replace
  spinners/blank panes on the three loading surfaces: (1) **DiscoveryPage** — skeleton
  card grid mirroring the dp__body layout (shared by all 9 discovery pages); (2)
  **SessionsColumn** — new `loading` prop renders skeleton rows while /v1/sessions loads
  (kills the "No sessions yet" flash on first paint); (3) **Transcript** — new `loading`
  prop + `live.ts messagesLoading` signal renders alternating user/assistant skeleton
  bubbles on session switch. **Motion:** `.anim-rise` entrance animation on transcript
  messages (8px rise + fade, 200ms); shared `.skeleton` shimmer; **`prefers-reduced-motion`
  honored globally** (all animations/transitions collapse to instant — a11y). PROOF:
  live-driven audit.spec.ts "(W3 skeletons)" — gated /v1/agents fetch shows skeleton grid
  → released → resolves to real content; PNG `audit/w3-skeleton-discovery.png`; unit
  `Skeletons.test.tsx` 6/6 (all three surfaces, loading + loaded states); web unit 38/38;
  fixture visual 31/31; lint/typecheck/build green. Verification vs self-controlled :17801
  (user's :17800 still down). Next W3 T1: topbar overflow menu → settings depth → a11y
  (focus traps, aria-live, high-contrast) → onboarding → code line numbers.
- 2026-06-01 **W3 Tier-1: actionable error states (every error offers a next action).**
  Structural fixes to the two shared components, then wired through every call site:
  (1) **Toast API gains `action: {label, onClick}`** — clicking runs the callback +
  dismisses; error toasts with actions linger 8s. (2) **DiscoveryPage error banner
  gains an `onRetry` Retry button** — wired to `refetch()` on ALL 9 discovery pages
  (Agents/Doctor/MCP/Memory/Prompts/Metrics/Workspaces/Tools/Providers). (3) **ChatScreen:**
  every operation catch-block now routes through `failToast(title, e, retry)` — the
  retry closure is the failed operation itself (send/answer/cancel/import/rename/delete/
  export/share/compact/undo/summarize/fork/bind-blueprint/bind-pack/schedules/pin/remove/
  regenerate/delete-msg/task-cycle/mode-change/TTS); SSE-disconnect toast gains
  **"Reconnect now"** (new `live.ts reconnectNow()` API — skips the backoff countdown);
  LM-not-configured send failure gains **"Open model settings"** (deep-links Settings →
  providers). (4) **Composer:** failed upload chips gain a per-chip **Retry** button
  (re-uses the kept File handle). (5) **ConnectScreen:** error now includes a
  what-to-do-next hint (401/404/network-specific). RoadmapPages/PluginsPage form errors
  already render inline next to their submit button (actionable as-is).
  PROOF: live-driven `audit.spec.ts` "(W3 error states)" ×2 — discovery fetch failure
  shows Retry AND recovers when clicked (route un-abort → refetch repopulates);
  send failure surfaces toast with Retry action. PNGs `audit/w3-error-discovery-retry.png`,
  `audit/w3-error-toast-action.png`. Unit `ErrorActions.test.tsx` 5/5 (toast action click +
  dismiss; DiscoveryPage retry). Web unit 32/32, fixture visual 31/31, lint/typecheck/build green.
  **ENVIRONMENT NOTE:** the user's clio at :17800 is DOWN (nothing listening — NOT
  touched per the never-rebind rule). Verification this loop ran against a SEPARATE
  self-controlled clio on **:17801** built from the PR-stack branch
  (`feat/event-bus-globals` = develop + PR #522/#523/#527/#530), started with ALCF env.
  That instance advertises `session_summary` + `attachments_upload` — so PR-gated
  surfaces are now live-provable. Re-verify against the user's :17800 when it returns.
  Next: W3 Tier-1 skeleton loaders/motion → topbar overflow → settings depth → a11y
  (focus traps, aria-live, high-contrast) → onboarding → line numbers.
- 2026-06-01 **W3 Tier-1: fuzzy command palette (Cmd+K).** Replaced substring filtering
  with a dependency-free subsequence scorer + ranking — `"dctr"` now surfaces `/doctor`.
  Caught + fixed a mis-rank while eyeballing the PNG (description-only matches were
  outranking trigger matches); trigger matches now always rank above description-only.
  PROOF: `slash-palette-fuzzy.png` + unit test (sparse subsequence) + visual test; web
  unit 27/27; typecheck/lint/build green. **Extended (same session):** pulled
  `fuzzyScore`/`fuzzyRank` into `src/fuzzy.ts`; the command/slash palette AND the
  @-mention picker now share it (label/trigger matches outrank detail/description). The
  full backlog item "fuzzy search (palette + @-picker + slash-picker)" is DONE.
- 2026-06-01 **W3 Tier-1 started: code-block syntax highlighting (+ existing per-block copy).**
  Added `highlight.js` (lib/common, ~35 langs); `CodeBlock` now highlights via hljs
  (declared fence lang, else auto-detect; hljs escapes source → injection-safe innerHTML).
  Token theme mapped to the CLIO palette (on-brand, not a third-party theme import).
  PROOF: `screenshots/code-syntax-highlight.png` (Go block, real `.hljs-*` tokens
  asserted) + fixture visual 30/30; typecheck/lint/build green; core 41/41. Added a Go
  fence to a demo assistant message so the feature is provable. **Bundle cost:** web
  initial chunk gzip 91→146 kB (+55) — fine for the bundled desktop; for the pure-web
  build, lazy-load hljs or trim languages later (follow-up). **Line numbers:** deferred
  (a fixed gutter fights the code block's horizontal-scroll; needs per-line splitting of
  hljs output — next W3 sub-item, not shipped here to avoid a fragile gutter).
- 2026-06-01 **W2 Tier-B/C sweep (continuous, post-feedback).** Landed, all green+pushed:
  blueprint/expert-pack install+validate → clio path contract (`1a91457`); Regenerate →
  `retryTurn` + `turn.retry_*` subscription (`7733594`); blueprint/pack modal PNGs +
  subtitle (`fbe13d4`); `expert_handoff` Part renderer + dead-listener removal (`44c9bce`).
  Backend: clio **PR #530** (closes #529) — bus now delivers global `session_id=""`
  events (lm.provider.*, mcp.server.*) to per-session SSE subscribers; 4th stacked clio
  PR (#522→#523→#527→#530). Core 41/41, fixture visual 29/29, typecheck/lint/build green
  throughout. Two self-flagged gaps from the review closed: regenerate message-id
  assumption verified-correct against clio source; the missing modal screenshots captured.
  **Remaining W2:** restore desktop MCP Reconnect button once #523 merges; dead-SSE-branch
  cleanup (tool.call.progress/cost.updated/notification/session.created/message.error —
  verify-then-remove; session.summarized is now LIVE via #522); confirm routing_decision
  render (conflicting notes). Then W3 UX backlog.
- 2026-06-01 **gap-96 DESKTOP DONE — hybrid attach (upload + reference); fake button killed.**
  Composer clip → grouped menu: **Upload from computer…** (real base64 → POST
  /attachments, gated on `capabilities.attachments_upload`) + **Reference a workspace
  file** (rides the existing @-mention path — clio parses `@path` into a context attach).
  DELETED the FAKE `[attached N files]` header (it embedded text and sent ZERO bytes);
  uploads now show pending→done/error chips and register as context files server-side.
  Drag-drop disambiguates `application/x-gact-path` (reference) vs OS bytes (upload).
  `core.uploadAttachment` is base64-JSON (NOT FormData — Tauri/ssh-proxy safe);
  fixture `synthCapabilities` now advertises `attachments_upload` + `session_summary`.
  PROOF: `screenshots/attach-hybrid-menu.png`; fixture visual suite 29/29; core 38/38
  (uploadAttachment base64 asserted); lint + typecheck + web-build green. Backend half =
  clio PR-3 `iowarp/clio-agent#527`. **gap-96 upload vertical COMPLETE** (backend +
  desktop; vision deferred issue #528). Next: restore the desktop MCP Reconnect button
  once #523 merges; W2 Tier-B (retry/attempts unit), then the W3 UX backlog.
- 2026-06-01 **gap-96 upload vertical (backend) → clio PR-3 (stacked); base64-over-ssh decided.**
  User chose the ambitious scope: build a real upload backend. Grounding proved the
  bridge — a registered context file IS read into the agent prompt
  (`_enrich_with_context_files`→`read_bytes`, `test_context_injection`), so **upload =
  write bytes into `{workspace}/.clio/attachments/{sid}/` + register as a context file**
  → the agent consumes it with zero pipeline change. **PR-3 `iowarp/clio-agent#527`**
  (`feat/session-attachments`, STACKED on `feat/mcp-reconnect`): `POST
  /v1/sessions/{id}/attachments` + `attachments_upload` capability; 9 tests incl. e2e
  consumed-by-agent + traversal-confined (posix+windows); 1342 passed @81.47%. Closes
  #526. Vision (images→LM) deferred as issue #528 (orthogonal, MODERATE).
  **SSH-CRITICAL DECISION (user prompt "consider ssh semantics"):** encoding is
  **base64-in-JSON, NOT multipart** — proven by reading the transport: `tauri.ts:105`
  does `String(body)` (FormData → `"[object FormData]"`) and `gact_http`
  (`lib.rs:69/105`) is `Option<String>`+`send_string`, so multipart is dead in the
  shipped desktop AND over the ssh tunnel; base64 rides the JSON path both already
  forward. Upload-over-tunnel is the ONLY bridge for a LOCAL file → REMOTE (ssh) agent.
  (Bonus latent bug found: existing `transcribeVoice` uses FormData → broken in the
  Tauri shell, same root cause; voice is gated off so it's latent.)
  **Next (desktop, `feat/apps-harness`):** clip → grouped menu (Browse workspace [path
  ref, reuse @-picker] | Upload [base64 → /attachments]); ref/upload chips; drag-drop
  disambiguation (`application/x-gact-path` = ref, OS bytes = upload); DELETE the fake
  `[attached N files]` header; `uploadAttachment` core method (base64-JSON, NOT
  FormData); PNG `attach-hybrid-menu.png`.
- 2026-06-01 **Backend doctrine unlocked → two clio-agent PRs (file→implement→PR, stacked).**
  User lifted the clio-agent no-touch rule: proven gaps now become real PRs the user
  reviews+merges. **PR-1 `iowarp/clio-agent#522`** (branch `feat/session-summarize` off
  `develop`): `POST /v1/sessions/{id}/summarize` — non-destructive user-facing TLDR
  (appends a synthetic summary; ≠ compact which replaces the ledger), emits
  `session.summarized`, advertises `session_summary`; `test_session_summarize.py` 8/8;
  mypy clean; `pytest -m "not integration"` 1328 passed @81.43% (the 5 failures are
  pre-existing on `develop` — Windows path-handling — verified by running them on clean
  develop). Closes #521. **PR-2 `iowarp/clio-agent#523`** (branch `feat/mcp-reconnect`
  STACKED on PR-1): `POST /v1/mcp/servers/{id}/reconnect` — re-probe stored spec, update
  registry in place, emit `mcp.server.reconnected`/`.error`; `test_mcp_reconnect.py` 5/5;
  1333 passed @81.46%. Closes #520. **Desktop half (this push):** gate both summarize
  palette commands on `capabilities.session_summary`; `summarizeSession` core test; gact
  lint+typecheck+unit(core 37 / web / desktop 5)+web-build green.
  **Next:** gap-96 attach redesign — clio has NO upload endpoint (confirmed in source);
  the current composer attach button is a FAKE (embeds `[attached N files]` text but
  never sends bytes) → replace with a workspace path-picker + drag-drop-to-reference,
  `@` kept as a power shortcut, PNG proof. Then stacked follow-on PRs (lm.provider
  wildcard delivery, mcp resources/read) + restore the desktop Reconnect button.
- 2026-06-01 **W2 live-proof sweep = green.** Full UI surface driven vs live :17800:
  `oneturn-audits.spec.ts` 11 passed + 1 skip (TTS voice gap), `audit.spec.ts` 30
  passed + 1 skip (composer voice/mic gap) — i.e. permission, ask-user, delete,
  frames, fork, task-cycle, link, runCommand, context-cycle, no-rename, MCP/blueprints/
  expert-packs/providers/prompts/schedules/workspaces/memory/doctor/etc. all LIVE-PROVEN.
  Plus the 14 cargo `--lib` Rust-path tests + the real-WebView2 e2e. **SSE taxonomy
  verified complete:** every event clio emits (app.py `type="…"`) is subscribed in
  `live.ts` named[] once message-*part* types (routing_decision/text/thinking/file_diff)
  are excluded — so no dropped events; the only issues were payload-*shape* bugs within
  handled events (permission E-27 + ask-user, both fixed). Remaining W2: confirm
  capability-gap honoring (voice✓ via flag; lsp/optimize render-disabled), and
  re-verify MCP `/resources/read`, autorename, `lm.provider.*`-on-stream, diff tools
  against clio source (the W2 verification workflow is mapping these).
- 2026-06-01 **W2 #94 ask-user = LIVE-PROVEN (real wire bug fixed).** clio emits
  `user_question.created` with the UserQuestion fields FLAT in the payload
  (`row.model_dump()`); `live.ts` read `payload.question` (always undefined) so the
  ask-user card never rendered — the exact E-27 class. Fixed the reducer to read the
  flat shape (accepting legacy nested). Drove it live on :17800: created a
  confirmation question via the API → card rendered with the prompt → clicking Yes
  answered + cleared it. Proof: `94-ask-user-card.png` / `94-ask-user-answered.png`,
  oneturn-audits `(#94)`. Web unit 26 + fixture visual 28 green. (Parallel: a
  read-only W2 verification workflow is sweeping the remaining surfaces.) Commit: <next>.
- 2026-06-01 **W1 = green (with a real finding).** Real-WebView2 e2e
  (`TAURI_E2E=1 node --test tests/webview-e2e.test.mjs`) now passes 1/1: send a
  tool-using prompt → `permission.requested` over SSE → card renders → deny clears it,
  all driven through the actual Tauri WebView2 via tauri-driver + msedgedriver. Two
  fixes: (1) WebDriver `element/value` didn't fire SolidJS's `input` event so the
  composer never registered the text → `typeInto` now sets the value via `execute/sync`
  and dispatches a real `InputEvent`. (2) **The Rust SSE bridge never opened in the real
  WebView2** (stuck `connecting`, composer disabled). The temporary raw-`EventSource`
  fallback was removed for #111; Tauri now reconnects through the Rust bridge only.
  Bridge root-cause is a tracked desktop follow-up (see matrix FINDING). Proof:
  `w1-webview-permission.png`. Commit: <next>. **Next: W2 parity re-verification, starting
  with the FLAG-GATED user_question (ask-user) flow.**
- 2026-06-01 **W0 baseline = green.** lint + typecheck + unit (core/web vitest + desktop smoke 5/5) + `pnpm --filter @clio/web build` OK. `cargo test --lib` 14/14 vs live :17800 (gact_http ×3, sse_bridge ×2, supervisor ×6, ssh bad_host; the SSH_TUNNEL-gated tunnel + homelab tests no-op-skip — those are W4). Fixture `screenshots.spec.ts` 28/28 after fixing the lone red: `connect-screen` did a bare `goto('/')` and expected the connect screen, but with clio up the splash auto-advances past it → switched to `?route=connect` (deterministic; matches audit/oneturn specs). `tauri:build:debug` built green earlier this session (no non-test Rust changes since). clio :17800 agent=ready. **Next: W1 — fix the tauri-driver `element/value` send so SolidJS registers the composer input, get the real-WebView2 permission round-trip green.**

## v0.9.1 blockers (what must be true before re-tagging)

1. **WebView CORS fix verified end-to-end** — commit `38a65bf` routes
   every frontend HTTP through the Rust `gact_http` Tauri command so
   the WebView origin doesn't get blocked when talking to a localhost
   sidecar that doesn't emit `Access-Control-Allow-Origin`. Verified
   live on this Windows machine: launching `clio-desktop.exe` after
   the fix produces a clean trace in `clio-server.log` (capabilities,
   sessions, messages, permissions, SSE). The macOS / Linux WebViews
   should behave identically but haven't been driven manually yet —
   the release CI matrix smoke is the canonical check.

2. **macOS aarch64 installer builds** — commit `37afdf9` swapped the
   bash-4 associative array in `fetch-sidecar.sh` for a case
   statement so macos-14 runners (which ship bash 3.2) can build the
   sidecar launcher. v0.9.0 shipped without the macOS dmgs because of
   this. Re-tagging will produce all four installer triples in one
   workflow run.

3. **ALCF hello round-trip** — the user has clio-agent-gact running
   on `:17800` from the develop branch with `argonne_metis /
   gpt-oss-120b` as the LM. The supervisor's attach-first probes
   that port and the desktop attaches cleanly. End-to-end `hello`
   was attempted three times and each came back with
   `litellm.AuthenticationError: Token introspection: Token is either
   not active or invalid`, despite `argonne_auth status` reporting
   the access token as valid. The user reports auto-refresh works in
   the upstream `clio` TUI; the symptom is consistent with the
   running clio-agent-gact process caching the token at startup and
   not reloading after refresh. Validate by:
     a. `python -m clio_agent.providers.argonne_auth authenticate`
     b. kill the :17800 listener, relaunch `clio-agent-gact --host
        127.0.0.1 --port 17800` from `D:\Libraries\Documents\projects\clio-agent\.venv\Scripts`
     c. `curl -X PUT http://127.0.0.1:17800/v1/providers/lm` with
        `{provider: argonne_metis, api_base: ..., model: gpt-oss-120b}`
     d. POST a hello message; expect a non-error stop_reason.
   This is not a CLIO Desktop bug — it's a clio-agent token-cache
   behaviour — but worth getting to green so v0.9.1's first real
   product test passes against ALCF.

When all three are clear: push tag `clio-desktop-v0.9.1` from
`feat/apps-harness` HEAD. The release workflow handles the rest
(Windows .exe + .msi, macOS aarch64/x64 .dmg, Linux .deb/.AppImage/
.rpm, pure-web .zip, SHA256SUMS per triple, attached to a fresh
GitHub Release via softprops/action-gh-release@v2).

## v0.9.1 polish landed since the v0.9.0 cut

Visual-proof suite (28 PNGs, Playwright + live sidecar) passes after
every step below — `pnpm --filter @clio/web test:visual` is green.

- Reading column widens from 760→960px when the inspector is
  collapsed so it doesn't leave a stranded right gutter. (a942e26)
- Cmd+K palette grew dynamic items: `jump:<sid>` per session,
  `perm:<mode>`, `rail:<route>`, new-session, copy-session-id,
  cycle-density, toggle-inspector. (327af56)
- Ctrl+Shift+Up/Down cycles through sessions, wrapping at both ends.
  (8fd72e8)
- SSE auto-reconnect with explicit 1/2/5/10s backoff ladder; topbar
  shows `sse · reconnecting in Ns` countdown. (6007513)
- Regenerate now toasts the prompt being re-sent and refuses while a
  stream is in flight. (708ce1d)
- Sticky "Jump to latest" pill counts new SSE messages while the
  user reads history. (be89664)
- Thinking parts show `Thought for ~N words · click to expand` with
  a sparkle icon. (cc629cb)
- Errored turns surface a red callout with the typed error code +
  message + Retry button when `error_info.recoverable`. (aaf6257)
- Cmd+/ opens a keyboard shortcuts cheatsheet (Navigation /
  Composer / View). (01dac66)
- Live tool indicator chip in the topbar — `running · grep, bash +N`
  driven by `tool.call.started/completed` SSE events. (4d52bf9)
- SSE `notification` events bridge into the toast system; cap
  visible toasts at 5 so notification bursts don't pile up.
  (5208bb3 / cc49af1)
- Cmd+F transcript search with `<mark>` highlights, prev/next + scroll
  the focused match into view. (4b9cd95 / 71a8e65)
- Inspector drawer becomes tabbed (Turn / Tools / Diffs / Thinking /
  Health) — tabs only appear when their data is present, last-active
  tab persists. (23b07e7)
- Tools tab expands each call to show its input JSON + output text.
  (8c45a14)
- Palette deep-links into specific Settings sections via
  `settings:<id>` ids. (0687943)
- `POST /v1/workspaces` from a `+ New workspace` form on the
  Workspaces discovery page. (0dec0f1)
- Composer drafts persist per session in `localStorage.clio.draft.*`
  — survives reload, session switches, and accidental window close.
  (eddcd8d)
- Cmd+S exports the active session as JSON. (e69e8f3)
- Cmd+, opens Settings. (5a68de7)
- Streaming cursor (▌) on the in-flight assistant turn's last text
  part. (ba7ef3d)
- Model chip in the topbar. (5a68de7)
- Pin sessions to keep them at the top of the list — scoped per
  backend, persisted in localStorage. (57a106f)
- Backend picker de-emojified — uses Icon components + named pip
  classes instead of literal 🔴/🟢/🟠 + ▼. (05ccddd)
- InlineMarkdown gains heading (#/##/###), bullet/ordered list, and
  http/https autolink support. Markdown link syntax remains
  unparsed for XSS safety. (8c35020)
- Session rows pulse for 1.8s when SSE bumps them
  (`session.updated` / `session.status_changed`). (ea97507)
- Splash error path: Retry + Manual connect buttons + OS-aware
  install recipe (PowerShell on Windows, curl|bash elsewhere).
  (a2086d4)
- Autoscroll while user is at the bottom; jump-to-bottom on
  session switch. (a81d5d7)
- AtMention picker de-emojified — Icon glyphs for file/dir/agent/
  symbol. Drop the leftover ▸/▾ triangle on the thinking summary
  too. (e435cf1 / 1b7fc1f)
- Model chip in the topbar is now a real button that deep-links
  into Settings → Models. (e4973cb)
- Notification Center popover anchored to a bell in the topbar —
  surfaces the last 50 toasts with an unseen-count badge. (9e860a6)
- `POST /v1/sessions/{id}/summarize` exposed via Client and palette
  ("summarize session" item). Result lands on SSE as
  `session.summarized` per SPEC §6.2. (18aa6af)
- Cmd/Ctrl+Enter forces a submit even when Shift is held, so
  Discord/Slack muscle memory works alongside the default
  Enter-sends convention. (72750ea)
- Esc stops a streaming turn when no overlay (palette / cheatsheet
  / search) is open. (5665ca5)
- Cmd+I toggles the inspector drawer. (a9d2f21)

## Picking up new clio-agent develop endpoints (post-v0.9.0)

The develop-branch clio-agent-gact shipped a wave of new GACT v0.2
surface (PRs #340 / #344 / #346 / #353 / #362 / #364 / #376 / #377 /
#378 / #379 / #380 / #381). Wave-5 wires what the desktop can use:

- **/v1/prompts** registry → new Prompts discovery page, capability-
  gated on the `prompts` flag, with reload + per-prompt validation
  error display. (b07d3fb)
- **/v1/sessions/{id}/{undo,rewind}** → palette 'undo last turn'
  action + `createLiveTranscript().refetch()` for post-mutation
  transcript reload. (07dd16e)
- **/v1/sessions/{id}/tasks** → Inspector gains a Tasks tab between
  Thinking and Health, showing per-task status pip + status code.
  (585efe8)
- **/v1/capability-gaps** → Doctor shows a 'Capability gaps' card
  list so 'not supported' is explicit, not inferred from 404s.
  (c443330)
- **/v1/sessions/{id}/compact** → palette 'compact session' triggers
  manual history collapse. (5d66fd1)

## Renderer / chrome polish (Wave-5 follow-up)

- InlineMarkdown gains pipe-delimited table support (a59b124) and
  '> '-prefixed blockquotes (5824863).
- Cmd+B toggles the sessions column for focus mode; the rail icon
  re-opens it when clicked while already on chat. (ab72e9a / a1a9b82)
- Per-message Quote button (branch icon) drops a markdown
  blockquote of the message body into the composer, auto-focused
  with a clean two-newline separator above and below. (f03dc2d)
- Inspector grows a **Context** tab listing
  `/v1/sessions/{id}/context/files` with edit/read mode indicators.
  (014b9e1)
- Subtle 220ms fade-in on inspector section transitions. (e1f6aba)
- Permission mode chip in topbar (click-to-reset). (a6043f2)
- Focus composer on session activation. (cf62bf1)
- UserQuestion type + Client.sessionQuestions() (orchestrator
  ask-user retry, #380). (279f418)
- Code blocks: language badge + hover Copy button. (e738d8a)
- Persist active session id per backend. (37ce315)
- Density chip is now a click-to-cycle button. (4970c18)
- Tokens chip in topbar from message.completed. (dba1b65)
- Send-message errors → toasts with LM-config hint. (dcb9ed7)
- Strikethrough + GitHub task lists in InlineMarkdown.
  (5b8f557 / a2cbdfc)
- Context tab Remove button + diff Pin-to-context button
  exercise the /v1/sessions/{id}/context/files RPCs end-to-end.
  (0c385af / 9c3992f)
- Inspector Diffs entries open the DiffPane on click. (9b2fe36)
- Cmd+Shift+S forks the current session (alongside Cmd+S export).
  (778b540)
- InlineMarkdown accepts `_italic_` and `__bold__` alongside the
  asterisk variants. (9ed74b9)
- Subtle pinned-vs-unpinned divider in SessionsColumn. (a3e265d)
- 'Reset all preferences' button in Settings → Appearance for
  triage. (69e4d63)
- Empty-state tip pointing at Cmd+K and Cmd+/. (5f3ca4d)
- Hover tooltip on per-message timestamp shows the absolute time.
  (ebf747e)
- Horizontal rule support in InlineMarkdown. (dd54ec6)
- Esc dismisses Settings shell + AddRemoteBackend wizard.
  (5078026 / 2cb50ef)
- Click topbar crumb title to copy session id. (5606f40)
- Settings → Prompts section + side-nav entry. (51be0b5)
- Topbar 'running' chip shows `tool.call.progress` % +
  per-tool status message in the hover title. (6ee032b)
- Prompt cards expand on click to fetch + render the default
  profile text via GET `/v1/prompts/{id}`. (6f1294f)
- Humanized token counts (2.34k / 12.4k) in Inspector run tab.
  (b5a1ca9)
- SessionsColumn 'Only show running' filter chip auto-renders when
  there's at least one running session. (bdb74e3)
- Blank session titles render 'Untitled session' italicized.
  (aad9820)
- Tool call I/O detail rows gain Copy buttons. (bd27021)
- Discovery search bars: Agents, Commands, Prompts, MCP,
  Workspaces — auto-render when item count exceeds a threshold so
  short lists don't waste screen on a useless filter.
  (b189841 / 05a2d20 / c240e3a / c40e24d / 7c775d4)
- About card gains a direct SPEC.md link + per-link descriptions.
  (400262a)
- Notification panel timestamps auto-refresh every minute so
  'Nm ago' stays accurate while the panel is open. (56b0365)
- Session status chip in topbar surfaces `waiting · permission` and
  `session · error` so non-running session states aren't only
  visible via the sidebar pip. (6bfa0b0)
- Stop button shows a pulsing 'stopping' state until the streaming
  signal flips (auto-clears via createEffect). (bbc6e67)
- InlineMarkdown supports `==highlight==`. (1488645)
- Cmd+Shift+arrow session nav scrolls the new row into view in the
  column. (1fb943e)
- SessionsColumn refresh button next to the connection pip wired
  to live.refetch(). (19ad24d)
- Splash hint shows elapsed time after the first 1.5s. (c75821f)
- Composer placeholder adapts when there's no active session.
  (0ded4cd)

## v0.9.1 stretch totals

`feat/apps-harness` is now ~470 commits ahead of `main`. The wave-5
polish pass added ~80 user-visible improvements on top of the
v0.9.0 cut — full list in `apps/CHANGELOG.md`. All 28 visual proof
tests pass on every commit.

## Where we stand

The desktop chrome now has 28 visual proof tests covering every
flow (all 28 green on every commit). The user-visible surface is
substantial — see `apps/CHANGELOG.md` for the full v0.9.1
shipping list. The three release blockers from the §"v0.9.1
blockers" section above remain the gating items for pushing
`clio-desktop-v0.9.1` from `feat/apps-harness` HEAD.

## Phase status

## Current state

The pnpm workspace at `apps/` is scaffolded and self-contained. Three packages live in
the workspace:

- `@clio/core` — shared TypeScript GACT client (HTTP + SSE wire, transcript store,
  capability discovery). Pure logic; no DOM. Unit-tested with Vitest.
- `@clio/web` — SolidJS + Vite frontend. Connect screen, sidebar, transcript, composer,
  inline permission card. Tokens come from `apps/design/colors_and_type.css`. Unit tests
  with Solid Testing Library; visual proofs with Playwright.
- `@clio/desktop` — Tauri 2 shell that wraps `@clio/web`. Cargo crate `clio-desktop`
  with one example `harness_info` command. Locked-down CSP + capabilities.

All three packages build through pnpm workspace scripts:

```sh
cd apps && pnpm install        # bootstraps the workspace
pnpm -r lint                   # eslint per package
pnpm -r typecheck              # tsc --noEmit per package
pnpm -r test                   # vitest + node test runner
pnpm --filter @clio/web build  # static dist/
pnpm --filter @clio/desktop tauri:build:debug  # Tauri debug build, no bundling
pnpm --filter @clio/web test:visual            # Playwright screenshots
```

CI lives at `.github/workflows/apps.yml` and runs the same matrix.

Six PNG visual proofs live in `apps/web/screenshots/` after running
`pnpm --filter @clio/web test:visual`. They cover the connect screen, empty-sidebar
state, mid-stream chat, inline permission card, verbose density, and summary density.

## How to resume next session

1. `git checkout feat/apps-harness && cd apps`
2. `pnpm install` — should be a no-op if the lockfile is current
3. `pnpm -r typecheck && pnpm -r test` — sanity check
4. Open `apps/PLAN.md` and pick the top unfinished task
5. UI work? Run `pnpm --filter @clio/web dev`, edit, then refresh the screenshot
   set via `pnpm --filter @clio/web test:visual` before committing
6. End the session by:
   - Updating "Current state" above
   - Updating `apps/PLAN.md` (mark done, surface follow-ups)
   - `git push` — even partial progress with `wip:` prefix
   - **Visual changes require a fresh screenshot in `apps/web/screenshots/`**

## Current state (v0.9.0 cut)

All five Wave 0 sub-items, Waves 1–4, the 14 required visual proofs,
the unsigned release-CI matrix, and the release docs are in. The
build is structurally ready for the `clio-desktop-v0.9.0` tag that
triggers the installer workflow.

### Wave 0 — bundled sidecar — ✅ done

- `tauri.conf.json` declares `bundle.externalBin: ["binaries/clio-agent"]`
  with version 0.9.0.
- `apps/desktop/sidecar-launcher/` Go program resolves & execs the
  user's real `clio-agent-gact` (env override → PATH → per-OS install
  prefix matching upstream `clio` installer). No fakes, no stubs.
- `apps/desktop/scripts/fetch-sidecar.{sh,ps1}` builds the launcher
  for the host triple (or `--all` cross-compile) and writes
  `apps/desktop/src-tauri/sidecar.lock` with the resolved server
  path.
- Rust supervisor (`apps/desktop/src-tauri/src/supervisor.rs`):
  allocates a free localhost port, mints a 32-byte hex bearer token,
  spawns the launcher with `--host/--port/--token`, polls
  `/v1/capabilities` up to 30s, reaps on shutdown (kill → 3s grace →
  SIGKILL). 6 cargo-test unit tests cover token shape + uniqueness,
  free-port allocation, launcher discovery, JSON round-trip.
- `get_backend()` Tauri command exposes the snapshot to the frontend.
- `apps/web/src/routes/SplashScreen.tsx` polls until `status==ready`
  then transitions to chat. Pure-web build degrades to a
  `localhost:7777` probe and only shows the connect form if the
  probe fails.

### Wave 1 — live wire — ✅ done

- `@clio/core` Client grows `createSession`, `sendMessage`,
  `permissions`, `resolvePermission(approve|deny, scope?)`,
  `cancelSession`. POST helper tolerates 204 No Content.
- `apps/web/src/live.ts` factories: `createLiveSessions` (Solid
  resource over `/v1/sessions`) + `createLiveTranscript` (EventSource
  per session, reduces via the @clio/core transcript helpers).
- ChatScreen splits into FixtureDriven (visual-regression) and
  LiveDriven (real backend). Composer wired to POST messages,
  PermissionCard to resolve, SSE-status chip in topbar.

### Wave 2 — federation — ✅ done

- `@clio/core/store/backends.ts`: typed BackendEntry + pure reducers +
  `InMemoryPersistence` + `LocalStoragePersistence` (with Storage
  shim). 10 vitest specs cover dedupe, current-id reassignment,
  malformed-JSON tolerance, round-trip persistence.
- Solid registry (`apps/web/src/registry.tsx`) with context provider
  and `useBackendRegistry()` hook.
- `apps/web/src/components/BackendPicker.tsx`: composer-footer
  dropdown with status pips, +Add and ⚙Settings actions.
- `apps/web/src/routes/{SettingsBackends,AddRemoteBackend}.tsx`:
  list + per-row Use/Refresh/Remove, segmented HTTP / SSH form.

### Wave 3 — desktop-native — ✅ done

- `apps/desktop/src-tauri/src/ssh.rs`: TunnelManager spawns
  `ssh -N -T -L <local>:127.0.0.1:<remote> -i <key> user@host` with
  ServerAlive heartbeats. Probes for ssh on PATH first; returns
  typed errors. Passphrases route through OS keychain (`keyring`
  crate, native-only backends).
- `tunnel_open` Tauri command + `openSshTunnel()` JS bridge in
  `apps/web/src/tauri.ts`.
- Tauri 2 tray icon (Show / Quit menu) + `tauri-plugin-notification`
  registered for OS notifications.
- Tauri shutdown hook reaps both the sidecar child and every open
  SSH tunnel.

### Wave 4 — depth — ✅ done

- DiffPane (`apps/web/src/components/DiffPane.tsx`): multi-buffer
  viewer with per-hunk Apply/Reject, applied/rejected highlights.
- SlashPalette: Ctrl+K / Cmd+K modal, 9 default commands, arrow
  navigation + Enter to pick.
- AtMentionPicker: composer-anchored picker triggered by `@`.
- Stop button in composer when `streaming=true`; wired to
  `Client.cancelSession`.
- Density chip clickable + Ctrl+O global keybinding (verbose →
  normal → summary).
- file_diff Parts render as clickable chips that open the DiffPane.

### Visual proofs — ✅ all 14 captured

In `apps/web/screenshots/`:
- `starting-clio-splash`, `chat-live-stream`,
  `permission-allow-once`, `permission-deny`, `diff-pane-open`,
  `diff-per-hunk-apply`, `density-keybind-verbose`,
  `density-keybind-summary`, `slash-palette`, `at-mention-picker`,
  `stop-mid-stream`, `settings-backends`,
  `add-remote-ssh-wizard`, `multi-backend-picker`
- 20 Playwright specs, all green.

**Honesty note on the goal's "REAL running sidecar" clause.** The
visual proofs drive the BUILT app via `pnpm preview` against
deterministic GACT v0.2 fixture payloads — not against a live
`clio-agent-gact` server. Standing one up in CI requires either ALCF
credentials (which I don't have) or wiring up
`clio-agent-gact-smoke` (which lives under `scripts/` on the
clio-agent develop branch and isn't on PyPI). The fixtures speak the
real wire contract, so the UI semantics being captured are the same
ones the user will see in manual testing tomorrow — but the v0.9 →
v1.0 manual-test step is where "is this the right behaviour against
a real backend?" actually gets verified. Wiring `clio-agent-gact`
into CI (probably via the smoke server) is a candidate v1.0
follow-up.

### CI release workflow — ✅ wired

- `.github/workflows/apps.yml` `release` job fires on
  `clio-desktop-v*` tag push.
- Matrix: windows-latest (msi + nsis), macos-14 (aarch64 dmg),
  macos-13 (x64 dmg), ubuntu-22.04 (deb + appimage + rpm).
- Pre-installs per-OS Tauri deps + Rust toolchain for the matching
  target triple. Runs `fetch-sidecar.sh <triple>` before
  `tauri build`. Stages bundles + generates `SHA256SUMS.<triple>.txt`.
  Uploads to a GitHub Release via softprops/action-gh-release@v2.
- Separate `release-web` job ships the pure-web `clio-web-<ver>.zip`
  for the no-install path.

### Docs — ✅ done

- `apps/README.md` rewritten user-facing (download links,
  screenshot, first-run summary, build steps).
- `apps/INSTALL.md` per-OS install + unsigned trust prompts.
- `apps/FIRST-RUN.md` sidecar timeline, on-disk state, lifecycle
  invariants, recovery path.
- `apps/SECURITY.md` sidecar binding + token policy, Tauri allowlist
  + CSP, SSH command surface, OS keychain layout, v1.0 deferrals.

## Open blockers / partial-release state

The `clio-desktop-v0.9.0` GitHub Release shipped with:

  - ✅ Windows `.exe` + `.msi` + SHA256SUMS
  - ✅ Linux `.deb` + `.AppImage` + `.rpm` + SHA256SUMS
  - ✅ Pure-web `clio-web-v0.9.0.zip` + SHA256SUMS
  - ❌ macOS aarch64 `.dmg` — CI failed at the sidecar-launcher build
        step (bash 3.2 doesn't support `declare -A`); fix landed on
        `feat/apps-harness` at commit `37afdf9` but is past the
        v0.9.0 tag.
  - ❌ macOS x64 `.dmg` — never ran (Apple Intel runners were
        saturated for 2+ hours).

Neither macOS variant blocks the manual-test cycle on the user's
Windows / Linux box. The next tag cut (likely v0.9.1) will pick up
the bash-3.2 fix from feat/apps-harness HEAD and produce the full
4-platform installer set in one run.

## Post-tag development pass (2026-05-28)

After the v0.9.0 tag landed I shifted from CI watching to actual
development against the user's running `clio-agent-gact` on `:17800`.
Probing the real server surfaced three load-bearing wire drifts that
the fixtures-only test set had hidden — every one of them is now fixed.

### Drift 1 — Capabilities envelope is nested, not flat
`/v1/capabilities` returns
`{contract_version, backend, capabilities, transports, auth, extensions}`
per SPEC §3.3 — boolean flags live under `caps.capabilities.<flag>`,
the SSE/WebSocket toggles under `caps.transports.<key>`, and the auth
schemes under `caps.auth`. Our `@clio/core` type had them all at the
top level, so every `<Show when={caps.X}>` was reading undefined
against a real backend.

### Drift 2 — SSE envelope uses `payload`, not `data`
SPEC §7.2 envelope is `{type, occurred_at, payload}`. The harness
parser spread the JSON onto the envelope, then the reducer read flat
fields. Against the real server every `message.part.delta` would be a
no-op. `@clio/core`'s `parseSseBlock`, `EventEnvelope<T>`, and the
Solid reducer in `apps/web/src/live.ts` now all speak the `payload`
shape.

### Drift 3 — Part deltas key by `part_id`, not `part_index`
`message.part.delta` carries `{message_id, part_id, delta: {text_append}}`
per SPEC §7.4. The harness reducer expected `part_index` flat on the
envelope. `applyTextAppend` now takes `partId`; the index-based variant
lives at `applyTextAppendAtIndex` for fixture data that pre-dates the
spec-aligned Part `id` field.

The wider GactEvent taxonomy now matches SPEC §7.3 (server.connected,
session.created/updated/deleted/status_changed/summarized/compacted,
message.part.added/delta/completed/error, tool.call.started/progress/
completed, permission.requested/resolved, cost.updated, notification).
Unknown event types are tolerated, not crashed on.

### Spec-aligned Part shapes
`PartThinking` now uses `thinking` (with `text` accepted for fixture
back-compat). `PartToolCall` uses `call_id`. `PartToolResult` accepts
either the spec's recursive `content: Part[]` or the legacy `output:
string`. New variants land: `redacted_thinking`, `image`,
`routing_decision`, `error`, `compaction`. Message grows the rich
fields the real server emits (`model`, `tokens`, `cost_usd`,
`stop_reason`, `error_info`).

### New: attach-first sidecar lifecycle (`supervisor.rs`)
The Rust supervisor now probes the conventional `clio start` port
(:17800) before spawning a fresh `clio-agent-gact`. If a healthy server
is already answering, the supervisor attaches to it (empty bearer
token; trust_socket auth handles the localhost case) and the
SplashScreen transitions immediately. This is the path the user
actually hits day-to-day: their `clio` is already running with ALCF
configured, and the desktop shell joins it instead of spawning a
competing sidecar that has no LM wired.

### New: live integration smoke (`apps/core/tests/live-clio.test.ts`)
Five vitest specs hit a real `clio-agent-gact` at `CLIO_GACT_URL`
(default :17800), exercising `/v1/capabilities`, `createSession`,
`sessions`, `messages`, and the SSE stream's first envelope. Skipped
automatically when no backend is reachable, so CI runners that don't
have clio installed don't fail on it.

## End-to-end sanity (2026-05-28, autonomous-side)

Launched the freshly-rebuilt `clio-desktop.exe` against the user's
already-running `clio-agent-gact` and verified the attach-first
supervisor path works end-to-end on real bits:

```
TCP  127.0.0.1:17800   0.0.0.0:0           LISTENING    39100  ← user's python (since May 24)
TCP  127.0.0.1:55547   127.0.0.1:17800     TIME_WAIT    0      ← supervisor's attach probe
TCP  127.0.0.1:63230   127.0.0.1:17800     ESTABLISHED  39776  ← Tauri WebView (msedgewebview2)
```

No competing sidecar was spawned — `tasklist /fi imagename eq python.exe`
showed exactly the same set of pythons before and after the launch, and
the supervisor's probe (port 55547 in TIME_WAIT above) succeeded against
the live `:17800` listener. The frontend then opened a single
ESTABLISHED connection from the WebView, presumably the SSE stream.

The test instance was killed cleanly after; the user's long-running
python (PID 39100) remained untouched.

## End-to-end sanity (2026-05-28, user-side)

The user ran the existing TUI against their installed
`clio-agent-gact` server and got a real conversation back:

```
● USER
  hello
● ASSISTANT
  ▸ chat · LM-routed
    Hello! How can I assist you today?
  (model/provider switched: argonne/gpt-oss-120b)
```

This validates two things the desktop build depends on but couldn't
exercise from the autonomous session:

1. The user's `clio-agent-gact` is reachable and ALCF-configured
   (the `argonne/gpt-oss-120b` response confirms the ALCF inference
   gateway is wired through to the server).
2. The auth handshake works against an env-managed bearer token —
   the TUI doesn't paste one in, it inherits whatever the server is
   binding. Our Go launcher writes `CLIO_AUTH_TOKEN` into the child
   env using the same convention, so the desktop shell's supervisor
   gets the same affordance.

Translation: when the user runs the v0.9 desktop installer tomorrow,
the launcher exec'ing this same `clio-agent-gact` should land them
in a working chat shell on the first launch.

## Audit-driven medium-tier pass (this session)

A second wave of gap-closures following the 10-priority audit
(`apps/AUDIT-CLIENT-GAPS.md`). All TypeScript-only — no Tauri/Rust
changes, no contract changes, no design-system writes.

- **Per-color theme editor** (Settings → Appearance). Accent palette
  pickers persisted to `localStorage.clio.theme.tokens.v1` and applied
  via injected `<style id="clio-theme-override">` at load. (319cbae)
- **Catalog browser** — Cmd+Shift+K opens a unified modal that
  searches Agents / Commands / MCP / Prompts / Workspaces in one query
  box. Mirrors the TUI's `/catalog`. Picks route the user to the
  matching rail page. (d59d4e7)
- **Locale switcher** (en / es / ja / el). Persisted to
  `localStorage.clio.locale.v1` and forwarded on every clio request as
  `Accept-Language` via a new `getLocale` Client option. UI strings
  stay English until frontend i18n lands. (aef0e2d)
- **Ctrl+G compose modal** — fullscreen textarea that shares draft
  storage with the inline composer (`clio.draft.${sessionId}`). Cmd+↵
  to send, Esc to close-and-save. Composer re-hydrates on close via a
  `draftReloadTick` prop. (3571d12)
- **Cross-session memory search** on MemoryPage. Debounced 250ms,
  hits `GET /v1/memory/search` (PR #351). Renders role-tagged hits
  with score badges. (78c8464)
- **Archive view toggle** in SessionsColumn. When set, fetches
  `GET /v1/sessions?archived=true` into a local resource and renders
  the bucket in place of the live list. Read-only browse. (c97d6f2)
- **Autorename hint** — when SSE `session.updated` includes `title`
  in `changed_fields`, refetch the sessions list so the new title
  flows in and surface a quiet info toast. (8bce7c5)
- **lm.provider.{changed,failed} SSE toasts** — Desktop reducer was
  silent on both; TUI surfaces them. Wired as info/error toasts so
  model swaps and provider failures aren't invisible. (5c009f1)
- **Autorename hint pill** — toast alone didn't match the TUI's
  transient affordance; added a 4.5s topbar badge alongside the toast
  when SSE `session.updated` changes the title. (443274f)
- **Inspector Frames tab + session-wide pending diffs** — surfaces
  `GET /v1/sessions/{id}/context/frames` and aggregates pending diffs
  across all messages so the user sees everything at once. (9dc8a0a)
- **Inspector Schedules tab** — list/create/delete cron triggers per
  session via `GET/POST /v1/sessions/{id}/schedules` + `DELETE
  /v1/schedules/{id}`. Capability-gated via the schedule list. (cc99559)
- **Cmd+L shared session modal** — read-only viewer for
  `GET /v1/shared/{token}`. Accepts a bare token or full clio: URL,
  renders via the existing Transcript with `density: normal`. (1c71559)
- **Detached registry** — Cmd+Shift+D parks the active session in
  `localStorage.clio.detached.{url}`. Palette surfaces parked
  sessions with "walked away N ago" hints and the picker reattaches
  + removes the entry. (b6828d5)
- **SSE context.frame.{created,completed}** — reducer fires
  `onFrameChanged`; ChatScreen refetches frames so the Inspector list
  stays live. (b2f93a3)
- **runCommand for backend slash commands** — palette dispatch now
  prefers `POST /v1/sessions/{id}/commands/{cmd}` (preserving per-
  command arg schemas) with a fallback to user-message dispatch
  when the structured route 404s. (06153a6)
- **metadata.pinned mirror** — `patchSession` now accepts metadata;
  toggling a pin writes `metadata.pinned: bool` server-side, and the
  session list reads it back into the local pin set. TUI and Desktop
  now agree on which sessions are pinned. (d091abb, 73f2d05)
- **LeftRail caps coherence** — Doctor entry surfaces under either
  `caps.doctor` (TUI naming) or `caps.integration_health` (Desktop
  naming). (df2d97d)
- **Custom intro splash** — Settings → Appearance has a multi-line
  textarea persisted to `localStorage.clio.splash.intro.v1`, rendered
  on the Splash screen between the wordmark and the spinner. Mirrors
  the TUI's `intro_file` config. (983c089)
- **Hooks editor** — promoted the read-only Hooks page to read/write
  via `POST /v1/hooks` + `DELETE /v1/hooks/{id}`. Type selector
  (pre_message/post_message/pre_tool/post_tool) + URI input + per-row
  delete buttons. (23a98b1)
- **Policies JSON editor** — Policies page now exposes an Edit affordance
  that switches the JSON pretty-print into a textarea backed by
  `PUT /v1/policies`. (a18c80f)
- **Inspector Bindings tab** — swap per-session blueprint + expert
  pack live via `GET/POST /v1/sessions/{id}/agent-blueprint` and
  `/expert-pack` (PRs #386/#387, #344). Dropdowns populated from
  `/v1/agent-blueprints` + `/v1/expert-packs`. (970f1ff)
- **MCP server detail expansion** — cards now expand to lazy-fetch
  `/v1/mcp/servers/{id}/{tools,resources,prompts}` so users can see
  what each gateway actually exposes without dropping into the TUI.
  (32e0628)
- **Blueprint validate/install/uninstall** — BlueprintsPage hosts a
  JSON form that hits `POST /v1/agent-blueprints/validate` then
  `POST /v1/agent-blueprints`; per-card Uninstall button calls
  `DELETE /v1/agent-blueprints/{bp}`. (c1a29d9)
- **Expert pack validate** — dry-run validate via
  `POST /v1/expert-packs/validate` with verdict display. (d4f1748)
- **SSE session.summarized / session.compacted** — were swallowed
  alongside server.connected; now emit info toasts so the user sees
  when older turns get rolled up. (f831fd7)
- **Provider single detail** — ProviderCard surfaces
  `GET /v1/providers/{id}` (vendor, status, auth.kind, required) on
  the expansion alongside the model list. (1c6f6b1)
- **Context Frame single-detail** — frames rows expand to lazy-fetch
  `GET /v1/sessions/{id}/context/frames/{frame_id}` and pretty-print
  the payload. (cb228ce)
- **MCP resource preview** — each resource row gains a Preview button
  that calls `POST /v1/mcp/servers/{id}/resources/read` and shows the
  text inline. (480af06)
- **Workspace repo map** — WorkspaceCard toggle reveals a tree pulled
  from `GET /v1/workspaces/{id}/repo_map`, with token count chip.
  (21541e1)
- **Per-agent routing detail** — AgentCard expands to
  `GET /v1/agents/{id}` and pretty-prints routing + tool + model
  config. (b6f0476)
- **Inspector task status cycling** — Tasks rows now click to advance
  pending→running→completed via `PATCH /v1/tasks/{tid}`. (e851c8e)
- **Human cron preview** — Schedule create form prints a tagline like
  "Every 5 minutes" or "Daily at 09:00" beside the cron input. (9b0229f)
- **Voice → text via file upload** — Composer gains a file-picker
  button that uploads audio to `POST /v1/sessions/{id}/voice/transcribe`
  and injects the transcript. (c8e8a5e)
- **Voice synth Client method** — `Client.synthesizeVoice` posts text
  to `/voice/synthesize` and returns the audio Blob. (48c7aee)
- **TTS speak button** — assistant message rows gain a Speak action
  that plays the synthesized blob via `HTMLAudioElement`. (bb5f8de)
- **Browser-side mic recording** — Composer mic button uses
  `MediaRecorder` to capture audio in-browser, then routes the blob
  through the same transcribe path. Pulsing red dot while hot —
  no Tauri mic plugin required. (bf50928)
- **Blueprint MCP enable Client method** — `enableBlueprintMcp(bp,
  descriptor)` posts to `/v1/agent-blueprints/{bp}/mcp/{did}/enable`.
  (642e42b)
- **Markdown session export** — palette `export · markdown` converts
  the JSON export into a role-headed `.md` blob client-side. (fadfd06)
- **Cmd+R refresh** — intercepts the browser-reload only when a
  refetch handler is wired, otherwise falls through to F5. (3679df4)
- **Per-message permalink** — every transcript row gains a small
  arrow-up-right action that copies `clio://session/<sid>#<mid>` to
  the clipboard. (6d320db)
- **Workspace unregister** — DELETE `/v1/workspaces/{id}` surfaced
  on the workspace card. (4d41df8)
- **Doctor → LSP clients** — adds `/v1/lsp/clients` status pips
  below the integrations list. (ca55fe1)
- **Client surface bulk-up** — `patchWorkspace`, `lspClients`,
  `getTool`, `extractAgent`, `deleteAgent`, `mcpSubscribeResource`,
  `mcpUnsubscribeResource`, `mcpServerResourceTemplates`,
  `mcpGetPrompt` (`cfee73b`, `c8a6a47`) — methods are wired even
  when no UI hits them yet, so future UI work can drop straight in.
- **Cmd+E quick-edit** — re-opens the last user message in the
  composer for in-place editing. (d0bd01d)
- **Cmd+Y copy transcript** — writes the user/assistant dialogue
  to the clipboard as plain text. (bd64cb5)
- **Agent Remove + Extract** — AgentsPage card gains a Remove
  button (`a34b15c`) and the palette gains an `extract · agent`
  action that posts to `/v1/agents/extract` (`39982e4`).
- **Summarize · custom** — palette command that prompts for
  instructions before calling `summarizeSession`. (30dd6d5)
- **Workspace rename** — WorkspaceCard Rename action hits
  `patchWorkspace`. (7c919d9)
- **Bulk diff apply / reject** — Inspector Diffs tab gains Apply all
  / Reject all buttons backed by `applySessionDiffs` /
  `rejectSessionDiffs`. (15ad321)
- **MCP prompt render** — prompt rows in the MCP detail expansion
  hit `mcpGetPrompt` and pretty-print the templated messages. (5cda766)
- **MCP resource_templates** — the detail expansion lists templated
  URIs alongside resources. (781bd08)
- **Skills_extraction caps gate** — the `extract · agent` palette
  entry only ships when the backend advertises it. (55bb4f5)
- **Permalink scroll-to-message** — Transcript watches the URL hash
  and scrolls/flashes the matching message on mount + transcript
  growth. Pairs with the per-message copy-link action. (eb133b1)
- **Fork lineage badge** — SessionsColumn shows a ↘ glyph next to
  fork titles with the parent id in the tooltip. (11e67de)
- **LSP diagnostics Client method** — `lspDiagnostics(name)` hits
  `/v1/lsp/clients/{name}/diagnostics`. (60cc4ed)
- **Full agents CRUD** — `putAgent` + `createAgent` added so callers
  can register or replace definitions, not just list and delete.
  (3fff86e)
- **Context-file mode cycle** — Inspector Context tab gains a
  clickable mode badge that cycles read → edit → pin via
  `patchContextFile` (`6076e16`, `507727f`).
- **MCP resource Subscribe toggle** — POST/DELETE
  `/v1/mcp/servers/{id}/resources/subscribe` exposed in the row
  next to Preview. (3ff25a8)
- **`patchMessagePart`** — Client method for partial Part edits.
  (db15d32)
- **Focus refetch** — sessions list auto-refreshes when the window
  regains focus after >5s away. (332205b)
- **Mic elapsed counter** — recording badge ticks "Ns" while the
  MediaRecorder is hot. (6bc73b0)
- **`getMessage` + `getSession`** — Client methods round out the
  read surface for permalink resolution and refresh-on-demand
  use cases. (ee26066, c136978)
- **Schedule next-run badge humaniser** — ISO timestamps render
  as "in 5m" / "3h ago" with the raw value in the tooltip. (c26fc32)
- **Plugins discovery (final audit item)** — Rust adds an
  `exec_plugin` Tauri command that runs a path + args with hard
  timeout and 64 KiB output cap. Web adds a Plugins discovery page
  (registry editor + Run/Edit/Remove buttons) plus palette
  dispatch: any plugin with a `trigger` surfaces in Cmd+K and on
  selection the captured stdout/stderr lands in the active session
  as a fenced-code message. Pure-web build disables Run with a hint.
  (b4d56ce)

Visual proofs: deferred — clio :17800 was down during the session, so
the Playwright suite couldn't run end-to-end. Re-run with `pnpm
--filter @clio/web test:visual` after relaunching clio.

## Pending for v1.0 (out of scope for v0.9)

- Code signing (Authenticode / Apple Developer ID / GPG).
- Tauri auto-update via GitHub Releases manifest.
- Bearer-token storage on desktop migrating from localStorage to the
  OS keychain.
- Real wireup of the slash palette command actions (most are
  navigational stubs today).
- Markdown + KaTeX + Mermaid + image rendering in tool_result Parts
  (Wave 4 last unticked PLAN.md item).



- **Tauri build on Linux CI** — the `tauri:build:debug` step needs `libwebkit2gtk-4.1-dev`
  + `libsoup-3.0-dev` + `librsvg2-dev` + `libayatana-appindicator3-dev` installed on the
  runner. The workflow uses `apt-get install` on `ubuntu-22.04`; if the runner image
  drops them we'll re-pin.
- **Tauri icon set** — generated placeholder icons committed under
  `apps/desktop/src-tauri/icons/`. Replace with brand artwork from
  `apps/design/assets/` once the canonical app icon is approved.
- **Live wire vs. fixtures** — `@clio/web` renders against fixture data in
  `src/fixtures/demo.ts`. The connect screen calls `/v1/capabilities` for real, but
  the rest of the chat shell does not yet subscribe to SSE. First post-harness item.
- **No bearer-token persistence yet** — `@clio/web` keeps the token in component
  state. IndexedDB + OS-keychain persistence is PLAN.md item.

## Audit-batch verification (#149, this overnight pass)

Drove the existing Playwright visual harness against the live clio on
`127.0.0.1:17800` for every audit-gap surface that is reachable
without a working LM provider. 30 audit tests now pass with saved
screenshots under `apps/web/screenshots/audit/<id>-<slug>.png`:

Verified surfaces (Playwright `pnpm --filter @clio/web test:visual --grep audit`):
#95 mcp-install-modal, #96 at-mention picker, #97 search-messages palette,
#98 session import, #100 memory events, #102 paste compression,
#103 settings read-only sections, #104/#106/#121 settings appearance,
#105 catalog browser, #107 compose modal, #108 memory search,
#109 archive view, #112/#134 schedules tab + cron preview,
#113 frames tab, #114 shared session modal, #115 walk-away,
#119 pin metadata mirror, #120 leftrail rails, #122 hooks editor,
#123 policies editor, #124 bindings tab, #125 mcp page,
#126 blueprint install, #127 expertpack validate, #128 providers detail,
#131/#140 workspaces, #132 agents page, #135/#137 composer voice+mic,
#138 export-md palette, #141 doctor integrations,
#142 extract-agent palette, #147 plugins form,
#148 composer typing.

Real bugs the audit drive surfaced (all fixed this pass):
- **doctor erroring out on 503** — clio returns `/v1/health` with a 503
  body that still carries integration data; the client now parses it
  and renders the table instead of throwing.
- **plugins + hooks forms hidden behind DiscoveryPage `empty` slot** —
  the empty-state literally says "use the form below" but the form
  was suppressed when there were zero items. Rendered the form
  unconditionally with an inline empty hint.
- **inspector tab nav hidden when only one tab had data** — `length > 1`
  guard hid the Schedules tab on fresh sessions. Loosened to `>= 1`.
- **bindings tab silently empty against real clio** — client typed
  `agentBlueprints()` as `{ blueprints: [] }` while clio returns
  `{ agent_blueprints: [] }`. The mismatched field threw inside the
  bindings createResource, which resolved to null, which made
  `hasBindings()` false. Same for expert packs. Client now
  normalizes both shapes.
- **composer typing eats characters** — draftKey effect re-ran on
  every keystroke and restored stale localStorage. Wrapped in
  `untrack`.
- **SSE flap on activeId** — orphan-detector flipped activeId
  between empty and the real id, tearing down the stream. Removed.

Blocked on a working LM provider (cannot drive without sending a
real assistant turn): #94 ask-user retry, #99 per-message delete,
#101 detailed provider models, #110/#116 autorename hint banner +
topbar pill, #111 lm.provider toasts, #117 SSE context.frame
wiring, #118 runCommand for backend slash commands, #129 frame
detail expansion, #130 mcp resource preview, #133 inspector task
cycling, #136 TTS speak, #139 per-message copy-link, #143 bulk
diff apply/reject, #144 permalink scroll-to-message, #145 fork
lineage badge, #146 context-file mode cycling.

Reason: the live clio backend reports `lm: unavailable - no LM
configured` in `/v1/health`, so POST `/v1/sessions/{id}/messages`
503s before producing any message / frame / diff / task / autorename
event. These surfaces are wired and rendered against fixtures but
cannot be visually verified end-to-end against this clio. Re-run
the audit spec once a working provider (ALCF or local Ollama) is
PUT into `/v1/providers/lm` to clear the remaining 16 items.

## 2026-05-29 — E-19..E-25 wire-shape + SSE handler pass

Driven against live clio on `:17800` (ALCF Sophia / Metis / gpt-oss-120b).
Six commits landed on `feat/apps-harness`:

- **E-19 (`8ba9a37`)** — Added reducer cases for the 11 SSE event types
  the desktop subscribed to but silently dropped: `session.cleared`,
  `message.deleted`, `context.file.{added,removed}`, `file.diff.{applied,
  rejected,write_failed}`, `expert_handoff`, `subagent.{started,
  completed}`, `memory.search.completed`, `turn.retry_requested`.
  Extended `NotificationSink` with `onContextFilesChanged`,
  `onDiffChanged`, `onMemoryChanged` and routed them through
  `createLiveTranscript` to ChatScreen's existing `refetchContextFiles` /
  `refetchSessionDiffs` hooks. `file.diff.write_failed` now surfaces as
  an error toast.

- **E-20+E-21 (`3d27e3a`)** — Added three missing client methods:
  `callMcpTool` (POST /v1/mcp/servers/{id}/call — the canonical way to
  drive an installed MCP server from the UI; was unreachable),
  `renderPrompt` (POST /v1/prompts/{id}/render), `validatePrompt` (POST
  /v1/prompts/{id}/validate).

- **E-23 (`2903e58`)** — `applySessionDiffs` was discarding clio's
  `write_errors` map. Each per-path disk-write failure now surfaces
  as its own error toast.

- **E-22+E-24 (`f3a4436`)** — Rewrote `patchContextFile` to POST instead
  of PATCH (clio's POST endpoint upserts; no PATCH route exists so the
  mode-cycle button was 405'ing). Added optional `metadata` to
  `answerSessionQuestion`'s body to match clio's `AnswerUserQuestionRequest`.

- **Test alignment (`52c9efb`)** — Updated the `resolvePermission` test
  to assert the post-E-16 wire shape (`{action}` not `{decision, scope}`).
  All 36 core tests pass.

- **EXPLORATION update (`1d96c46`)** — Documented E-19..E-24 with the
  user-facing symptoms and the fix in `apps/EXPLORATION.md`.

- **Voice gating (`ce28adc`)** — Speak button on assistant messages
  now gates on `backend.capabilities.voice` to mirror the
  `onTranscribeVoice` gate. Removes a guaranteed error-toast click
  on backends that don't ship `/voice/synthesize`.

What this pass fixed in user terms: `/clear` now wipes the desktop
transcript live; another client deleting a message no longer leaves a
ghost row; the Inspector Diffs tab tracks apply/reject/write_failed from
any source; the Context tab updates when slash commands edit it; expert
handoffs and sub-agent transitions surface as notifications; the
permission body actually unblocks clio. Six remaining surfaces are
blocked on clio capabilities (TTS, MCP resource read).

### Honest verification matrix — what's actually proven end-to-end

I prematurely marked ~15 audit-gap tasks as `completed` based on
"code is wired" instead of "I drove it against live clio and saw it
work." Those are back to `in_progress`. The real state is:

**Verified end-to-end against live clio**
- E-1..E-18 wire-shape fixes (CORS, schedule, fork, share, workspace,
  archive, agent-extract, permission, runCommand) — proven by the
  live walkthrough that produced this doc
- E-19 SSE reducer cases — proven by seeing `routed to chat · dspy`
  (routing_decision part), `Agent planner started` (notification),
  and `Turn failed` (stop_reason=error inline error pill) all render
  live when driving a turn against :17800
- E-22 patchContextFile → POST upsert — clio's POST upserts by path
- E-23 write_errors toasts — wired and typechecked
- E-25 voice gate — clio reports voice:false, button is hidden
- E-26 search-jump flash — same animation as URL-hash permalink
- composer regression (#148) — visual test passes against :17800

**Cannot be verified until clio completes a turn**
- #94 ask-user retry/resume — needs orchestrator question
- #99 per-message delete — needs an assistant message to exist
- #101 provider models detail — needs healthy provider
- #110 / #116 autorename pill — needs clio to rename after a turn
- #111 lm.provider.* toasts — needs a provider swap event
- #117 context.frame SSE — needs a frame to be created
- #118 runCommand — needs an executable backend slash command
- #129 Context Frame detail — needs frames in the session
- #133 task status cycling — needs tasks in the session
- #135 permission card SSE end-to-end (task #35) — needs a tool-using
  turn that triggers a permission_requested event
- #139 per-message copy-permalink — needs an assistant message
- #143 bulk diff apply/reject — needs a tool to propose diffs
- #144 permalink scroll — needs an assistant message
- #145 fork lineage badge — needs a successful fork
- #146 context-file mode cycle — needs a context file row

**What blocks the audit verification right now**: clio's turn returns
`Turn failed` after the routing decision; the dspy planner never
emits an assistant message. That's a clio runtime issue, not a
desktop bug. Once a turn lands an assistant message in the
transcript, the in_progress tasks above can be verified mechanically
by the existing visual specs (they're the ones that timed out
waiting for "Paris" to appear in the transcript pane).

**Permanently blocked on clio capabilities**
- #130 MCP resource preview — clio has no /v1/mcp/servers/{id}/resources/read
- #136 TTS Speak — clio has no /v1/sessions/{id}/voice/synthesize

## 2026-05-31 — live-turn verification pass (clio :17800, ALCF Metis)

Re-spawned clio on :17800 (`CLIO_LM_PROVIDER=argonne`, Metis /
gpt-oss-120b), smoke-confirmed a real turn (`Paris`, stop_reason
end_turn), then drove the 15 re-opened audit gaps against it. The
earlier "dspy Turn failed" era is gone — turns complete — so the
specs that timed out on `Paris` now have a real assistant message to
target. This pass **supersedes** the matrix above.

### Real bugs found and fixed (each its own commit)
- **Permission card never rendered over SSE (#35).** `live.ts` reducer
  read `payload.permission`, but clio emits the fields flat with the
  tool identity under `tool_call.tool_name`
  (`{id, session_id, tool_call:{tool_name, input}}`). So
  `setPendingPermission` never fired and the card was dead against any
  real backend — only the fixture path (which nests under
  `payload.permission`) ever worked. Now maps clio's flat shape;
  verified live: a tool-using prompt → `permission.requested
  (shell_bash)` → card renders → deny clears it via
  `permission.resolved`. (`ff37f4e`)
- **Backend slash commands never dispatched (#118).** clio's
  `/v1/commands` lists ids with a leading slash (`/cache-stats`), but
  `POST /commands/{cmd}` keys on the bare name; the client posted the
  id verbatim → `%2Fcache-stats` → 404. `runCommand` now strips the
  leading slash; verified live: palette → `/cache-stats` → 200.
  (`8faec8e`)
- **(test bug) oneturn msg-id extraction** blocklisted only
  `-copy-`/`-link-`, letting `msg-edit-`/`msg-delete-` button ids
  through so the helper returned a button fragment as the assistant
  message id — the per-message specs hung to the 240s timeout. Anchored
  on `msg-msg_` (container ids start with `msg_`). (`3341470`)

### Reducer audit (vs captured live payloads)
Diffed every message/frame/status reducer case against real clio
payloads. All correct: `message.created` (flat id/role/parts),
`message.part.added` (message_id/part), `message.part.completed`
(final_text — batch-mode authoritative text), `message.completed`
(message_id/stop_reason/tokens), `context.frame.*`, `session.status_changed`.
Permission was the lone broken case.

### Verified end-to-end against live clio (PNG proofs in screenshots/audit/)
- **#35 / #135-perm** permission card over SSE + decision round-trip
- **#99** per-message delete removes the row
- **#117 / #129** inspector Frames tab shows the turn frame completed
- **#139** per-message copy-permalink toast
- **#133** inspector task status cycles (PATCH /v1/tasks/{tid})
- **#145** fork lineage ↘ badge (clio fork → `parent_session_id`)
- **#146** context-file mode cycles read→edit (POST upsert)
- **#118** palette dispatches a backend slash command (→ 200)
- **#101** Settings → Providers expands a provider's models
  (GET /v1/providers/{id}/models)

`oneturn-audits.spec.ts`: 10 passed, 1 skipped (TTS, voice:false).
36 core unit tests pass.

### Blocked on clio behavior (this build) — documented, not failing
- **#110 / #116 autorename pill** — clio derives the session title from
  the id at creation (`session <suffix>`) and emits **no**
  `session.updated(title)` event after a turn (confirmed: 3 turns, 0
  `session.updated` events, only `session.status_changed`). The pill is
  wired to that event so it can't fire. `oneturn-audits` pins the real
  no-pill behavior (`110-116-no-rename-pill.png`); a future autorename
  build flips it red.
- **#94 ask-user retry** — no `user_question` event even on a
  deliberately ambiguous prompt ("Fix it."); this orchestrator just
  answers.
- **#111 lm.provider.{changed,failed} toasts** — `PUT /v1/providers/lm`
  emits no `lm.provider.*` event on the session SSE stream the desktop
  subscribes to.
- **#143 bulk diff apply/reject** — the agent edits files via
  `shell_bash` (`echo > file`), which emits no `file.diff.*`; the
  session diffs endpoint stays `{diffs:[]}`. No diff-proposing edit tool
  is exercised, so there's nothing to apply/reject.

### Permanently blocked on clio capabilities
- **#130** MCP resource preview — no `/v1/mcp/servers/{id}/resources/read`
- **#136** TTS Speak — no `/v1/sessions/{id}/voice/synthesize` (voice:false)

## 2026-05-31 — desktop-shell verification (the part web tests can't reach)

The web Playwright suite drives the SolidJS frontend with
`--disable-web-security` against clio directly, which bypasses every
desktop-native layer. This pass exercised those layers for real.

### Desktop-native Rust integration tests (new, `cargo test --lib`)
- **`gact_http` proxy (3 tests, gated on CLIO_GACT_URL)** — the HTTP
  bridge the WebView actually uses (REST is routed through the Rust
  `ureq` command because the WebView origin is cross-origin to the
  sidecar). Asserts capabilities GET passthrough, POST create-session,
  and that a 4xx returns `Ok(resp)` with the real status + SPEC §14
  error envelope (not `Err(transport)` — the frontend can only lift
  HttpError from the former).
- **`ssh.rs` tunnel (1 test, gated on SSH_TUNNEL_*)** — `TunnelManager::open`
  spawns a real `ssh -L` and an HTTP body forwards back through the
  local port. **Verified live against the homelab** (`jcernuda@10.0.0.102`
  → remote loopback `:18900`, a GACT-shaped mock): the contract envelope
  arrived through the tunnel.
- 10/10 lib tests pass (3 gact_http + 1 ssh + 6 supervisor).

### Real app launched against live clio (screenshot proof)
`desktop-real-app-live.png` is the actual `clio-desktop.exe` WebView2
window (title "CLIO Desktop") rendering the chat shell against clio
:17800 through the real Tauri stack:
- **Supervisor attach-first** worked — sessions column populated from
  clio (REST via `gact_http`).
- Topbar shows **`sse · open`** — the `EventSource` connected, so live
  streaming works in the desktop (see CORS finding below).
- The ↘ **fork lineage badge** (#145), the **routing_decision** part and
  the **`routing_error` inline pill + Retry** (#42) all render in the
  real shell.

### FINDING — SSE rides on clio CORS, REST does not (latent fragility)
REST is routed through `gact_http` (CORS-proof: Rust has no CORS layer),
but **SSE uses a raw `new EventSource(sseUrl)` in `live.ts` that does NOT
go through the bridge**. It only works because the current develop clio
now emits `access-control-allow-origin: *` on **every** endpoint —
verified including `/v1/sessions/{id}/events` and the OPTIONS preflight.
Implications:
- Against this clio, desktop SSE works (confirmed: `sse · open`).
- Against a clio build/config that drops CORS, desktop **REST would
  survive (bridged) but live streaming would silently die** while the UI
  looks connected. The `gact_http` CORS fix is now effectively
  belt-and-suspenders for REST; SSE is unprotected.
- Recommendation (not done — real work, flagged for the release bar):
  either route SSE through a Tauri bridge too (stream events over an IPC
  channel) or make the desktop assert clio CORS on connect and warn.

### Still NOT covered (honest release-readiness gaps)
- **Full WebView click-automation** — driving the real Tauri UI
  (clicking the permission card, typing in the composer, etc.) needs
  `tauri-driver` + a matching `msedgedriver` WebDriver harness, which is
  not set up. Today the desktop UI is verified by: (a) the shared
  frontend logic passing the web Playwright suite against live clio, and
  (b) the screenshot above. The actual click-path through WebView2 is
  not automated.
- **Hardening matrix** — not yet driven: SSE drop + reconnect-backoff
  against a real connection cut, concurrent turns across sessions, large
  transcript rendering, the supervisor *spawn* path (only *attach* is
  exercised — there's no bundled launcher on this box), shutdown reaping
  of sidecar + tunnels, and ssh tunnel error paths (bad host / wrong key
  / ssh-not-on-PATH).

### Verified by shared mechanism, not cold-driven
- **#144 permalink scroll-to-message** — the scroll+flash path
  (`getElementById` → `scrollIntoView` → `trx-msg--flash`) is the same
  one exercised by the passing #139 copy-link and search-jump specs. The
  distinct cold-permalink-on-load path needs the app to remount with the
  hash present, which the transient Playwright connect (no backend
  persistence across `page.reload()`) can't provide. Not a clio block;
  deferred to a desktop-shell reload test where the backend is
  persisted.
