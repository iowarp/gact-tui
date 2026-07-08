# GACT TUI documentation

Everything that documents the GACT TUI stack lives here. Start with the
[root README](../README.md) for orientation; this page indexes the rest.

## Current

- [FEATURES.md](FEATURES.md) — long-form feature reference for the whole stack
  (TUI, web, desktop); the companion to the root README.
- [FILE_RENDERERS.md](FILE_RENDERERS.md) — how the file-explorer detail pane
  previews local workspace files, per type.
- [agent-operational-memory.md](agent-operational-memory.md) — hard rules for
  agents doing gact-tui work against live CLIO systems.
- [system-cleanup-2026-07.md](system-cleanup-2026-07.md) — pointer doc for the
  2026-07 audit cleanup program (master plan lives in the clio-agent repo).
- [man/gact.1](man/gact.1) — the `gact` command-line man page.

## Reference

Distilled library cheatsheets for the Go/Bubbletea UI work (`reference/`):

- [reference/bubbletea.md](reference/bubbletea.md) — Bubbletea v2 (`charm.land/bubbletea/v2`).
- [reference/bubbles.md](reference/bubbles.md) — the Bubbles component set.
- [reference/lipgloss.md](reference/lipgloss.md) — Lipgloss styling.
- [reference/ultraviolet.md](reference/ultraviolet.md) — Ultraviolet rendering notes.
- [reference/testing.md](reference/testing.md) — TUI testing patterns.
- [reference/pitfalls.md](reference/pitfalls.md) — common gotchas to avoid.

External design studies and target renderings (`ref/`):

- [ref/README.md](ref/README.md) — index of the reference studies (guidance, not copying).
- [ref/hermes-agent-desktop.md](ref/hermes-agent-desktop.md) — study of NousResearch's Hermes Agent Desktop.
- `ref/*.png`, `ref/examples/` — static target renderings and competitor diffs used
  when reasoning about the TUI's look (not a build input).

## Release & operations

- [TUI_ONE_ZERO_CAPABILITY_MATRIX.md](TUI_ONE_ZERO_CAPABILITY_MATRIX.md) — the 1.0 capability matrix.
- [TUI_ONE_ZERO_RELEASE_CHECKLIST.md](TUI_ONE_ZERO_RELEASE_CHECKLIST.md) — the 1.0 release checklist.
- [history-rewrite-runbook.md](history-rewrite-runbook.md) — owner runbook for the
  prepared (not yet executed) git-history rewrite that de-bloats screenshot churn.

## Archive

Historical work-logs and superseded designs live in [archive/](archive/) —
indexed by [archive/README.md](archive/README.md). It holds the retired planning
and status logs, the v0.9 readiness / v0.2 feature snapshots, the retired `apps/`
planning docs (`apps-*.md`), and the superseded `apps/` design series
(`apps-design/01-goal` … `08-decisions`). Nothing there is current — durable status
lives in GitHub issues and PRs.
