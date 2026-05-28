# 08 — Decisions Log

Decisions made in the interview on 2026-05-27 (after the design system arrived and the May 2026 clio-agent delta was integrated). Supersedes the recommendations in `05-open-questions.md` where they conflict.

## Product framing

**Internal tool now, federation lens always.** One developer on one machine for v1, but designed so that multi-machine "agents across SSH-reachable hosts" works from day one. Eventually positioned as an entry point for a scientific federation (NSF-related; not for disclosure). Build with that in mind, don't build *to* it yet.

**Implications:** Multi-backend support is a Phase 2 feature, not Phase 4. The connect/settings UI assumes N machines × N backends from the start. The wire stays per-backend; the federation is a client-side composition.

## Surface priority

**Desktop is the primary product, web alongside it.** Hand-in-hand from one codebase via Tauri-wrapping. The desktop is the focus because the SSH-managed multi-backend story requires Tauri (a pure browser can't manage SSH tunnels or store keys in an OS keychain). The pure-browser version is a degraded-mode parallel deliverable for users who can't or won't install the desktop app.

**Implications:**
- Phase 4 (Tauri) is not a "stretch after Phase 3" — it lands alongside Phase 2/3 development.
- The static web bundle (Phase 2/3 output) is also published as a GitHub Releases artifact for the pure-browser case.
- Features that require Tauri capabilities (SSH manager, OS keychain, native notifications, tray, drag-drop, autoinstall) are explicit in the design as **Tauri-only** with graceful degradation in pure-web mode.

## Framework

**SolidJS + TypeScript + Vite.** Locked. Fine-grained signal reactivity matches the per-token SSE delta model; ~7KB runtime is friendly to Tauri's WebView2 cold start. Workspace scaffolding follows `03-architecture.md`.

## Naming

**`clio-web` and `clio-desktop`** (folder, package, build, artifact). The product name is **CLIO** across all three surfaces (TUI / web / desktop), consistent with the CLIO Design System's positioning. The TUI keeps its existing `gact-tui` identity in code (don't churn that), but the marketing language is unified under CLIO.

**Implication for `apps/` folder layout:**
```
apps/
├── core/             # shared @clio/core TypeScript package
├── web/              # @clio/web — pure-browser app
├── desktop/          # @clio/desktop — Tauri shell
├── design/           # CLIO Design System
└── deploy/           # backend deployment artifacts
```

## Repo strategy

**Same repo: `gact-tui/apps/`.** Single CI, single tag, easier cross-cutting refactors. Move to a separate repo only if web cadence outpaces TUI cadence by 3x or more.

## Backend access and security

**SSH-tunneled multi-backend with bearer auth as defense-in-depth.** Combined model:

- **SSH** provides wire authentication and encryption between the user's machine and the remote clio-agent host. The Tauri shell owns SSH key storage (OS keychain), tunnel lifecycle, and remote provisioning.
- **Bearer auth** in clio-agent provides defense-in-depth against rogue processes on either endpoint host that could otherwise reach the tunnel port and the wide-open localhost socket. Phase 0.3 is still required; SSH is not a substitute for application-layer auth.
- Auth scheme stays minimal for v1: static bearer token issued via `clio-agent token issue --name <label>`. Token TTL + rotation deferred to Phase 5.

**Web hosting:** static bundle published to GitHub Releases per version. The Tauri app bundles the same static build; the pure-browser path is `https://github.com/iowarp/.../releases/download/clio-web-vX.Y.Z.zip` extracted to any static host (including the user's localhost via `python -m http.server`). No CORS configuration needed since the bundle and the clio-agent backend may be on different origins — the bearer auth is sent on every request including SSE (via `?auth_token=` for `EventSource`).

## Multi-backend connect flow (Tauri-managed)

User opens the desktop app, goes to **Settings > Backends > Add Remote**. Wizard collects:
- Hostname / IP
- SSH user
- Authentication method: existing key from `~/.ssh/`, system ssh-agent, or paste/import a new key
- Optional label (e.g., "Lab workstation", "ANL login node")
- Optional: tick "auto-install clio-agent" — Tauri SSHes in, checks for docker, pushes `docker-compose.gact.yml`, starts the container, issues a bearer token, configures the new backend in the local store.

The "machine + backend" picker in the main UI (top of sidebar, modeled after the chat.openai.com / claude.ai model+account dropdowns) shows all registered backends with their connection status (green dot = tunnel healthy, amber = reconnecting, red = down).

Pure-browser users can't use this flow. They add a backend by URL + bearer token entry on the connect screen, and the URL needs to be a backend someone else has tunneled or directly exposed.

**Technical details** of the SSH manager (crate choices, autoinstall script, tunnel supervision, keychain integration, security defaults) come from `research/tauri-ssh-backends.md` once that research lands.

## Patterns lifted from the desktop-app reference research

From `research/desktop-app-references.md` (2026-05-27). The references the user named — Claude Desktop and Codex Desktop — have converged in 2025–2026 on a specific shape. CLIO Desktop adopts it.

1. **Three-zone single-window layout**: sidebar (sessions × project) / pane area (drag-and-drop chat + diff + preview + terminal + files + plan + tasks + subagent) / composer footer.
2. **Chat pane is always primary**, never a collapsible side panel. Other panes attach to it. `Cmd+\` closes the focused pane; chat cannot be closed.
3. **Composer footer in one row** (left-to-right): backend picker · project picker · permission-mode selector · model picker · attachment `+` · prompt textarea · send button. Lifted from ChatGPT's recent prompt-bar redesign + Claude Desktop's environment dropdown.
4. **Inline approval cards in the transcript** with three-scope buttons (Allow once / Allow for session / Always for this tool / Always on this server / Deny) and a risk badge. Warning band for broad-reach actions. Lifted from Claude Desktop's prompt + Zed's contextual scoping + Codex's review-item status states.
5. **Three view-density modes**: Verbose / Normal / Summary. `Ctrl+O` to cycle. Per-session persistence. Lifted from Claude Desktop's Code tab.
6. **Permission-mode selector** in the composer with five modes (Ask / Auto-accept edits / Plan / Auto / Bypass). Mid-session switchable via `Cmd+Shift+M`. Bypass gated behind a settings toggle.
7. **Diff-stats chip** in chat (`+12 −1 in path/to/file.py`) → opens the diff pane on click. Apply/Reject are per-hunk in the diff pane, not on the chip.
8. **Sidebar grouped by project**, sessions filterable by status/environment/backend, worktree-isolated per session. Status pips per session: running / idle / awaiting-approval / finished / errored.
9. **Token-by-token streaming with stop-on-composer and `Esc`**. Mid-stream correction injection: typing a message while the agent runs is read between steps (Claude pattern). Optionally: `Enter` injects now, `Shift+Enter` queues for next turn (Codex CLI's dual-channel).
10. **`@`-mention with autocomplete + drag-drop + Ctrl+V/Cmd+V paste** for file context. Attached files render as chips above the prompt (Cody's default-chips pattern).
11. **Settings as a sectioned full-page route** (`/settings/...`), not a modal. Sections: General / Appearance / Backends (SSH + managed-settings overlay) / Connectors (MCP catalog) / Permissions / Keyboard shortcuts / Advanced.
12. **Context-usage ring** next to the model picker, mapped to backend `usage` events. Click expands per-session + plan-wide breakdown.
13. **OS notifications** when a turn completes and the user isn't viewing that session.
14. **OS-keychain credential storage** for backend bearer tokens, MCP server configs, and SSH identity passphrases.
15. **Multi-buffer review tab for `file_diff` Parts**, accept/reject per-hunk, à la Zed and Cursor.
16. **`Cmd+;` side-chat** affordance — a transient chat that reads session context but doesn't write to transcript history (Claude pattern).
17. **Onboarding via the prompt area itself**, not a scripted tour. First prompt asks: backend, project, model, permission mode.

## Anti-patterns explicitly avoided

From the same research:

1. **No Electron.** Claude Desktop (~300MB idle) and Codex App (~165MB binary) sit on Electron. Tauri's ~58–75% lower memory and ~10× smaller installer is a competitive moat we keep.
2. **No chat-as-modal / chat-as-collapsible-side-panel.** Cursor's older pattern. Chat is the primary pane, always visible.
3. **No approval prompts without "Always" scopes.** This is a documented Claude Desktop papercut (issues `anthropics/claude-code#25966`, `#28580`). We ship with the four scopes (Once / Session / Always-tool / Always-server) at v1.
4. **No auto-merge of worktrees.** Force manual review before merge (Codex's choice). `Auto-accept edits` mode opts into applying `file_diff` automatically — never the default.
5. **No model/backend picker buried in a Settings tab.** Composer footer placement from day one.
6. **No silent loss of token-usage feedback.** Surface `usage` events natively (Zed's known limitation).
7. **No stranding of interrupted turns.** Persist partial transcripts on cancel/disconnect (Zed bug we don't replicate).
8. **No "stop" = "stop and clear".** Stop leaves partial response with a "stopped" marker; corrections injectable without stopping.
9. **No CLI-only SSH backend setup.** Dialog-driven Add-SSH-connection from v1 (Claude Desktop pattern).
10. **No platform-gating of core features.** Voice, drag-drop, notifications work on Windows + macOS + Linux at launch.

## UX placements decided

| Surface | Placement |
|---|---|
| **Permission card** | **Inline card in transcript** with three-scope buttons + risk badge. Updated from earlier "blocking modal" after the desktop-reference research; Claude Desktop's inline pattern is the bar. The card blocks the agent turn (not the UI) until resolved. |
| **Ask-user question** (May 2026 delta) | **Inline card in transcript** with free-text input. Composer stays available. |
| Permission/question semantic split | Both inline; permission is warning-tinted (or error-tinted for high-risk), question is muted/info-tinted. Distinct cards visually. |
| **Per-turn agent override** (expert packs) | **Small dropdown next to Send button.** Always visible, defaults to session default, reverts after one turn. |
| Settings / Doctor / Metrics | Full-page routes (`/settings`, `/doctor`, `/metrics`) — web-native, not modals. |
| Action menus | Right-click context menus + Cmd+. shortcut. Not the TUI's `m`-key modal. |
| Slash command palette | Cmd+K spotlight overlay anchored to viewport center, not the TUI's modal-at-input. |
| Toasts | Stacked top-right, dismissible. |
| Detached session badge | Tab title + favicon (web), tray icon badge (Tauri). |

## What we explicitly DROP from the TUI

Per `07-tui-vs-web-semantics.md`. Recap of the load-bearing drops:
- ANSI splash animation → real PNG/SVG fade.
- `⎿` / `▸` / `└` connector glyphs → real CSS borders + indentation.
- Bracketed paste compression → native multi-line input shows pastes in full.
- Mouse-toggle setting (terminal multiplexer concern).
- "Compose modal" — the web composer is already multi-line.
- Hit-cell registry — DOM event delegation replaces it.
- Single-window single-buffer constraint — web has tabs, desktop has windows.
- Bubbletea god-struct — Solid component tree with locally-scoped signals.

## What we explicitly ADD beyond the TUI

Web/desktop-native affordances per `07-tui-vs-web-semantics.md` §"Web/Desktop-native":
- Inline images, charts, PDFs, math (KaTeX), Mermaid in `tool_result` rendering.
- Real form controls (sliders, date pickers, color pickers).
- URL state — deep-link to sessions/messages.
- Multiple tabs/windows as session multiplexer.
- Real keyboard shortcut handling (Cmd+K, Cmd+/, etc.).
- Voice recording via `MediaRecorder`.
- Right-click context menus.
- Service worker / offline mode (web).
- Web Share API (where supported).
- Tauri-only: SSH manager + tunnel supervision, OS keychain, native notifications, tray icon, file drag-drop, auto-update, multi-monitor session detach.

## Design language

CLIO Design System (`apps/design/`) is the visual foundation. `06-design-language.md` is the IDE-specific extension. Dark by default; the other six themes from the TUI port as `:root[data-theme]` overrides.

Marketing-only treatments (stats strip, gradient hero, floating orbs, six-engine bento) do not appear in the IDE. The IDE uses a stripped-down atmospheric stack: only the noise overlay in main app, full stack on the connect screen.

Voice rules apply to chrome (button labels, modal copy, error toasts, empty states). Assistant Markdown content is rendered verbatim — if the LM emits emoji, we render emoji. The brand is emoji-free; the conversation is not policed.

## Still-open questions

Two lower-priority items not yet decided. Captured here so they don't fall through:

- **Q11 — design system extension ownership.** Should the IDE-specific extensions (`06-design-language.md`) get upstreamed to the canonical CLIO Design System, or fork-in-place in `apps/design/`? Recommendation in `05-open-questions.md` is fork-in-place for v1, upstream once stable. Decide before Phase 2 design review.
- **Q8 — license.** Match `gact-tui/LICENSE` or pick separately? Trivial to handle when scaffolding `apps/core/`.

## Decisions log entries (for the timeline)

- 2026-05-27 — Frontend framework: **SolidJS + TypeScript + Vite**.
- 2026-05-27 — Naming: **clio-web / clio-desktop**; product name **CLIO** across all surfaces.
- 2026-05-27 — Repo: **same repo, `gact-tui/apps/`**.
- 2026-05-27 — Product framing: **internal tool today, federation lens always**.
- 2026-05-27 — Surface priority: **desktop primary, web alongside (hand-in-hand)**.
- 2026-05-27 — Network/auth: **SSH-tunneled multi-backend + bearer auth as defense-in-depth**.
- 2026-05-27 — Web hosting: **GitHub Releases static bundle**.
- 2026-05-27 — Multi-backend: **Tauri-managed SSH connections, keychain-stored keys, optional autoinstall**.
- 2026-05-27 — Ask-user UX: **inline card in transcript** (not modal).
- 2026-05-27 — Agent picker: **small dropdown next to Send**.
- 2026-05-27 — Tauri reaches v1 — **not deferred behind Phase 3**.
- 2026-05-27 — Desktop layout: **three-zone (sidebar / drag-and-drop pane area / composer footer)**, chat pane primary; lifted from Claude Desktop Code tab + Codex App.
- 2026-05-27 — Approval flow: **inline cards, three scopes (Once / Session / Always-tool / Always-server) + Deny**, risk badge, warning band for broad-reach actions.
- 2026-05-27 — **Three view-density modes** (Verbose / Normal / Summary), `Ctrl+O` to cycle.
- 2026-05-27 — Settings as **sectioned full-page route** at `/settings/...`, not a modal.
