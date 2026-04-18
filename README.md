# GACT — Generic Agentic-Coder TUI

A terminal frontend for any agentic-coder backend that conforms to the **GACT v0.1** REST + SSE contract. Two pieces:

- [`emulator/`](./emulator) — a fully-implemented backend that synthesizes realistic agent turns. Boots in ~50ms, no external dependencies.
- [`tui/`](./tui) — a Bubbletea client that drives any GACT-compliant backend (the emulator, or your own).

The contract itself is in [`contract/SPEC.md`](./contract/SPEC.md).

## What it looks like

| | |
|---|---|
| ![streaming](screenshots/02-streaming.png) | ![completed](screenshots/03-completed.png) |
| Mid-stream — running badge, thinking + tool call with parsed args | Completed conversation, idle status |
| ![permission](screenshots/04-permission.png) | ![after allow](screenshots/09-after-allow.png) |
| Yellow permission banner, `waiting_permission` status | After pressing `a` (allow), scenario continued and completed |
| ![palette](screenshots/06-palette.png) | ![help](screenshots/05-help.png) |
| Slash-command palette (filter as you type) | Help overlay (`?` to toggle) |

## Quickstart

Requirements: Go 1.25+, a terminal that supports 256-colour (or true-colour for best results).

```sh
# Build
cd emulator && go build -o ./emulator-server ./cmd/emulator-server
cd ../tui     && go build -o ./gact .

# In one shell: run the emulator (with realistic streaming pacing)
./emulator/emulator-server --port 7777 --timing realistic

# In another shell: run the TUI
GACT_BACKEND=http://localhost:7777 ./tui/gact
```

Type a message, hit `Enter`. The emulator's default scenario runs an
assistant turn with thinking → tool call → tool result → final reply.
Type something containing `delete`, `rm `, `drop `, or `truncate ` to
trigger the permission flow.

## Themes

Seven palettes ship out of the box — cycle them live in Settings > Theme
or pass `--theme <name>` at launch. `gact --list-themes` prints the
options without opening the TUI. Picked theme persists to
`~/.config/gact/config.json`.

Current lineup: **dark** (default) · **light** (Gruvbox-inspired cream) ·
**dracula** · **solarized-dark** · **solarized-light** · **nord** ·
**tokyo-night**.

| | |
|---|---|
| ![dracula](screenshots/61-dracula-convo.png) | ![solarized-light](screenshots/60-solarized-light-convo.png) |
| Dracula in action | Solarized-light, conversation pane |
| ![theme picker](screenshots/54-themes-list.png) | ![tokyo-night](screenshots/59-theme-tokyo-night.png) |
| Settings > Theme picker — ↑/↓ previews live | Tokyo Night |

### Custom theme

Drop a `theme.json` at `~/.config/gact/theme.json` (or point
`$GACT_THEME_FILE` anywhere) and the picker grows a `custom` entry.
Every field is optional; unset values inherit the dark baseline:

```json
{
  "name": "my-neon",
  "bg": "#0E0B1F",
  "fg": "#F0F0FF",
  "primary": "#FF5BEB",
  "secondary": "#5BEBFF",
  "warning": "#FFE55B",
  "role_user": "#5BEBFF",
  "role_assistant": "#FF5BEB"
}
```

Screenshots 62/63 show a sample custom theme applied and surfaced in
the picker.

## Keys

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Cycle focus (sidebar ↔ conversation ↔ input) |
| `Enter` (input) | Send message |
| `Shift+Enter` · `Alt+Enter` · `Ctrl+J` · `\<Enter>` | Insert newline in input |
| `↑/↓` (sidebar) | Pick session — auto-loads messages and reopens SSE |
| `↑/↓ G g` (conversation) | Scroll / jump bottom / jump top |
| `d` (conversation) | Delete the last message (optimistic) |
| `y` (conversation) | Copy last assistant message to clipboard |
| `R` (conversation) | Retry — resend last user message |
| `Ctrl+E` (conversation) | Expand latest bulky tool output in detail view |
| `a` / `r` (conversation) | Apply / reject pending diff |
| `/` (input, empty) | Open slash-command palette |
| `@` (input, word start) | Open fuzzy workspace-file picker |
| `Ctrl+G` · `Ctrl+Shift+P` | Floating compose modal (long-form editor) |
| `Ctrl+P` | Expand most recent compressed paste in-place |
| `?` | Toggle tabbed help overlay (←/→ cycles tabs) |
| `a` / `d` / `s` / `w` | Permission: allow / deny / allow-session / allow-workspace |
| `Ctrl+S` | Open Settings (Model / Agent / Theme / TUI) |
| `Ctrl+T` | Open backend metrics |
| `Ctrl+W` | Switch workspace |
| `Ctrl+X` | Cancel running scenario |
| `Ctrl+Y` | Voice transcribe (runs `--voice-cmd`; placeholder if unset) |
| `Ctrl+L` | Reload config from disk |
| `Ctrl+N` | New session |
| `Esc` | Close overlay / cancel armed action / clear input |
| `Ctrl+C` | Quit |

**Slash commands** (type `/` then filter): `/clear` (two-step confirm) ·
`/cancel` · `/new` · `/rename` · `/sessions` · `/theme` · `/scenarios` ·
`/mcp` · `/tools` · `/skills` · `/agents` · `/help` · `/diff` · `/undo`.

### Voice input

Ctrl+y posts audio bytes to the backend's `/v1/sessions/{id}/voice/transcribe`
endpoint and inserts the recognised text at the cursor. The TUI doesn't
record audio itself; it shells out to a user-supplied command:

```sh
gact --voice-cmd "scripts/voice-record.sh"
# or
GACT_VOICE_CMD="scripts/voice-record.sh" gact
# or in $XDG_CONFIG_HOME/gact/config.json:
#   {"voice_command": "scripts/voice-record.sh"}
```

The contract: the command runs synchronously, writes audio bytes to
stdout, and exits 0. See [`scripts/voice-record.sh`](./scripts/voice-record.sh)
for a reference wrapper around `arecord`/`sox`/`ffmpeg`.

## What's implemented

**Emulator** (Phase A complete — 21/21 tasks). Race-clean, ≥75% coverage on
HTTP layer, end-to-end binary tests cover the full streaming + permission
flow. See [`emulator/README.md`](./emulator) (TBD) and `STATUS.md`.

| SPEC § | Capability | Status |
|---|---|---|
| §3 | health + capabilities discovery | ✓ |
| §6.1 | workspaces CRUD + seed `ws_default` | ✓ |
| §6.2 | sessions CRUD + fork + cancel + summarize + export/import | ✓ |
| §6.3 | messages list/get/post/delete + part patch + search | ✓ |
| §6.5 | agents (read; write returns 501 per `agent_write=false`) | ✓ |
| §6.6 | tools list (`bash`, `read_file`, `edit_file`, `web_search` + 2 MCP) | ✓ |
| §6.7 | MCP server stub (`mcp_fake`) — tools, resources, prompts | ✓ |
| §6.9 | files / context / repo_map | ✓ |
| §6.10 | diffs aggregate + apply / reject / undo | ✓ |
| §6.11 | permissions list / get / respond | ✓ |
| §6.12 | providers + models (Anthropic, OpenAI, local) | ✓ |
| §6.13 | commands catalog + invoke | ✓ |
| §6.16 | metrics roll-up | ✓ |
| §7 | SSE event streams (workspace + session scope) + `Last-Event-ID` resume | ✓ |

**TUI** (Phases C through P complete). Highlights:

- Connect screen with capabilities probe + error state + auto-retry
- Sidebar with sessions list, live status dots, K11 title filter,
  `e` rename, `A` archive, `h` toggle archived, `o` add context file
- Conversation viewport with role-coloured headers, thinking /
  tool_call (`ToolName(arg)` headers) / tool_result (`⎿` glyph,
  auto-collapse ≥ 5 lines with `Ctrl+E` floating detail view) /
  file_diff / subagent_call/result / error rendering, sticky-bottom
- Message-level actions (`y` copy, `R` retry, `d` delete)
- bubbles/v2/textarea input — `Enter` sends, `Shift+Enter` newline,
  `\<Enter>` newline fallback for non-Kitty terminals, per-session
  draft preservation across session switches
- Bracketed-paste compression (`[pasted content: N lines]`) with
  `Ctrl+P` to expand, floating compose modal (`Ctrl+G` /
  `Ctrl+Shift+P`) for long prompts
- `@`-fuzzy file picker with basename bonus — inserts `@path` and
  attaches the file to session context
- 7-tab help overlay + catalog browsers for `/mcp`, `/tools`,
  `/skills`
- Settings modal with Model / Agent / Theme / TUI tabs; ↑/↓ previews
  themes live; palette persisted via `config.json`
- Seven themes + custom `~/.config/gact/theme.json` import; glamour
  markdown rendering derives its StyleConfig from the active theme
- SSE auto-reconnect with exponential backoff + jitter + Last-Event-ID
  resume
- Forward-compat: unknown part types render as a `[type]` placeholder
  rather than being silently dropped (per SPEC §8.3)

## Project layout

```
gact-tui/
├── contract/
│   ├── README.md        # design principles + compatibility targets
│   └── SPEC.md          # normative contract — read first if implementing
├── emulator/
│   ├── cmd/emulator-server/  # binary
│   ├── internal/server/      # HTTP handlers per SPEC §
│   ├── internal/store/       # in-memory state
│   ├── internal/events/      # bus + ring buffer
│   ├── internal/scenario/    # default agent script
│   └── pkg/gact/             # wire types (used by TUI too)
├── tui/
│   ├── main.go               # entry point
│   ├── internal/client/      # typed HTTP+SSE client for the contract
│   └── internal/ui/          # Bubbletea model + render
├── notes/                    # distilled reference for bubbletea/lipgloss/etc.
├── .claude/skills/           # tui-screenshot + tui-test workflows
├── screenshots/              # VHS-rendered visual record of states
├── research/                 # read-only clones of crush, opencode, aider, ...
├── PLAN.md                   # ordered task queue
├── STATUS.md                 # iteration log + decisions
└── CLAUDE.md                 # project rules for Claude sessions
```

## Testing

```sh
# Race + everything
cd emulator && go test -race -count=1 ./...
cd ../tui   && go test -race -count=1 ./...

# Coverage
cd emulator && go test -count=1 -cover ./...
```

The TUI's `internal/client` integration tests boot the actual emulator
binary over real HTTP, so they exercise the wire-format end to end.

## Visual feedback loop

For UI changes, the canonical workflow is captured in
[`.claude/skills/tui-screenshot.md`](./.claude/skills/tui-screenshot.md):

1. Build the TUI binary
2. Run a `.tape` file via VHS
3. Inspect the resulting PNG in `screenshots/`

Screenshots are committed to the repo as a visual changelog. New work
that touches the UI should add a fresh screenshot demonstrating it.
