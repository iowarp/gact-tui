# Agent Operational Memory

This document records hard rules for gact-tui work against live CLIO systems.
It exists because these points have been rediscovered too many times during
TUI, web, and desktop validation.

## CLIO Runtime Ownership

- Do not touch the shared developer CLIO runtime unless the user explicitly asks.
- In particular, do not kill or repurpose `127.0.0.1:17960`.
- For validation, start an owned CLIO backend on an owned port with isolated
  config/state/cache/data directories and an owned workspace.
- `/home/jcernuda/clio-agent` can be read and executed, but should not be
  edited by gact-tui work. Treat it as the current CLIO source/runtime owned by
  the CLIO-agent development flow.

## EarthScope/NDP Harness Configuration

- EarthScope/NDP works on this machine.
- If a gact-tui live gate reports `_UnsupportedSessionAgent`, first assume the
  gact-tui harness is misconfigured. Common causes are wrong workspace binding,
  wrong blueprint install scope, missing marketplace install, wrong cwd, missing
  MCP tool composition, or accidentally resolving a repo-local `.clio` override.
- `_UnsupportedSessionAgent` means a child expert requested tools that were not
  present in the session's composed tool set. It is not proof that NDP,
  EarthScope, or the model is broken.
- Do not use `/v1/tools` or `/v1/mcp/handshake` as proof that child-expert
  tools are composed. Useful proof is a real workspace-bound session with the
  active blueprint starting the declared MCP servers and child experts calling
  the expected prefixed tools.
- For marketplace benchmark validation, install/bind the real marketplace
  blueprint into the owned backend's active config/discovery scope. The shipped
  marketplace blueprint should use cwd-independent `uvx clio-kit@...` MCP
  entries; a repo-local `.clio` relative-path override is a test harness smell.

## Provider And Streaming Assumptions

- Real model runs should use owned CLIO with known-good ALCF configuration.
- ALCF `gemma-4` and `gpt-oss` are expected to pass when the session is
  configured correctly.
- If a provider is reported as batch/non-streaming, verify the real provider
  behavior before treating the label as truth. Do not infer real streaming
  capability from a stale classifier alone.
- For live UI validation, collect evidence from the real SSE/session behavior:
  events appearing during the turn, permission prompts when they occur, tool
  calls, generated files, and final assistant output.

## Permission Semantics

- Permission prompts are intentional product semantics.
- Keep permissions enabled when validating the UI so approval, denial, timeout,
  and blocked states are exercised and screenshotted.
- Disable permissions only for an explicitly separate non-permission benchmark
  pass, and document that choice in the evidence.

## Evidence Discipline

- The goal is not only to add tests. Drive the product as a demo user would,
  inspect screenshots, and fix presentation or interaction issues found through
  that use.
- For generated files, prove the UI can refresh the workspace and render useful
  previews: markdown, code, images, CSV/table-like data, and diffs.
- For successful live-gate sessions, archive them after screenshots and evidence
  are written unless `CLIO_LIVE_KEEP_SESSIONS=1` is set for debugging.
- When filing CLIO-agent backend issues for UI blockers, label/tag them so the
  CLIO-agent team can find gact-tui related work quickly.
