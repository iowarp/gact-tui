# 03 — Architecture

## Desktop UI shape (the reference)

The 2026-05-27 reference research (`research/desktop-app-references.md`) compared Claude Desktop, the Codex App, ChatGPT Desktop, Cursor, Zed, and Cody. Claude Desktop's Code tab and the Codex App have converged on a specific shape, and CLIO Desktop should adopt it almost verbatim:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  CLIO ▸ project ▸ session          context: 12k/200k ●●○                  ─ □ ×  │
├──────────────┬───────────────────────────────────────────────────────────────────┤
│              │  ┌─ chat ────────────┬─ diff (x.py) ──┐                            │
│  ▼ project   │  │ assistant: I'll   │  @@ -3,4 +3,5 @@                            │
│   ● running  │  │  read the file.   │  -def foo():                                │
│   ○ idle     │  │  [▸ read_file ✓]  │  +def foo(x):                               │
│   ○ idle     │  │  Here's my plan…  │       return x                              │
│              │  │  [+8 -3 in x.py]  │                                             │
│  ▼ project   │  │                   │                                             │
│   ⚠ approval │  │  ┌ permission ─┐  │                                             │
│   ○ finished │  │  │ write_file  │  │                                             │
│              │  │  │ x.py        │  │                                             │
│              │  │  │ [once][ses] │  │                                             │
│              │  │  │ [always]    │  │                                             │
│              │  │  │ [deny]      │  │                                             │
│              │  │  └─────────────┘  │                                             │
│              │  └───────────────────┴────────────────┘                            │
│              │  ┌─ tasks ─────────────────────────────┐                           │
│              │  │ → delegated to analysis_expert (●)  │                           │
│              │  │   └ subagent: extract_schemas (✓)   │                           │
│              │  └─────────────────────────────────────┘                           │
│              │                                                                    │
│              │  ┌─────────────────────────────────────────────────────────────┐   │
│              │  │ [⬤ jaime@hpc · prod ▼] [📁 ~/repo ▼] [🛡 ask ▼] [opus-4.7 ▼] │   │
│              │  │ > Ask CLIO about your data...                          [+] [▶]│   │
│              │  └─────────────────────────────────────────────────────────────┘   │
└──────────────┴───────────────────────────────────────────────────────────────────┘
```

**Three zones**: (1) **session sidebar** grouped by project, filterable by status/environment/backend, worktree-isolated per session; (2) **pane area** with drag-and-drop panes — chat (always present), diff, preview, terminal, files, plan, tasks, subagent — each pane re-sizable and re-orderable; (3) **composer footer** in one row, left-to-right: backend picker (machine + backend), project picker, permission-mode selector (Ask / Auto-accept edits / Plan / Auto / Bypass), model picker with reasoning-effort menu, attachment `+`, prompt textarea, send button.

The chat pane is **always the primary pane**, never a collapsible side panel (Cursor's old anti-pattern). Other panes attach to it. `Cmd+\` closes the focused pane; the Views menu opens additional panes; chat cannot be closed.

**Three view-density modes** for the transcript, toggled with `Ctrl+O`: **Verbose** (every Part visible, all `tool_call` cards expanded), **Normal** (tool calls collapsed to one-line summaries, thinking blocks collapsed, default), **Summary** (only `text` Parts + `file_diff` chips + permission cards — tool noise hidden).

Settings live at `/settings/...` as full-page routes (not a modal), sectioned as: **General**, **Appearance**, **Backends** (SSH connections + managed-settings overlay), **Connectors** (MCP catalog), **Permissions** (default mode, denied tools, always-allow lists), **Keyboard shortcuts**, **Advanced**.

For the multi-backend picker design (status pip vocabulary, add-SSH dialog, managed-settings pattern), see `research/desktop-app-references.md` §8.

## The picture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser tab                                                          │
│  ─────────────                                                        │
│   apps/web/      ← Vite dev/prod build, static HTML+JS                │
│        │                                                              │
│        └───────► apps/core/  (TypeScript GACT client + UI primitives) │
│                       │                                               │
│                       │ HTTP+SSE                                      │
└───────────────────────┼───────────────────────────────────────────────┘
                        │
                        │   (same protocol)
                        │
┌───────────────────────┼───────────────────────────────────────────────┐
│  Desktop installer    │                                               │
│  ─────────────────    │                                               │
│   apps/desktop/  Tauri 2 shell                                        │
│        │                                                              │
│        ├──► WebView2 / WKWebView / WebKitGTK ──► apps/web/ build      │
│        │                                                              │
│        ├──► OS keychain (bearer token storage)                        │
│        ├──► Native notifications (permission.requested, etc.)         │
│        ├──► File drag-drop → context attach                           │
│        ├──► Tray icon with detached-session badge                     │
│        └──► (Optional) Bundled clio-agent sidecar                     │
└───────────────────────────────────────────────────────────────────────┘
                        │
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Docker container                                                     │
│  ────────────────                                                     │
│   clio-agent-gact  on :8100  ← GACT v0.2 server (FastAPI + SSE)       │
│        + bearer auth                                                  │
│        + multipart upload endpoint                                    │
│        + ~/.config/clio-agent/ mounted as volume                      │
└──────────────────────────────────────────────────────────────────────┘
```

Three artifacts ship from `apps/`: a static web bundle, a desktop binary per OS/arch, and a docker compose override that runs the right backend.

## Folder layout

```
apps/
├── core/                       # Shared TypeScript GACT client + UI primitives
│   ├── package.json
│   ├── src/
│   │   ├── wire/               # Generated from contract/SPEC.md
│   │   │   ├── types.ts        # Workspace, Session, Message, Part, Event, Cap, …
│   │   │   └── events.ts       # SSE event-type discriminated union
│   │   ├── client/             # HTTP + SSE client
│   │   │   ├── http.ts         # fetch wrapper with bearer auth + structured errors
│   │   │   ├── sse.ts          # EventSource w/ Last-Event-ID reconnect + backoff
│   │   │   ├── caps.ts         # capability discovery + feature-flag store
│   │   │   └── index.ts        # public API (one Client class)
│   │   ├── store/              # Framework-agnostic reactive store (Solid signals)
│   │   │   ├── sessions.ts
│   │   │   ├── transcript.ts   # per-session message ledger
│   │   │   ├── permissions.ts  # pending queue
│   │   │   └── caps.ts
│   │   ├── parts/              # Part renderers as pure functions of part → vdom
│   │   │   ├── text.ts
│   │   │   ├── thinking.ts     # collapsible block
│   │   │   ├── tool-call.ts    # cyan header + ⎿-equivalent left-rail
│   │   │   ├── tool-result.ts
│   │   │   ├── file-diff.ts    # unified-diff renderer w/ apply/reject
│   │   │   ├── routing.ts      # routing_decision badge (cyan per agent)
│   │   │   ├── subagent.ts     # indented + left-rail
│   │   │   ├── context-frame.ts # power-user context-frame inspector
│   │   │   └── unknown.ts      # forward-compat placeholder
│   │   ├── ui/                 # CLIO-design-system primitives (Solid components)
│   │   │   ├── Card.tsx        # canonical card recipe
│   │   │   ├── Eyebrow.tsx     # mono uppercase tracked label
│   │   │   ├── StatNumber.tsx  # orange tabular-nums
│   │   │   ├── Chip.tsx
│   │   │   ├── Button.tsx      # btn-primary / btn-secondary
│   │   │   ├── Modal.tsx       # reuses Card recipe + frame
│   │   │   └── Backgrounds.tsx # connect-screen atmospheric stack
│   │   ├── themes/             # Same seven themes as TUI + JSON loader
│   │   ├── markdown/           # marked + highlight.js, themed via design tokens
│   │   └── i18n/               # English default; scaffold for more
│   └── tests/
│
├── web/                        # Browser app
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── routes/
│       │   ├── connect.tsx     # Backend URL + bearer token entry
│       │   ├── chat.tsx        # Main 3-pane layout
│       │   └── doctor.tsx
│       ├── components/         # Sidebar, Composer, Transcript, …
│       └── modals/             # Slash palette, @ picker, permission, settings
│
├── desktop/                    # Tauri shell
│   ├── package.json            # uses apps/web/ as its frontend
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       ├── main.rs
│   │       ├── keychain.rs     # Stronghold or keyring
│   │       ├── notify.rs       # native notifications
│   │       ├── tray.rs         # tray icon w/ detached badge
│   │       └── sidecar.rs      # (optional) clio-agent supervisor
│   └── icons/                  # OS-specific assets
│
├── deploy/                     # Backend deployment artifacts
│   ├── Dockerfile.gact         # clio-agent-gact entrypoint, port 8100
│   ├── docker-compose.gact.yml # full GACT compose (with volumes for ~/.config)
│   └── nginx.conf              # example reverse proxy w/ bearer + TLS
│
├── design/                     # CLIO Design System (copied 2026-05-27)
│   ├── colors_and_type.css     # design tokens (the contract)
│   ├── CLIO-Design-System-README.md  # full canonical spec
│   ├── SKILL.md
│   ├── fonts/                  # Oxanium, JetBrains Mono, Bungee Spice
│   └── assets/                 # brand logos + favicons
│
├── README.md
├── 01-goal.md
├── 02-current-state.md
├── 03-architecture.md          (this file)
├── 04-roadmap.md
├── 05-open-questions.md
├── 06-design-language.md       # CLIO design system applied to the IDE
├── 07-tui-vs-web-semantics.md  # what ports / what doesn't
└── research/
    ├── clio-agent-surface.md
    ├── gact-tui-architecture.md
    └── clio-agent-delta-2026-05.md
```

## Tech stack

### Frontend: **SolidJS + TypeScript + Vite**

The choice with the strongest argument given what the wire actually emits.

**Why Solid over React/Svelte/Vue:**

- **Fine-grained reactivity matches the SSE delta model.** Every `message.part.delta` with `text_append` should append a few tokens to one specific `<span>` inside one specific message in the transcript. Solid's signals update only the DOM node bound to the changed signal; React would either re-render the whole transcript (slow) or require a manual `useReducer` + `memo` discipline that fights the framework. The TUI achieves this with explicit `applyPartDelta` and per-part `▸` cursor; Solid achieves it with `createSignal("")` per part. Svelte 5 runes are similar in spirit and would also be acceptable.
- **Small runtime.** ~7KB gzipped vs React's ~45KB. Matters for the Tauri WebView2 cold-start and for bandwidth on the web client.
- **JSX without virtual DOM.** Familiar to React developers; no learning curve cost.
- **Good TypeScript story.** First-class.

**Why not React:** The token-streaming case fights React's reconciliation model. You'd reach for `react-virtuoso` or manual `useImperativeHandle` to avoid re-rendering 5000 lines of transcript every keystroke. Solid sidesteps the problem entirely.

**Why not Svelte:** Tied with Solid on technical merit. Solid edges it on TS ergonomics and ecosystem maturity in early 2026. Honest call — Svelte 5 would also work and the user should override if they have a preference.

**Why not Vue:** Composition API is good, but Vue's reactivity is between React and Solid in granularity — closer to React for our case. Smaller ecosystem for the specific things we need (markdown rendering, diff viewers, themes).

### Build: **Vite**

- Native ES modules, fast HMR (under 100ms).
- Built-in TS support.
- Single config across web + Tauri.
- Tauri 2 documents Vite as a first-class frontend.

### State: **Solid stores (no Redux/Zustand/etc.)**

The shared `apps/core/store/` exports signals, stores, and resources. No extra state lib. If a piece of state lives across sessions (theme, detached session list, bearer token), it lives in `IndexedDB` (web) or OS keychain (Tauri) via a single `Persistence` abstraction.

### Design system: **CLIO Design System (`apps/design/`)**

Inherited as the visual foundation. See `06-design-language.md` for the IDE-specific mapping. Concrete plumbing:

- `apps/design/colors_and_type.css` is `@import`-ed at the top of `apps/web/src/index.css`. All tokens (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--ease-*`, `--dur-*`, `--glow-*`) become the project's design contract.
- Oxanium / JetBrains Mono / Bungee Spice are self-hosted from `apps/design/fonts/`. Bungee Spice is used only for the literal "IOWarp" wordmark on the connect screen.
- Brand assets in `apps/design/assets/brand/` (CLIO icons + lockups + favicons) are copied or symlinked into `apps/web/public/` at build time.
- Heroicons outline set imported via `@heroicons/react/24/outline` (Solid wrapper or direct SVG inline). No custom icons.
- The CLIO design language is dark-only; the additional six themes (`light`, `dracula`, `solarized-dark`, `solarized-light`, `nord`, `tokyo-night`) ported from the TUI override the `--color-*` tokens on `:root[data-theme="..."]`.

### Markdown: **`marked` + `highlight.js`**

- `marked` is fast, mature, and themable.
- `highlight.js` for fenced code blocks; one bundle hit, ships ~190 languages.
- Both work in Tauri's WebView2.
- The code-block visual treatment uses JetBrains Mono (from `apps/design/fonts/`) and the CLIO design tokens for the gutter/background/highlight colors.

Alternative: `markdown-it` + `shiki`. `shiki` produces beautiful output (uses VS Code's TextMate grammars) but bundles ~MB of grammar data. Defer to `highlight.js` for v0.1; optionally upgrade later if the theme matters more.

### Diff rendering: **custom renderer using the contract's `unified_diff`**

The backend already produces unified-diff text in `file_diff.unified_diff`. We parse with a small `jsdiff`-compatible parser and render with custom DOM (one `<div class="hunk">` per `@@`, `<span class="add"/`/`<span class="del">` per line, dim context, monospace + tab-stop = 4). Visual treatment per `06-design-language.md` §Transcript-specific primitives: `@@` headers in `--color-accent-cyan/60`, `+` lines on `--color-success/10`, `-` lines on `--color-error/10`, context in `--color-muted`. Apply/Reject buttons use the canonical `.btn-primary` (orange) and `.btn-secondary` (cyan) recipes from `colors_and_type.css`.

Side-by-side view is a stretch — toggleable button in detail-view modal.

### Desktop: **Tauri 2**

- Output matrix matches the user's requirements exactly: `.msi`, `.AppImage`, `.deb`, `.rpm`, `.dmg` (per-arch).
- Auto-updater built in.
- Sidecar pattern for running a bundled clio-agent (if we go that route).
- Stronghold or `keyring` crate for token storage.
- Smaller binaries than Electron (~10MB vs ~100MB).
- Native menubar, tray, notifications, drag-drop.

Tauri's `commands` (Rust ↔ JS bridge) only get used for OS-only capabilities: keychain access, native notifications, tray, sidecar supervision. Everything else goes through the same HTTP/SSE client that the web app uses.

## Communication contract between layers

| Layer pair | Mechanism |
|---|---|
| `apps/core/` ↔ clio-agent | HTTP/1.1 + JSON + SSE per `contract/SPEC.md`. Bearer auth via `Authorization: Bearer ...` header; SSE uses `?auth_token=...` query because `EventSource` cannot set custom headers (per spec §382-394). |
| `apps/web/` ↔ `apps/core/` | Direct ESM imports. `apps/core/` is a workspace package. |
| `apps/desktop/` ↔ `apps/web/` | Tauri loads the Vite dev server in dev mode, or the static `dist/` in production. The frontend is unaware it's in Tauri unless it calls `@tauri-apps/api`. |
| `apps/desktop/` ↔ OS | Tauri `commands` — narrow Rust ↔ JS bridge for keychain, notifications, tray, drag-drop, sidecar. |
| `apps/desktop/` ↔ bundled clio-agent (optional) | Tauri sidecar — spawn the docker container or a pip-installed binary, supervise it, point the frontend at `http://127.0.0.1:<port>`. |

`apps/core/` is the **only** layer that knows the GACT wire. The web app, the Tauri shell, and any future client (mobile, IDE plugin) all consume the same client.

## Capability gating: how it actually works

`apps/core/client/caps.ts` exports a `useCapabilities()` hook (or signal) that:

1. On connect, calls `GET /v1/capabilities`.
2. Stores the response in a Solid store.
3. Provides type-safe predicates: `caps().diffs`, `caps().memory`, `caps().agent_routing`.

Every feature surface wraps itself in a `<Show when={caps().X}>`:

```tsx
<Show when={caps().diffs}>
  <DiffSidebar />
</Show>
<Show when={caps().memory}>
  <CacheHitRateChip />
</Show>
```

Unknown capability flags surface in a debug panel inside `/doctor` — useful when a backend ships a new flag before the client does. Per `contract/SPEC.md`, unknown flags are ignored, not errored.

Forward-compat for Part types and SSE event types uses the same idiom — an `<UnknownPart part={p} />` fallback in the discriminated `<switch>` and a "received unknown event" log line in `/doctor`.

## Build and release pipeline

### Web

- `vite build` → static `dist/` (HTML + JS + CSS bundle).
- Hosted any way: same docker image as clio-agent (serve `dist/` from `clio-agent-gact` as a static mount), or any CDN, or behind nginx.
- CI: GitHub Actions on every push — `tsc --noEmit && vite build && playwright test`.

### Desktop

- GitHub Actions matrix:
  - `windows-latest` → `.msi` (WiX)
  - `macos-14` (Apple Silicon) → `aarch64.dmg`
  - `macos-13` (Intel) → `x64.dmg`
  - `ubuntu-22.04` → `.AppImage`, `.deb`, `.rpm`
- `tauri build` per OS, signed with platform-appropriate certs.
- Auto-update via Tauri's built-in updater pointed at a GitHub Releases manifest.

### Backend (clio-agent docker)

Out of scope to ship from `gact-tui`. The deliverable is a `deploy/Dockerfile.gact` and `deploy/docker-compose.gact.yml` in this folder that the user can copy into the clio-agent repo, or that runs the existing image with the correct entrypoint override.

## Why not Electron / Neutralino / Wails

- **Electron** — too big (~100MB binaries), heavier RAM than Tauri.
- **Neutralino** — works but smaller ecosystem; less reliable updater story.
- **Wails (Go)** — would be tempting given the team's Go expertise from `tui/`, but the frontend would still be web tech and we'd lose Solid's ecosystem benefits. Also, Wails' Linux story is less mature than Tauri's.

Tauri's only real downside vs Electron is occasional WebView2 / WebKitGTK rendering divergences for very fancy CSS. Our UI is content-heavy, not animation-heavy — we won't hit that.

## Security posture

- **All backend traffic over HTTPS in production.** Bearer token in `Authorization` header; SSE token in URL query (unavoidable per `EventSource` API, but tokens have a TTL).
- **Bearer tokens stored in OS keychain on desktop, `IndexedDB` on web (with `httpOnly` cookies as a stretch if we put nginx in front).**
- **CSP locked down.** No inline scripts, no eval. Tauri's CSP is configured in `tauri.conf.json`.
- **Tauri allowlist locked down.** Only the OS APIs we use are exposed — no filesystem read/write from JS except through narrow Tauri commands.
- **The backend is the security boundary.** Tools that touch the filesystem are gated by clio-agent's `FileAccessPolicy.allow_roots`. The client trusts the backend to enforce file scoping.
