# Workspace documentation

Start with the [root README](../README.md). The active product documentation is
deliberately small so deleted implementations do not continue to influence the
workspace.

## Current

- [Frontend decisions](design/frontend-decisions.md) records semantic and visual
  departures from the retired web clients, with acceptance evidence.
- [Agent operational memory](agent-operational-memory.md) contains safety rules for
  exercising real scientific sessions.
- [Provenance graph](design/provenance-graph-2026-08.md) describes the current
  scientific provenance model.

## Deferred TUI reference

The Bubble Tea notes under `reference/`, the visual studies under `ref/`, and
the `gact(1)` man page are retained only for a future TUI redesign. They are not
the web or desktop product specification and are outside the default build and
test gates.

Superseded frontend plans, emulator-era operating instructions, conformance
maps, and archived screenshots-as-spec documents have been removed. Durable
history remains available in Git.
