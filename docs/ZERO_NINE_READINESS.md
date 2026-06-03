# GACT TUI 0.9 Readiness Audit

Date: 2026-05-29

Historical note: this document records the completed 0.9 hardening pass from
May 2026. It is not the current 1.0 release gate. Use
[TUI_ONE_ZERO_RELEASE_CHECKLIST.md](TUI_ONE_ZERO_RELEASE_CHECKLIST.md) for the
current release-candidate checklist, installed-binary checks, visual-loop gates,
and manual terminal matrix.

## Current Status

The TUI is release-candidate ready for a 0.9 PR merge. Capability parity, visual benchmark replay, terminal hardening, and release verification have all been completed from the current checkout.

Current local state:

- Branch: `develop`
- Remote: `iowarp/gact-tui`
- Open TUI 0.9 blocker issues: none
- Open PRs: `#74 feat(apps): scaffold harness...` only; this is web/apps work and should remain untouched by TUI release hardening
- Local TUI has uncommitted 0.9 hardening changes for capability parity, agent CRUD/extraction, prompt/blueprint management, clipboard fallback, sidebar module layout, paste buffering, ARC labeling, route-chain rendering, refreshed goldens, and refreshed VHS screenshots

## Verification Run

Passing:

- `scripts/release-verify.sh`
- `go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact -count=1`
- `go build -p 1 -o tui/gact ./tui`
- `go test -p 1 ./... -count=1` from `emulator/`
- `go test -p 1 ./... -count=1` from `contract/conformance/`
- `go test -p 1 ./... -count=1` from `adapters/opencode/`
- `go test -p 1 ./... -count=1` from `adapters/crush/`
- `go test -p 1 ./... -count=1` from `adapters/goose/`
- VHS refreshed and inspected:
  - `visual_loop/screenshots/live_alcf_20260525_ndp_bottom.png`
  - `visual_loop/screenshots/live_alcf_20260525_ndp_scrolled_up.png`
  - `visual_loop/screenshots/live_alcf_20260525_ndp_after_g.png`
  - `visual_loop/screenshots/live_alcf_20260525_ndp_after_pagedown.png`
  - `visual_loop/screenshots/live_alcf_20260525_expected_errors.png`
  - `visual_loop/screenshots/live_alcf_20260525_expected_error_detail.png`
  - `visual_loop/screenshots/live_alcf_20260525_agents_catalog.png`
  - `visual_loop/screenshots/live_alcf_20260525_agent_detail.png`
  - `visual_loop/screenshots/live_alcf_20260525_skills_catalog.png`
  - `visual_loop/screenshots/live_alcf_20260525_tools_catalog.png`
  - `visual_loop/screenshots/live_alcf_20260525_tool_detail.png`
  - `visual_loop/screenshots/live_alcf_20260525_mcp_catalog.png`
  - `visual_loop/screenshots/live_alcf_20260525_mcp_detail.png`
  - `visual_loop/screenshots/live_alcf_20260525_memory_palette.png`
  - `visual_loop/screenshots/live_alcf_20260525_memory_inspector.png`
  - `visual_loop/screenshots/live_alcf_20260525_memory_inspector_pagedown.png`
  - `visual_loop/screenshots/live_alcf_20260525_nanoagents_collapsed.png`
  - `visual_loop/screenshots/live_alcf_20260525_nanoagents_expanded.png`
  - `visual_loop/screenshots/live_alcf_20260525_nanoagent_child_open.png`
  - `visual_loop/screenshots/live_alcf_20260525_provider_swap_top.png`
  - `visual_loop/screenshots/live_alcf_20260525_provider_swap_bottom.png`
  - `visual_loop/screenshots/live_alcf_20260525_compaction_top.png`
  - `visual_loop/screenshots/live_alcf_20260525_compaction_detail.png`
  - `visual_loop/screenshots/live_alcf_20260525_compaction_bottom.png`
  - `visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_header_focused.png`
  - `visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_collapsed.png`
  - `visual_loop/screenshots/live_alcf_20260525_sidebar_context_focused.png`
  - `visual_loop/screenshots/live_alcf_20260525_sidebar_sections_collapsed.png`
  - `visual_loop/screenshots/live_alcf_20260525_sidebar_sections_expanded.png`
  - `visual_loop/screenshots/issue57_ask_user_retry.png`
  - `visual_loop/screenshots/issue57_ask_user_answer_modal.png`
  - `visual_loop/screenshots/issue57_retry_notes_modal.png`
  - `visual_loop/screenshots/issue57_retry_model_modal.png`
  - `visual_loop/screenshots/semantic_prompt_catalog.png`
  - `visual_loop/screenshots/semantic_prompt_profiles.png`
  - `visual_loop/screenshots/semantic_prompt_detail.png`
  - `visual_loop/screenshots/semantic_prompt_editor.png`
  - `visual_loop/screenshots/semantic_prompt_saved.png`
  - `visual_loop/screenshots/semantic_header_actions_base.png`
  - `visual_loop/screenshots/semantic_sidebar_layout_editor_right.png`
  - `visual_loop/screenshots/semantic_agent_management_catalog.png`
  - `visual_loop/screenshots/semantic_agent_management_create.png`
  - `visual_loop/screenshots/semantic_agent_management_extract.png`
  - `visual_loop/screenshots/semantic_agent_management_detail.png`
  - `visual_loop/screenshots/semantic_agent_management_clone.png`
  - `visual_loop/screenshots/semantic_agent_management_cloned.png`
  - `visual_loop/screenshots/semantic_agent_management_edit.png`
  - `visual_loop/screenshots/semantic_agent_management_updated.png`
  - `visual_loop/screenshots/semantic_agent_management_deleted.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_install.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_installed.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_validate.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png`
  - `visual_loop/screenshots/semantic_agent_blueprint_management_updated.png`

Blocked or failing:

- `go test -p 1 ./... -count=1` from repo root is not a valid workspace command because the repo uses `go.work` module subdirectories.
- Real Claude Code adapter smokes are no longer part of the routine release command. They are gated behind `GACT_REAL_CLAUDE_SMOKE=1` so a machine with `claude` on PATH cannot accidentally hang a release run.

## Capability Gaps

The maintained matrix is in [ZERO_NINE_CAPABILITY_MATRIX.md](ZERO_NINE_CAPABILITY_MATRIX.md).

CLIO `develop` currently advertises these relevant standard and `x_clio_*` surfaces:

- Standard: `agent_write`, `skills_extraction`, `agent_routing`, `memory`, `structured_errors`, `integration_health`, `tool_telemetry`
- CLIO extension: cancellation, executor cancellation, text streaming mode, synthetic posthoc streaming, stream fallback reasons, direct delete permissions, prompt registry, expert packs, agent blueprints, user questions, retry attempts, context frames, capability gaps

TUI support is now release-grade for the 0.9 capability set:

- Surfaced: prompt registry browse/render/validate/save/reload, expert pack browse/detail, agent blueprint browse/install/validate/activate/update/delete/MCP enable, user-question answer lifecycle, retry attempts and retry-with-model, context frame list/detail fetch, memory inspector, permissions inspector, routing/handoff rendering, tool telemetry rendering, agent CRUD/extraction, and capability-gap drill-downs.
- Gated: CLIO cancellation/executor cancellation are visible in Doctor and rely on active request/session state rather than a standalone 0.9 management workflow.
- Visual proof: current CLIO benchmark sessions were replayed through the TUI, screenshots were inspected, and backend/tool errors remain visible rather than being replaced by canned text.

## 0.9 Blockers

1. Capability parity and gating
   - Tracking issue: https://github.com/iowarp/gact-tui/issues/93
   - Every advertised CLIO capability must be either fully surfaced in the TUI, explicitly marked partial with a useful drill-down, or hidden/disabled with a clear reason.
   - The TUI must not silently ignore new `x_clio_*` flags that affect user expectations.
   - Current implementation: Doctor renders backend support separately from TUI support, and tests enforce row coverage for every decoded capability field.

2. Agent and blueprint management workflows
   - Tracking issues: https://github.com/iowarp/gact-tui/issues/94 and https://github.com/iowarp/gact-tui/issues/95
   - `agent_write` and `skills_extraction` need real TUI workflows: create, edit, delete, clone/extract from session, validate, and activate.
   - File-backed agent blueprint editing must be discoverable and safe enough for users to understand where changes are stored.
   - Current implementation: `/agents-list` exposes create and current-session extraction; agent detail exposes clone, edit, and user-agent delete; the edit modal updates title, description, system prompt, tools, keywords, and enabled state; emulator and client methods cover create/update/delete/extract endpoints for visual and unit proof.
   - Current implementation for #95: `/agent-blueprints` exposes install and validate action rows, blueprint detail exposes activate/update/delete/MCP-enable rows, unsupported built-in destructive actions are visibly disabled, validation opens a detail view with parsed blueprint/agents/MCP descriptors, and prompt/profile browse/render/validate/save/reload remains covered by the prompt catalog/editor screenshots.

3. Visual benchmark acceptance
   - Tracking issue: https://github.com/iowarp/gact-tui/issues/96
   - Replay current CLIO benchmark evidence through `gact agent connect visual-benchmark`.
   - Capture deterministic screenshots for routing, nanoagents, memory/context, provider swap, errors, questions/retry, prompts, expert packs, and agent blueprints.
   - Inspect screenshots for alignment, mouse hitboxes, scroll reachability, raw JSON walls, and error visibility.
   - Current implementation: refreshed ALCF/live CLIO benchmark tapes prove scroll-to-bottom, expected errors, agent/skill/tool/MCP catalogs, memory/context pressure, nanoagent child sessions, provider swap, compaction detail, and sidebar section behavior. During inspection, `live_alcf_20260525_compaction_detail.png` exposed an over-tall detail modal; `detailPageSize` was tightened and covered by `TestDetailShortPayloadUsesCompactSharedBodyHeight`.

4. Release verification and CI shape
   - Tracking issue: https://github.com/iowarp/gact-tui/issues/97
   - Add or document a reliable workspace-level verification command that does not fail at repo root.
   - Make real-Claude adapter smoke tests release-safe: deterministic enough for CI/manual release, or explicitly gated so failures mean real regressions.
   - Build and install the exact binary under test before visual verification.
   - Current implementation: `scripts/release-verify.sh` runs gofmt, vet, build, tests for every `go.work` module, then builds `tui/gact`; real Claude smokes require `GACT_REAL_CLAUDE_SMOKE=1`.

5. Terminal environment hardening
   - Tracking issue: https://github.com/iowarp/gact-tui/issues/98
   - Validate copy/paste in local terminal, WSL/ttyd, and ALCF login paths.
   - Clipboard provider chain must truthfully report native success, OSC52 fallback, or total failure.
   - Multi-line paste must compact consistently whether delivered as `PasteMsg` or key events.

6. Documentation and release criteria
   - Add a 0.9 capability matrix and acceptance checklist.
   - Document exact commands for tests, builds, visual-loop replay, and release tagging.
   - Keep `feat/apps-harness` out of TUI release hardening unless explicitly requested.

## Overnight Objective

Completed 0.9 readiness for the Bubble Tea TUI:

1. Start from `develop`, preserve the current TUI hardening changes, and open a TUI-only PR.
2. Implement missing CLIO parity for agent CRUD/extraction and blueprint/prompt management gaps.
3. Add a maintained 0.9 capability matrix that maps CLIO `develop` flags to TUI support status and tests.
4. Stabilize release verification commands, including adapter smoke handling.
5. Run current CLIO benchmark sessions through the TUI without rerunning benchmarks unless CLIO trace semantics change.
6. Refresh and inspect visual-loop screenshots for all 0.9 acceptance workflows.
7. Close the 0.9 blocker issues only after code, tests, and screenshots agree.

## Acceptance Criteria

- No open TUI 0.9 blocker issues.
- TUI, client, emulator, conformance, and non-CLIO adapters pass from documented commands.
- Claude adapter smoke behavior is intentionally gated with a documented manual command.
- `gact` on PATH is the exact rebuilt binary.
- Current CLIO benchmark evidence is visible and understandable through the TUI.
- The capability matrix has no unexplained `partial` or `unknown` rows.
- Visual artifacts are refreshed under `visual_loop/screenshots/` and inspected.
