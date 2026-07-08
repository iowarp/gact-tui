# GACT — Generic Agentic TUI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go: 1.25+](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://go.dev/dl/)
[![Contract: v0.2](https://img.shields.io/badge/Contract-v0.2-blueviolet.svg)](contract/SPEC.md)

<p align="center">
  <img src="apps/design/assets/brand/Banner.png" alt="GACT banner" width="100%" />
</p>

**Building a TUI for an agentic loop is hard** — permission prompts, streaming
partials, tool gating, diff apply/reject, MCP catalogs, SSE reconnects,
per-session state. Every coder (Claude Code, OpenCode, Crush, Goose, …) re-solves
these differently and locks you into its own UI.

**GACT inverts that:** define the wire contract once, build one good TUI, then
write a thin adapter per backend. If your agent speaks [**GACT v0.2**](contract/SPEC.md)
— REST + SSE — the TUI just works. It's **extendable** (drop in an adapter),
**modifiable** (Lipgloss themes and Bubbletea components all the way down), and
**scriptable** (~70 CLI subcommands alongside the interactive TUI).

The canonical backend is [iowarp/clio-agent](https://github.com/iowarp/clio-agent),
a scientific-data agent that drives 28 of 30 v0.2 capabilities end-to-end. See
[`screenshots/README.md`](screenshots/README.md) for live captures of every
advertised feature.

|  |  |
|---|---|
| ![streaming](screenshots/02-streaming.png) | ![tool demarcation](screenshots/25-tool-demarcation.png) |
| Mid-stream — running badge, thinking + tool call | Claude-Code-style `ToolName(arg)` headers + `⎿` continuation |
| ![compose](screenshots/45-compose-typing.png) | ![file picker](screenshots/49-file-picker-filtered.png) |
| `Ctrl+G` long-form compose modal | `@` fuzzy workspace-file picker |

## Quick tour

Two ways to run — pick the one that matches your stack.

**Against the reference emulator (no API keys, no network):**
```sh
emulator-server --port 7777 --timing realistic &
GACT_BACKEND=http://localhost:7777 gact
```

**Against your real agent (Claude Code):**
```sh
gact agent deploy claudecode myclaude   # spawns the adapter detached
gact connect myclaude                   # interactive TUI
# Ctrl+Z detaches the TUI; the adapter keeps running.
gact resume                             # comes back where you were
gact agent stop myclaude                # when you're done
```

**Scripting, without the TUI:**
```sh
gact dashboard --sort newest                      # live sessions table
gact ask <sid> "summarise the diff"               # one-shot Q&A
gact log <sid> --role assistant --grep "error"    # filter conversation
```

Inside the TUI: type a message, then watch the thinking stream, the tool call
fire, the result render, and the reply stream back. Try `delete the temp dir`
for the permission flow, or `propose an edit to main.go` for a `file_diff` you
can `a`pply or `r`eject.

## Install

Requires Go 1.25+ and a 256-color (or true-color) terminal.

```sh
git clone https://github.com/iowarp/gact-tui
cd gact-tui
make build && make install        # → ~/.local/bin/{gact,emulator-server}
```

Optional local file previews (images, PDF, HTML, scientific formats) use external
renderers when available — `make file-renderers-check` /
`make install-file-renderers`, or [`docs/FILE_RENDERERS.md`](docs/FILE_RENDERERS.md).

## Drive a real backend

Adapters translate **GACT v0.2 ↔ a vendor protocol**, shipped as a sidecar binary
you run between the TUI and the upstream. Each passes the
[`contract/conformance`](contract/conformance/) suite, so the TUI behaves
identically across all of them.

| Backend | Adapter | Notes |
|---|---|---|
| [Claude Code](https://github.com/anthropics/claude-code) (recommended) | [`adapters/claudecode/`](adapters/claudecode/) | Native Go — drives `claude --output-format stream-json` directly; no Python runtime |
| Claude Code (Python) | [`adapters/claude-agent-sdk-server/`](adapters/claude-agent-sdk-server/) | Python sidecar on `claude-agent-sdk`; feature-equivalent to the Go adapter |
| [OpenCode](https://github.com/opencode-ai/opencode) | [`adapters/opencode/`](adapters/opencode/) | Go proxy of the OpenCode HTTP API |
| [Crush](https://github.com/charmbracelet/crush) | [`adapters/crush/`](adapters/crush/) | Go proxy of the Crush HTTP API |
| [Goose](https://github.com/block/goose) | [`adapters/goose/`](adapters/goose/) | Go proxy of the goosed HTTP API |
| [CLIO Agent](https://github.com/iowarp/clio-agent) | *(in-process, Python)* | v0.2 native: tier-1→tier-2 routing, memory stats, tool telemetry, cost tracking, forks, permissions, two-phase edits |

### The CLIO backend

The one-line CLIO installer drops a `clio` launcher on your PATH — the supported
path for the reference stack:

```sh
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh | bash
clio                                          # ensure server up, attach TUI

# Windows (PowerShell)
irm https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex
clio
```

On first launch the TUI pops the LM-provider modal — pick a preset (OpenAI,
Anthropic, OpenRouter, LM Studio, Ollama, Codex, ALCF), paste a key if needed, and
the next turn uses it. Tool servers (HDF5, Parquet) need extra config — see
[CLIO's provider docs](https://github.com/iowarp/clio-agent/blob/main/docs/providers/README.md).

## Build an adapter for your own backend

1. **Read the contract.** Every endpoint your adapter implements (or opts out of
   via `capabilities.<flag> = false`) is in [`contract/SPEC.md`](contract/SPEC.md).
2. **Fork an existing adapter.** `adapters/crush/` and `adapters/opencode/` are
   compact Go proxies you can read in one sitting — an HTTP router (`server.go`),
   an upstream client, and a schema-translation layer (`translate.go`).
3. **Run conformance.** Add a `conformance_test.go` that boots your adapter and
   calls `conformance.Run(t, srv.URL, opts)`. The suite locks session CRUD, the
   SSE envelope shapes, MCP drill-downs, diffs, agents, tools, metrics,
   workspaces, and permissions.
4. **Open a PR.** If conformance passes, the TUI just works.

The TUI is feature-gated on `GET /v1/capabilities`: an adapter that doesn't
implement, say, `capabilities.diffs` automatically hides the diff workflow — no
per-adapter TUI code.

## What you get

A quick taste — the full keybinding / CLI / capability reference is in
[`docs/FEATURES.md`](docs/FEATURES.md):

- **Themes** — 7 built-ins (Dracula, Nord, Tokyo Night, Solarized, …) plus custom JSON palettes
- **Input** — `@`-file picker, `/`-slash palette, `Ctrl+G` compose modal, bracketed-paste compression
- **Permissions** — `a`/`d` / allow-session / allow-workspace, plus a config rules engine
- **Diffs** — `a`/`r` apply/reject `file_diff` parts inline
- **Session resume** — `Ctrl+Z` clean detach → `gact resume`, surfaced across header, sidebar, and dashboard
- **CLI** — ~70 subcommands (`ask`, `send`, `log`, `follow`, `dashboard`, `grep`, `dump-bundle`, completions)
- **Plugins** — loaded from `~/.config/gact/plugins/<name>/plugin.json`

## Tests

```sh
make test        # emulator + tui + conformance + every adapter
make test-race   # same, under -race
```

All tests pass in CI. UI changes re-record their VHS tapes under
`tui/testdata/tapes/` (see the `tui-screenshot` skill).

## Project layout

- [`tui/`](tui/) — the Bubbletea client + CLI subcommands
- [`emulator/`](emulator/) — reference backend (boots in ~50ms, no deps)
- [`contract/`](contract/) — [**SPEC.md**](contract/SPEC.md) + the conformance suite every adapter must pass
- [`adapters/`](adapters/) — Claude Code (Go + Python), OpenCode, Crush, Goose
- [`apps/`](apps/) — the web + desktop frontends (pnpm workspace)
- [`docs/`](docs/README.md) — all documentation, indexed by [`docs/README.md`](docs/README.md)

## Contributing

Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
Run `make test-race` before pushing; UI changes need a fresh screenshot in
`screenshots/`. See [`CLAUDE.md`](CLAUDE.md) for the full working rules.

## License

MIT — see [LICENSE](LICENSE).
