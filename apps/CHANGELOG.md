# CLIO Desktop — CHANGELOG

## v0.9.1 — desktop polish + clio-agent develop surface

The first cut (v0.9.0) shipped the desktop chrome, bundled sidecar,
and discovery routes. v0.9.1 lands the polish pass + wires every
useful piece of the clio-agent develop branch's expanded GACT v0.2
surface into the desktop UX.

### Release-blocker fixes (vs v0.9.0)

- WebView CORS: every frontend HTTP routes through a Rust
  `gact_http` Tauri command so the WebView origin can't be
  rejected by a sidecar that doesn't emit
  `Access-Control-Allow-Origin`.
- `fetch-sidecar.sh` swapped a bash-4 associative array for a case
  statement so macos-14 runners (bash 3.2) can build the sidecar
  launcher and the dmg's actually get produced.

### New keyboard shortcuts

| Combo                       | Action                                  |
|-----------------------------|-----------------------------------------|
| Cmd/Ctrl + K                | Command palette                         |
| Cmd/Ctrl + F                | Find in transcript                      |
| Cmd/Ctrl + /                | Keyboard shortcuts cheatsheet           |
| Cmd/Ctrl + ,                | Open Settings                           |
| Cmd/Ctrl + N                | New session                             |
| Cmd/Ctrl + S                | Export current session                  |
| Cmd/Ctrl + Shift + S        | Fork current session                    |
| Cmd/Ctrl + I                | Toggle Inspector drawer                 |
| Cmd/Ctrl + B                | Toggle Sessions column (focus mode)     |
| Cmd/Ctrl + O                | Cycle transcript density                |
| Cmd/Ctrl + Shift + ↑/↓      | Previous / next session                 |
| Cmd/Ctrl + Enter            | Force-send (even with Shift held)       |
| Esc                         | Close overlay · stop streaming turn     |

### Chat shell

- Sessions column with workspace switcher, search, pin-to-top, kebab
  menu (rename, fork, export, share, pin, delete).
- Transcript: streaming cursor on in-flight assistant turns, inline
  error pill with Retry, per-message Copy / Edit / Quote / Regenerate
  actions. Thinking parts show word count + cleaner expand
  affordance.
- Composer: per-session draft persistence, drag-and-drop file
  attach, model picker, permission-mode picker, slash-on-empty,
  @-mention picker, attachment chips.
- Topbar chips: cost (USD), tokens (humanized), stop_reason, SSE
  status with reconnect countdown, running tools (pulsing dot),
  model (clickable → Settings/Models), permission mode (warning
  tone on non-default), density (click-to-cycle).
- Notification Center (bell) lists the last 50 toasts with an unseen
  badge, tone-colored row icons, and 'Clear all'.
- Sticky 'Jump to latest' pill when user is reading history, with a
  live new-message counter.
- Autoscroll on stream when at bottom; snap-to-bottom on session
  switch.
- Focus composer on session activation (guarded against open
  overlays).

### Inspector drawer

Tabbed shell that only shows tabs when their data exists:

- **Turn** — stop_reason, model, tokens, cost
- **Tools** — tool call list with click-to-expand input/output JSON
- **Diffs** — file_diff list with click-to-open DiffPane
- **Thinking** — full reasoning bodies
- **Tasks** — `/v1/sessions/{id}/tasks` rows with status pip
- **Context** — `/v1/sessions/{id}/context/files` with edit/read mode
  indicator and hover Remove button
- **Health** — backend integration entries

Plus a 220ms section fade-in on tab switch.

### Discovery routes

- **Sessions** (default chat route)
- **Workspaces** — list + inline `+ New workspace` form
  (`POST /v1/workspaces`)
- **Agents** — agent catalog
- **Tools** — slash command + tool gateway list
- **Prompts** — `/v1/prompts` registry with scope badge
  (builtin/user/workspace), default profile, validation errors,
  reload button
- **MCP servers** — server status + tool counts
- **Memory** — memory stats
- **Metrics** — metrics dashboard
- **Doctor** — `/v1/health` integrations + `/v1/capability-gaps`
  callouts so 'not supported' is explicit rather than 404-inferred

### Palette actions (Cmd+K)

Beyond raw slash commands the palette exposes:

- Per-session jumps (top 12 most recent)
- Permission mode quick-switch (`perm · ask`, `perm · auto`, …)
- Rail jumps (`go · agents`, `go · doctor`, …)
- Settings deep-links (`settings · providers`, `settings · doctor`, …)
- Session actions: new, copy id, summarize, undo last turn,
  compact session
- View: cycle density, toggle inspector

### Markdown renderer

`InlineMarkdown` understands:

- `# / ## / ###` headings
- `- / * / 1.` lists (plus GitHub `[ ] / [x]` task lists)
- `> ` blockquotes
- ` ``` ` fenced code (with hover Copy + language badge)
- `**bold**` / `__bold__`
- `*italic*` / `_italic_`
- `~~strikethrough~~`
- `` `inline code` ``
- Pipe-delimited tables (`| h | h |` + `|--|--|` + data rows)
- Bare http/https autolinks (markdown link syntax intentionally
  unparsed — no XSS surface for `[click](javascript:…)`)

### Client (`@clio/core`) — new methods

- `createWorkspace` · `patchSession` · `cancelSession`
- `summarizeSession` · `compactSession`
- `undoSession` · `rewindSession`
- `exportSession` · `forkSession` · `shareSession` · `deleteSession`
- `lmConfig` · `setLm` · `authProvider`
- `prompts` · `reloadPrompts`
- `sessionTasks` · `createSessionTask` · `patchSessionTask` ·
  `deleteSessionTask`
- `sessionContextFiles` · `addContextFile` · `removeContextFile`
- `sessionQuestions`
- `capabilityGaps`

### Reset

A `Reset all preferences` button in Settings → Appearance wipes
every `clio.*` localStorage key (drafts, pins, inspector tab,
density, active session, …) after a confirm dialog and reloads.

### Open blockers

1. ALCF / Globus token-cache reload — needs a re-test against the
   develop branch now that upstream merged the token-path work.
2. macos-14 / Linux WebView CORS smoke — Windows is verified; the
   release CI matrix is the canonical check.

When all three blockers are green, push `clio-desktop-v0.9.1`.
