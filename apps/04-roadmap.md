# 04 — Roadmap

Five phases. Each ends with a demoable artifact (or a `501` if the corresponding capability isn't ready). No phase has a calendar date — the user is the schedule.

## Phase 0 — Backend prerequisites (`clio-agent` side)

The web/desktop apps are blocked on five things in clio-agent. Until these land, nothing on the frontend side delivers value to a real user.

| # | Task | File | Verification |
|---|---|---|---|
| 0.1 | Swap Docker entrypoint to `clio-agent-gact` (port 8100). Either replace the existing entrypoint or add a second compose service. | `clio-agent/Dockerfile`, `docker-compose.yml` | `curl http://localhost:8100/v1/capabilities` returns 200 from a fresh `docker compose up`. |
| 0.2 | Mount `~/.config/clio-agent/` (or the container's `$XDG_CONFIG_HOME`) as a volume. This now also covers `context_files.json` and `permission_policies.json` which were persisted in the May 2026 delta but inherit the same volume-mount gap. | `docker-compose.yml` | Restart compose → `GET /v1/sessions`, `GET /v1/sessions/{sid}/context/files`, `GET /v1/policies` all still return prior state. |
| 0.3 | Implement `bearer` auth scheme. CLI subcommand `clio-agent token issue [--name]` writes to `~/.config/clio-agent/tokens.json`; server enforces `Authorization: Bearer ...` when `CLIO_REQUIRE_BEARER=1`; SSE accepts `?auth_token=`. | `src/clio_agent/gact/app.py` (+ `auth.py` new module) | Without token: 401 from `/v1/sessions`. With token: 200. Capabilities now shows `auth.schemes: ["bearer", "trust_socket"], current: "bearer"`. |
| 0.4 | Add `POST /v1/sessions/{sid}/context/files/upload` (multipart). Writes into a per-session sandbox under the workspace, auto-creates a context-file attach. | `src/clio_agent/gact/app.py` | `curl -F file=@hello.py http://.../upload` returns a context-file row; the next assistant turn includes the file content in context. |
| 0.5 | Persist external MCP server registrations. New JSON store under `~/.config/clio-agent/mcp_servers.json`. (Permission policies were persisted in the May 2026 delta; MCP servers were not.) | `src/clio_agent/gact/app.py` (+ `mcp_store.py` new module) | Restart compose → `GET /v1/mcp/servers` still includes user-registered servers. |

**Exit gate:** `contract/conformance/conformance.go` run against `http://localhost:8100` (with bearer) passes every section that the existing TUI passes against the same backend.

Coordination note: Tasks 0.1–0.5 are upstream changes to `clio-agent`. The `deploy/` folder in `apps/` stages the Dockerfile + compose changes as a PR-ready artifact. The bearer + upload implementations have to land in `clio-agent` proper.

## Phase 1 — `apps/core/` (the shared client)

Build the GACT client library that web and desktop both consume. Zero rendering code in this phase — pure data and protocol.

| # | Task | Deliverable |
|---|---|---|
| 1.1 | Scaffold workspace. Package manager: pnpm. Workspace packages: `core`, `web`, `desktop`. TypeScript strict mode. ESLint + Prettier. | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`. |
| 1.2 | Generate `wire/types.ts` from the contract. Two paths: (a) hand-write from `emulator/pkg/gact/messaging.go` (faster, ~600 lines of TS), or (b) script it via `json-schema-to-typescript` if the emulator publishes a schema. Start with (a). | `apps/core/src/wire/types.ts`. All Part types as a discriminated union on `type`. All event types similarly. |
| 1.3 | HTTP client. Bearer-aware fetch wrapper. Structured-error envelope parsing. Retry-after honoring on 503s. Capability-fetch on connect. | `apps/core/src/client/http.ts`, `caps.ts`. |
| 1.4 | SSE client. `EventSource` w/ `Last-Event-ID` resume. Exponential backoff (250ms → 30s, reset on success). Event-type discriminated callbacks. Heartbeat watchdog. | `apps/core/src/client/sse.ts`. |
| 1.5 | Solid store layer: sessions list signal, transcript signal per session (with per-part append primitive), pending-permissions queue, caps store. | `apps/core/src/store/*.ts`. |
| 1.6 | Conformance test harness. Calls into a real clio-agent (from Phase 0). Verifies every method shape. | `apps/core/tests/conformance.spec.ts` (Vitest). |
| 1.7 | Persistence abstraction. `Persistence` interface with `IndexedDBPersistence` and a deferred `KeychainPersistence` (Tauri-only, implemented in Phase 4). | `apps/core/src/persistence/*.ts`. |

**Exit gate:** `pnpm --filter core test` passes against a live Phase-0 clio-agent. Manual: open a Node REPL, `import { Client } from "@gact/core"`, post a message, see it stream.

## Phase 2 — `apps/web/` MVP

Render. Render *enough* to be useful, not everything.

| # | Task | Deliverable |
|---|---|---|
| 2.1 | Connect screen. Backend URL + bearer token entry. Persists to `IndexedDB`. Validates with `GET /v1/capabilities` before navigating. | `routes/connect.tsx` |
| 2.2 | Main **three-zone** layout — sidebar / pane area / composer footer (per `research/desktop-app-references.md` §5 + `03-architecture.md` §"Desktop UI shape"). Pane area is drag-and-drop with chat pane always present + additional panes (diff, preview, terminal, files, plan, tasks, subagent). Composer footer: backend picker · project picker · permission-mode · model · `+` attach · send. Mobile breakpoint collapses sidebar; on narrow widths the multi-pane drag-and-drop collapses to a single-pane stack. | `routes/chat.tsx`, `components/Layout.tsx`, `components/PaneArea.tsx`, `components/ComposerFooter.tsx` |
| 2.3 | Sessions sidebar. List, status badges, age display, filter strip (`status`, `archived`, `detached-only`, `busy-only`, substring search). New / rename / two-step delete. Reuses TUI's filter semantics. | `components/Sidebar.tsx` |
| 2.4 | Composer. Textarea, slash command palette on `/`, `@` file picker, bracketed paste compression. `Enter` to submit, `Shift+Enter` for newline. | `components/Composer.tsx`, `modals/SlashPalette.tsx`, `modals/FilePicker.tsx` |
| 2.5 | Transcript renderer. Iterates messages → parts. Dispatch table over Part types. `<UnknownPart />` fallback. Incremental signal-bound updates per delta. Sticky-to-bottom scroll with manual-scroll detach. | `components/Transcript.tsx`, `apps/core/src/parts/*.ts` |
| 2.6 | **Inline permission card** (not a modal — `research/desktop-app-references.md` anti-pattern #3). Triggered by `permission.requested` event; rendered in the transcript at the point of request. Three-scope buttons (Once / Session / Always for this tool); risk badge; warning band for broad-reach actions; status transitions through Reviewing → Approved/Denied/Aborted/Timed-out. Visual treatment per `06-design-language.md` §Inline approval card. Resolves via `POST /v1/permissions/{id}` with the chosen scope. | `components/PermissionCard.tsx` |
| 2.6b | **Ask-user modal** (May 2026 delta — distinct from permission modal). Triggered by `session.status_changed { status: "waiting_user" }` + `question.requested` event; free-text input; resolves via `POST /v1/sessions/{sid}/questions/{qid}`. Visual treatment per `06-design-language.md` (warning color, not the destructive red of permission deny). | `modals/AskUser.tsx` |
| 2.7 | Header chips. Backend label, status badge (now also `waiting_user`), model chip, cache % chip (memory cap), agent badge (routing_decision part), SSE health dot. | `components/Header.tsx` |
| 2.8 | Three themes: dark (CLIO Design System default), light, tokyo-night. Theme via CSS custom properties; tokens for chips/role colors. CLIO tokens are the canonical dark mode. | `apps/core/src/themes/*.ts` |
| 2.8b | **Three view-density modes** (Verbose / Normal / Summary), toggled with `Ctrl+O`. Per-session persistence in client storage. Affects which Parts are visible and which are collapsed. Per `06-design-language.md` §Three view-density modes. | `components/DensityToggle.tsx`, transcript renderer |
| 2.8c | **Permission-mode selector** in composer footer (Ask / Auto-accept edits / Plan / Auto / Bypass). Mid-session switchable via `Cmd+Shift+M`. Bypass gated behind a settings toggle. Per `research/desktop-app-references.md` §5 pattern 4. | `components/ComposerFooter.tsx` |
| 2.8d | **Diff-stats chip** in chat pane (`+12 −1 in path/to/file.py`); click opens the diff pane focused on that file. Per `06-design-language.md` §Diff-stats chip. | `parts/file-diff.ts`, `panes/DiffPane.tsx` |
| 2.9 | Doctor view: `/v1/health` integrations table + capabilities scorecard + the new May 2026 capability-gaps matrix (`x_clio_capability_gaps`). | `routes/doctor.tsx` |
| 2.10 | **Retry affordance** on failed turn (May 2026 delta). Reads `TurnAttempt` rows from the assistant message; renders `↻ retried 2× · last error: ...` in muted mono; click to expand attempt history; click "retry" to POST the retry endpoint. | `components/RetryBanner.tsx` |

**Exit gate:** A new contributor with no prior context can `pnpm dev` against a Phase-0 clio-agent, log in with a bearer token, run a turn end-to-end (including a tool call requiring permission), and apply a file diff. No console errors. Lighthouse score ≥90 on desktop viewport.

## Phase 3 — Feature parity

Catch up to the TUI's full feature surface.

| # | Task | Notes |
|---|---|---|
| 3.1 | File diffs in-transcript. Unified diff renderer with `a`/`r` apply/reject inline. Detail-view modal for large diffs. Side-by-side view as toggle. | Uses `unified_diff` text from `Part`. Custom parser+renderer. |
| 3.2 | Catalogs: `/mcp`, `/tools`, `/agents`, `/skills`, `/commands`, `/catalog`. Modal browsers for each. MCP install/remove flow. | One reusable list-modal primitive. |
| 3.3 | Settings modal: Model, Agent, Theme, UI tabs. LM provider config (preset → model → key → temperature → max_tokens). Auto-pops on first connect if LM unconfigured. | `PUT /v1/providers/lm` integration. |
| 3.4 | Prompt registry: `/v1/prompts` browser, editor for layered prompts. | Vendor extension; gated on `caps.x_clio_prompt_registry`. |
| 3.5 | Task lists per session, context files browser, hooks editor, policies editor. | All gated on respective caps. Context files browser now also surfaces turn provenance (May 2026 delta). |
| 3.6 | Session: fork, cancel, archive, summarize, export, import, clear (two-step), undo, rewind (undo/rewind are real endpoints now per May 2026 delta). | Context-menu (web/desktop-native) + Cmd+. shortcut. |
| 3.7 | Voice transcription (web): use `MediaRecorder` API → `POST /v1/voice/transcribe`. | Gated on `caps.voice`. |
| 3.8 | Custom theme JSON loader. Same schema as TUI's `~/.config/gact/theme.json`. Drag-drop a JSON file onto the theme picker. | |
| 3.9 | Metrics view route at `/metrics` (web-native — not a modal; see `07-tui-vs-web-semantics.md`). | `GET /v1/metrics`. |
| 3.10 | Per-part keyboard navigation (`j`/`k`/`n`/`N`/`Cmd+E`). Focus management, scroll-to-selection. | Web idiom replaces TUI's `▸` glyph with focused-element styling. |
| 3.11 | Localization scaffold. English only, but the i18n hooks are in place. | `apps/core/src/i18n/`. |
| 3.12 | **Expert pack catalog browser** (May 2026 delta). Browses `AgentDef(source="expert_pack")` agents; shows tier / parent / validation status. Card-based, follows the design system Card recipe. | `routes/agents/expert-packs.tsx` |
| 3.13 | **Per-turn agent override** in composer (May 2026 delta). Small picker next to Send button that overrides `agent:{id}` for one turn; reverts to session default after. | `components/Composer.tsx` extension |
| 3.14 | **Context frame inspector** (May 2026 delta). Right-rail panel showing per-turn assembled context (files, prior messages, prompt template, agent, memory). Off by default; toggle in settings. | `components/ContextFrameInspector.tsx` |
| 3.15 | **Cross-session memory search** (May 2026 delta). Search bar above the sidebar. Hits `GET /v1/memory/search?q=`. Results are `(session, message excerpt)` rows; click to jump. | `components/MemorySearch.tsx` |
| 3.16 | **Session context policy editor** (May 2026 delta). Settings modal page for per-session auto-injection rules (recent messages window, file-attach default mode, memory injection cap). | `modals/SessionContextPolicy.tsx` |

**Exit gate:** Side-by-side TUI vs web demo: every documented TUI feature reachable in the web client. Conformance suite re-run, no regressions.

## Phase 4 — `apps/desktop/` (Tauri)

Wrap. Add OS integrations. Ship installers.

| # | Task | Deliverable |
|---|---|---|
| 4.1 | Scaffold Tauri 2. `tauri init` against `apps/web/` as the frontend. Locked-down CSP and allowlist. | `apps/desktop/src-tauri/tauri.conf.json` |
| 4.2 | Bearer token via OS keychain. Stronghold or `keyring` crate. Tauri command `secure_get`/`secure_set`. Replaces `IndexedDBPersistence` on desktop. | `src-tauri/src/keychain.rs`, `apps/core/src/persistence/keychain.ts` |
| 4.3 | Native notifications on `permission.requested` and `notification` events when window is unfocused. | `src-tauri/src/notify.rs`. Tauri's `notification` plugin. |
| 4.4 | Tray icon with detached-session count badge. Right-click menu: "Open", "Sessions...", "Quit". | `src-tauri/src/tray.rs` |
| 4.5 | File drag-drop into composer → context attach via Phase-0.4 upload endpoint. | Tauri's `tauri://drag-drop` events. |
| 4.6 | Auto-update via GitHub Releases manifest. | `tauri.conf.json` updater section. |
| 4.7 | CI matrix: Windows (`.msi`), macOS aarch64 + x64 (`.dmg`), Linux (`.AppImage` + `.deb` + `.rpm`). Code signing with platform certs. | `.github/workflows/release.yml` |
| 4.8 | (Stretch) Sidecar mode: bundled clio-agent supervised by the Tauri shell. Skipped if user's deployment story is always-Docker. | `src-tauri/src/sidecar.rs` |

**Exit gate:** Install the desktop app on Windows, macOS, and a Linux distro. Each opens, connects to a running clio-agent, runs a turn. The macOS Apple Silicon `.dmg` and `x64.dmg` both install on their respective architectures.

## Phase 5 — Polish + parity backstops

Things that wouldn't block v1 but matter for the product feeling done.

- Accessibility audit (axe-core). Focus management, screen reader labels, keyboard-only nav through every modal.
- Mobile responsive sidebar drawer.
- High-DPI assets.
- Detail-view side-by-side diff toggle.
- Drag-resize panes.
- Persistent layout (sidebar width, theme, etc.) per backend.
- Power-user shortcuts (Vim/Emacs mode for the composer? Optional.).
- Conformance dashboard in `/doctor` showing which sections the connected backend passes.
- Auto-rename session from first turn (mirrors TUI behavior).

## Sequencing constraints

- **Phase 0 blocks Phase 1.5+** — the conformance suite can't run without a real backend.
- **Phase 1 blocks Phase 2** — no web rendering without the client.
- **Phase 2 blocks Phase 3** — feature parity comes after MVP.
- **Phase 3 blocks Phase 4 in practice but not strictly** — Tauri can wrap an MVP web app; OS integrations don't depend on feature parity. If the user wants a Tauri demo earlier, parallelize 4.1–4.4 with the second half of Phase 3.

## Out of scope for v1

These would be Phase 6+ or never:

- React Native / Flutter / Capacitor mobile apps.
- Multi-tenant cloud hosting.
- Collaborative sessions (two humans in one session).
- In-browser code editing (Monaco / CodeMirror embedded).
- Real-time voice (just transcription; not streaming).
- LSP integration (the contract reserves the cap but no backend implements it).

## What a partial ship looks like

If only Phase 0 + Phase 1 + Phase 2 land, the result is: **the web app exists, ships from clio-agent's docker image as a static mount on port 8100, requires bearer auth, supports turn-based chat with permission gating, but doesn't yet support catalogs, prompts, multi-tier agents, or themes beyond dark.** That's a usable demo. It's not yet a replacement for the TUI.

If Phase 0 + 1 + 2 + 3 land but Phase 4 doesn't, the web app is full-featured and the desktop app doesn't exist. Still useful — many users would prefer the browser anyway.

The user can intentionally cut the project there. The desktop app is the most expensive phase per unit user value.
