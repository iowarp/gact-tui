# Workspace documentation

Start with the [root README](../README.md). The active product documentation is
deliberately small so deleted implementations do not continue to influence the
workspace.

## Current

- [Frontend decisions](design/frontend-decisions.md) records semantic and visual
  departures from the retired web clients, with acceptance evidence.
- [CLIO visual language](design/visual-language/README.md) is the visual
  reference for the Web and Desktop redesign. It contains self-contained HTML
  pages and previews. It is a proposal and is not implemented yet.
- [RC1 UI campaign](design/rc1-campaign.md) is the charter for implementing that
  reference across Web and Desktop.
- [Performance and screenshots](perf-and-screens.md) documents `pnpm perf`,
  `pnpm screens`, the budgets and the [current baseline](perf/baseline/README.md).
- [Agent operational memory](agent-operational-memory.md) contains safety rules for
  exercising real scientific sessions.
- [Provenance graph](design/provenance-graph-2026-08.md) describes the current
  scientific provenance model.

## Deferred TUI reference

The TUI is frozen and unsupported for current CLIO. Do not use it for
installation, deployment or acceptance, including from Claude Code. Use Web or
Desktop. The retained source and notes are for a future upgrade.

The Bubble Tea notes under `reference/`, the visual studies under `ref/`, and
the `gact(1)` man page are retained only for a future TUI redesign. They are not
the web or desktop product specification and are outside the default build and
test gates.

Superseded frontend plans, emulator-era operating instructions, conformance
maps, and archived screenshots-as-spec documents have been removed. Durable
history remains available in Git.
