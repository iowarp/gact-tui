# 07 — TUI vs Web Semantics

You raised the right concern: a web/desktop port that mechanically copies every TUI affordance ends up worse than both — uncanny-valley terminal in a browser, missing every native idiom the web/desktop platforms offer. This doc maps the boundary.

Three categories: things that **port directly** (same concept, different substrate), things that are **TUI-native** (don't bring them over), and things that are **web/desktop-native** (the TUI can't do them; the new clients should).

---

## Ports directly — same concept, different substrate

These work the same in both surfaces. Skinning them in CLIO design tokens is most of the work.

| Concept | TUI | Web/Desktop |
|---|---|---|
| Three-pane layout | sidebar / transcript / composer | CSS grid, same three regions, responsive collapse |
| Status badges and chips | lipgloss styled rectangles | spans with border + bg, same colors |
| Streaming token append | per-frame string concat | per-event signal append on a `<span>` |
| Modal stack | `*Open bool` per modal | controlled component per modal (Solid `Show`) |
| Theming | lipgloss palette + cached styles | CSS custom properties on `:root[data-theme]` |
| Capability gating | `if a.caps.X { ... }` | `<Show when={caps().X}>...</Show>` |
| SSE reconnect | `Last-Event-ID` + exponential backoff | `EventSource` (with `?auth_token=`) + same backoff |
| Permission modal | blocking overlay | blocking modal dialog |
| File diff renderer | go-udiff to ANSI | jsdiff to themed HTML |
| Markdown rendering | glamour TermRenderer | marked + highlight.js |
| Routing decision badge | lipgloss inline chip | `<span class="agent-badge">` |
| Per-part cursor | `bodySelPartIdx int` | focused-element tabindex on each part |
| Sticky-to-bottom scroll | `stickyToBottom bool` watching scroll | DOM `scrollHeight`/`scrollTop` watcher |
| Cost meter | footer string | footer chip with mono `tabular-nums` |
| Filter strip on sidebar | input + status toggles | input + toggle buttons |
| Two-step destructive confirm | armed-then-fire timer | armed-then-fire state machine |
| Detached registry | `~/.config/gact/detached.json` | `IndexedDB` (web) or OS keychain (desktop) |
| Slash command dispatch | filter `commands[]` then `POST /commands/:id` | same |

---

## TUI-native — don't port these to web

These exist because the terminal is the way it is. Forcing them into HTML is awkward at best.

### Glyph-based continuation graphics (`⎿`, `▸`, `└`)

The TUI uses these because a terminal has no notion of "indented box with a connecting line." The web does. Use real CSS:

- TUI `⎿` connector under a `tool_call` → Web: a `border-left: 2px solid cyan/30` rail down the left side of the indented `tool_result`, no glyph needed.
- TUI `▸` per-part cursor marker → Web: focused-element styling (cyan left border + `--color-surface-alt` background). Keyboard focus management replaces the glyph.
- TUI `└` subagent indent → Web: actual `padding-left` + left-rail border.

Don't ship `⎿` as a Unicode character in the web app. It's a terminal compromise.

### ANSI splash animation

`tui/internal/ui/intro.go` renders an 80-frame chafa-baked logo. On the web:
- Connect screen uses the real `clio-icon-256.png` from `apps/design/assets/brand/` with a CSS fade-in.
- Optionally a Lottie animation or a real video for the splash. Definitely not chafa-rendered ANSI.

### Bracketed paste compression

The TUI compresses multi-line pastes to `[pasted content: N lines]` because the input is a single-row textarea that scrolls horizontally. The web composer is naturally multi-line (`textarea` or `contenteditable`), so it shows the pasted content in full. Optional UX: a "collapse" button next to large pastes, but not the default.

### Terminal-title detach badge

The TUI writes `↩ 3 — CLIO` into the terminal title via OSC 0. The web has equivalent affordances but they're different:
- Web: `document.title = "↩ 3 · CLIO"` + favicon badge.
- Desktop (Tauri): tray icon badge, dock badge on macOS, taskbar badge on Windows.

The detached registry concept ports; the OSC-0 mechanism doesn't.

### Mouse hit-cell registry

The TUI's `uiHitRegistry` maps rendered terminal cells to semantic actions because there's no DOM. The web has a DOM — click handlers go on elements directly. Hit-testing is the browser's job, not the app's.

### "Compose modal" (`Ctrl+G`)

The TUI ships a separate compose modal because the input is a single-row textarea by default. The web composer is already multi-line and resizable; there's no need for a separate modal. Map `Ctrl+G` to "expand composer to full height" if anything, but the modal is gone.

### Mouse-toggle setting

`tui/internal/ui/settings.go` exposes a "mouse on/off" setting because some terminal multiplexers (tmux, screen) break mouse reporting. Not a concern on the web. Drop the setting.

### Single-window single-buffer constraint

The TUI is one terminal buffer. Modals stack inside it. The web has multiple browser tabs and the desktop has multiple windows. Some TUI UX is shaped by the constraint of having only one viewport; don't reimport the constraint when the substrate has lifted it.

### Bubbletea TEA reducer god-struct pattern

The TUI's `App` struct has ~250 fields managed through a single `Update(msg)` function. That's the only sane pattern in Bubbletea. The web app should NOT have one signal of 250 fields — it should have a real component tree with locally-scoped signals. The mapping from the TUI's god-struct to the web app's distributed state is in `02-current-state.md` §"How the TUI talks to the contract."

### Localization stub

The TUI ships `Localizer` interface and `GACT_LOCALE` env. The web has `Intl.*`, `navigator.language`, full `i18next` ecosystem. Use the web ecosystem; don't port the TUI's stub.

---

## Web/Desktop-native — the TUI can't do these; we should

These are affordances the substrate enables that the TUI literally cannot.

### Inline rich content in the transcript

The TUI can show text. The web can show:

- **Images** in `tool_result` content (e.g., a matplotlib figure from a Python tool). MCP `content[]` already supports image type per the contract (`contract/SPEC.md` §957-961). Render `<img>` directly.
- **Charts / graphs** for structured data returns. If a tool returns an `application/vnd.plotly.v1+json` resource, render with Plotly. If it returns an `application/json` array of numeric series with a hint header, render with `chart.js` or `vega-lite`.
- **PDFs** inline. Browser native via `<embed type="application/pdf">` or pdf.js. The TUI ships ASCII; the web ships the real thing.
- **Markdown previews** for assistant responses that contain heavy Markdown. The TUI uses glamour; the web can use a real Markdown engine with all the features (tables, footnotes, math via KaTeX).
- **Code blocks with syntax highlighting** at full fidelity, with copy buttons, line numbers, and language-specific theming via Shiki or highlight.js.
- **Math** via KaTeX. The TUI can't do this at all.
- **Mermaid diagrams** if the assistant emits ```mermaid blocks.

### Real form controls

The TUI implements its own number inputs, color pickers, dropdowns. The web gets these for free:

- LM provider config: real range slider for temperature, real number input for max_tokens, real password field for the API key.
- Theme picker: real `<input type="color">` for custom palette tweaks.
- Settings: real `<select>` for routing mode, real toggles for booleans.
- Date/time scheduling for `/v1/schedules` cron: a real `<input type="datetime-local">` and a cron-expression editor with live preview.

### URL state

Every TUI session is identified only by sidebar selection. The web can deep-link:

- `https://app/sessions/sess_abc123` opens directly to that session.
- `https://app/sessions/sess_abc123/messages/msg_def456` opens to a specific message in the transcript.
- `https://app/doctor` opens the doctor view.
- Browser back/forward navigates sessions.
- Copy-link share button on every session row.

Backed by HTML5 history API, no extra dependencies. The TUI has no equivalent because there's no URL.

### Multiple tabs / windows as session multiplexer

The TUI is one client per process. The web supports `N` tabs each subscribed to a different session's SSE feed. Same backend instance, multiple concurrent UIs.

A new design surface this enables: **a "dashboard" tab** showing all active sessions in a grid, each tile showing live token counts and the last assistant utterance, click to open. The TUI has `gact dashboard --watch` as a CLI subcommand; the web has it as a route. Different substrate, parallel feature.

### Drag-and-drop file attach (Web)

Drag a file from the OS file manager into the composer → `POST /v1/sessions/{sid}/context/files/upload` (Phase 0.4 endpoint). The TUI has no drag-drop affordance; the user has to type the path.

### Native notifications (Desktop, partial in Web)

- **Desktop (Tauri)**: when the window is unfocused, fire an OS notification on `permission.requested`, `notification` event, and (optionally) on `message.completed` for long-running turns. Notification API is native.
- **Web**: same, via the browser Notifications API (with user permission grant).
- TUI: has nothing equivalent — at best a terminal-bell. Drop.

### Tray / dock integration (Desktop only)

- macOS dock badge with detached-session count.
- Windows taskbar badge.
- Linux: AppIndicator tray icon with right-click menu.

### File-system drag-out

Right-click a `file_diff` or a `tool_result` carrying a file path → "Reveal in Finder/Explorer/Files." TUI: nothing. Desktop: Tauri `shell.open()`. Web: noop (browser sandbox).

### Multi-monitor / picture-in-picture

Detach a session into its own window. The TUI has `gact attach --detach-session` for similar concept but it's "open a new terminal." The web/desktop equivalent: open the session in a popup window or in a Tauri secondary window. Useful for keeping a long-running session visible while doing other work.

### Real keyboard event handling

The TUI has to deal with terminal escape sequences (`\033[1;5D`, etc.). The web has `KeyboardEvent.code` and `KeyboardEvent.key`, the Tauri shell adds global shortcuts and per-window shortcuts. This means:

- Cmd+K / Ctrl+K is a real global shortcut for the slash palette.
- Cmd+/ / Ctrl+/ toggles the help overlay.
- Cmd+, / Ctrl+, opens settings.
- Cmd+1..9 / Ctrl+1..9 switches between recent sessions.
- All shortcuts respect `cmd` vs `ctrl` per platform; Tauri handles this for free.

### Voice recording in-browser

The TUI shells out to `voice-cmd`. The web has `MediaRecorder` + `MediaDevices.getUserMedia()`. Record directly in the browser, POST to `/v1/voice/transcribe`. No external binary needed.

### Right-click context menus

Native browser context menus override is straightforward in the web; Tauri allows full native menus on desktop. Every session row, every message, every Part gets context-menu actions:

- Session row: Open, Rename, Fork, Archive, Detach, Delete, Copy link.
- Message: Copy, Edit, Retry, Delete, Share, Export as Markdown.
- File diff Part: Apply, Reject, Open in Editor, Reveal in Finder.

TUI has the `m` key action menu and right-click via mouse hit-cell registry, but it's a fixed modal — the web has real context menus that appear at cursor position.

### Persistent layout across sessions

The web client stores sidebar width, theme, font size, expanded states (sidebar collapsed sections, last selected session, last visited route) per-backend in `IndexedDB`. The TUI has settings but no layout persistence (the layout is determined by terminal size).

### Real undo / redo in composer

The web composer has full undo/redo (`Cmd+Z`/`Cmd+Shift+Z`) for free via `<textarea>`. The TUI has none.

### Real selection / copy-to-clipboard

Web users select text and Cmd+C to copy — works everywhere. The TUI ships `y`/`Y` for yank because terminal selection conflicts with mouse mode. Drop the explicit yank keybinding on the web; rely on native selection.

### Service worker / offline mode

The web can register a service worker that caches the static assets and serves them offline. The connect screen and the cached session transcript work without a network connection. Useful for resilience to flaky networks (and a non-issue for the TUI).

### Web Share API (mobile / desktop browser)

The native share sheet: `navigator.share({title: "My Clio session", url: ".../sessions/sess_abc"})`. One-tap share to Slack, email, etc. on supported platforms.

---

## Different idioms — same intent

These exist in both surfaces but the substrate-appropriate idiom is different.

| Concept | TUI idiom | Web/Desktop idiom |
|---|---|---|
| Action menu | Modal list opened by `m` | Right-click context menu OR Cmd+. shortcut OR ⋯ overflow button |
| Help overlay | Tabbed modal | Cmd+/ opens a docs-style overlay with searchable shortcuts |
| Filter sidebar | Input + radio toggles | Input + filter chips that toggle on/off, with a "Saved filters" dropdown |
| Sessions sidebar | Vertical list | Vertical list + virtual scroll for large counts + drag-to-reorder pinning |
| File picker for `@` | Fuzzy basename modal | Same modal, but with thumbnails for known extensions (images, PDFs) |
| Theme picker | Tabbed list with preview | Visual grid of theme cards, each showing a mini-mockup |
| Cancel turn | `Ctrl+X` | Big "Stop generating" button in the composer area while turn is running |
| Settings | 4-tab modal | Full-page settings route at `/settings` with section anchors |
| Doctor view | Modal | Full-page route at `/doctor` |
| Error toast | Footer line | Stacked top-right toast notifications with dismiss button and timeout |
| Catalogs | Modal list | Sidebar tabs OR a dedicated route per catalog (`/mcp`, `/tools`, `/agents`) |
| Loading state | Spinner glyph | Skeleton loaders that match the final layout |

---

## The principle

When a feature exists in both surfaces:

1. **Look at the contract.** What semantic event/state is being communicated? (e.g., "a permission is requested" — that's the contract level.)
2. **Pick the substrate-appropriate idiom.** Block input while the user decides → modal in both surfaces, but with different visual treatment.
3. **Don't preserve TUI compromises.** The TUI uses `⎿` because it has no boxes; the web has boxes. The TUI uses `↩ N` in the terminal title because it has no taskbar; the web has tab titles and the desktop has trays.
4. **Use what the substrate gives you.** Web has URLs — use them. Desktop has trays — use them. TUI has none of this; don't fake it on the substrate just because the TUI does.

The TUI's UX is a complete, considered design. It is not a constraint on the web/desktop apps. It is a description of the affordances any GACT client must provide; the substrate determines how.
