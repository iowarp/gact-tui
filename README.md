# GACT — Generic Agentic-Coder TUI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go: 1.25+](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://go.dev/dl/)

**One terminal frontend, any agentic-coder backend.** GACT is a Bubbletea
TUI that speaks a single REST + SSE contract ([`GACT v0.1`](contract/SPEC.md))
so you can drive Claude Code, OpenCode, Crush, or your own backend through
the same UI — switch by changing one URL.

| | |
|---|---|
| ![streaming](screenshots/02-streaming.png) | ![tool demarcation](screenshots/25-tool-demarcation.png) |
| Mid-stream — running badge, thinking + tool call | Claude-Code-style `ToolName(arg)` headers + `⎿` continuation |
| ![compose](screenshots/45-compose-typing.png) | ![file picker](screenshots/49-file-picker-filtered.png) |
| `Ctrl+G` long-form compose modal | `@` fuzzy workspace-file picker |

## Why

Every agentic coder ships its own UI. They diverge on small things (themes,
keybindings, paste handling) and lock you into one provider. GACT inverts
that: **define the wire contract once, build one good UI, then write thin
adapters for each backend.** Adapters live in [`adapters/`](adapters/);
the contract and conformance suite live in [`contract/`](contract/).

## Install

Requires Go 1.25+ and a 256-color (or true-color) terminal.

```sh
# Clone + build both binaries
git clone https://github.com/JaimeCernuda/gact-tui
cd gact-tui
make build && make install        # → ~/.local/bin/{gact,emulator-server}
```

Or with `go install` once tagged:

```sh
go install github.com/JaimeCernuda/gact-tui/tui@latest          # → $GOBIN/tui (rename to gact)
go install github.com/JaimeCernuda/gact-tui/emulator/cmd/emulator-server@latest
```

## Quickstart

```sh
# Terminal 1 — start the emulator backend (no API keys, no network)
emulator-server --port 7777 --timing realistic

# Terminal 2 — drive it with the TUI
GACT_BACKEND=http://localhost:7777 gact
```

Type a message and hit `Enter`. The default scenario runs an assistant
turn with thinking → tool call → tool result → final reply. Try
`delete the temp dir` to trigger the permission flow, or `propose an
edit to main.go` to see a `file_diff` part you can `a`pply or `r`eject.

## Drive a real backend

Adapters translate GACT v0.1 ↔ a vendor-specific protocol. Each one
ships as a sidecar binary you run between the TUI and the upstream:

| Backend | Adapter | Status |
|---|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) | [`adapters/claude-agent-sdk-server/`](adapters/claude-agent-sdk-server/) | Python sidecar built on Anthropic's [`claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-python) — uses your existing OAuth, full conformance ✓ |
| [OpenCode](https://github.com/opencode-ai/opencode) | [`adapters/opencode/`](adapters/opencode/) | Go proxy of the OpenCode HTTP API |
| [Crush](https://github.com/charmbracelet/crush) | [`adapters/crush/`](adapters/crush/) | Go proxy of the Crush HTTP API |
| [Goose](https://github.com/block/goose) | [`adapters/goose/`](adapters/goose/) | Go proxy of the goosed HTTP API (scaffold; sessions wiring in progress) |

Each adapter passes the [`contract/conformance`](contract/conformance/)
test suite so the TUI behaves identically across all of them.

## What you get

Highlights — full reference in [`docs/FEATURES.md`](docs/FEATURES.md):

- **7 themes + custom JSON palettes**, glamour markdown that matches
- **Settings modal**: model picker, agent picker, theme cycler, TUI prefs
- **`@`-file picker** with fuzzy basename matching, **`/`-slash palette**
  for commands, **`Ctrl+G` compose modal** for long prompts
- **Bracketed-paste compression** (collapses big pastes to
  `[pasted content: N lines]` placeholder; `Ctrl+P` expands)
- **Permission flow**: `a`llow / `d`eny / allow-`s`ession /
  allow-`w`orkspace, with a config-side rules engine to auto-resolve
- **Diff workflow**: `a`/`r` apply/reject `file_diff` parts inline
- **CLI subcommands** for shell-script automation (`gact ask`,
  `gact log`, `gact dashboard`, `gact bench`, etc. — see FEATURES.md
  for the full ~70-command reference)
- **Plugin loader** under `~/.config/gact/plugins/<name>/plugin.json`

## Build it for your own backend

1. Read [`contract/SPEC.md`](contract/SPEC.md) — every endpoint your
   adapter has to implement (or explicitly opt out of via
   `capabilities.<flag> = false`).
2. Write a Go adapter under `adapters/<name>/` (mirror `crush/` or
   `opencode/`'s shape — server.go, transport.go, translate.go).
3. Add a `conformance_test.go` that calls
   `conformance.Run(t, srv.URL, opts)` against a mocked upstream.
4. Open a PR.

The conformance suite ([`contract/conformance/README.md`](contract/conformance/README.md))
locks 14+ sections including per-id drill-downs, SSE envelope rules
(SPEC §7.2), and the full diff/file/MCP catalog endpoints. If your
adapter passes it, the TUI works.

## Project layout

- [`tui/`](tui/) — the Bubbletea client
- [`emulator/`](emulator/) — reference backend (boots in ~50ms, no deps)
- [`contract/`](contract/) — SPEC + conformance suite
- [`adapters/`](adapters/) — vendor-specific bridges
- [`docs/FEATURES.md`](docs/FEATURES.md) — every keybinding, CLI command,
  capability matrix, theme details, voice plumbing

## Contributing

Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Run
`make test-race` before pushing. UI changes need a fresh screenshot in
`screenshots/` — see
[`.claude/skills/tui-screenshot.md`](.claude/skills/tui-screenshot.md).

## License

MIT — see [LICENSE](LICENSE).
