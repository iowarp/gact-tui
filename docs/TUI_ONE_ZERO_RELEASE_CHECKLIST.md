# GACT TUI 1.0 Release Checklist

Date: 2026-06-11

This checklist is the current release-readiness gate for the Bubble Tea TUI.
The 0.9 audit documents a completed historical pass; do not use it as proof
that 1.0 is ready. 1.0 is ready only when the current release-candidate commit,
installed binary, CI, visual-loop corpus, and manual terminal evidence all
agree.

## Historical Tracking Scope

The original 1.0 hardening umbrella issues are closed and should be treated as
historical evidence, not as the current open-issue list:

- #93: CLIO capability parity and gating matrix (closed)
- #104: manual verification umbrella (closed)
- #105: mouse and semantic hit-target audit (closed)
- #106: settings, provider, and configuration UX (closed)
- #107: terminal copy, paste, and text selection (closed)
- #108: visual-loop benchmark acceptance suite (closed)
- #109: sidebar module ordering, context, files, and layout semantics (closed)
- #110: release packaging, version metadata, and CI readiness (closed)
- #113: CLIO semantic execution events end to end (closed)

## Current Tracking Scope

For the active CLIO contract/TUI parity work, PR #148 is the release-candidate
branch under review. The following open issues must be closed, merged by PR
#148, or explicitly deferred before tagging a TUI release:

- #128: durable Agent Blueprint marketplace-source management.
- #129: Agent Blueprint modal scroll/background behavior.
- #130: active Agent Blueprint indicator usefulness.
- #134: stable session trace rendering across navigation.
- #136: readable semantic event feed with raw payloads behind details.
- #137: user-facing Agent Blueprint timeline summaries.
- #141: prompts, agents, skills, and expert-pack catalog purpose and empty states.
- #142: tree/table views for agents and Agent Blueprints.
- #143: Agent Blueprint marketplace/source install and validate workflow.
- #145: ensure `clio` launcher uses the freshly built/installed TUI binary.
- #149: four NDP demo cases need real TUI short GIFs plus live-run streaming proof manifests.
- #150: live terminal copy and selection permutations.
- #151: real CLIO doctor gaps and active-stream metrics.
- #152: large live runtime catalogs and registry-backed MCP/source lifecycle.
- #153: live prompt save and expert-pack lifecycle success paths.
- #154: real ALCF provider failure, recovery, and retry override warning.

## Release-Candidate Identity

Run these from the release-candidate branch before visual or manual testing:

```bash
git status --short
git rev-parse --short=12 HEAD
which clio
make install-for-clio
make verify-clio-install
gact version
gact diag
```

Acceptance:

- `make verify-clio-install` proves both shell `gact` and CLIO-launched `gact`
  resolve to this checkout's `tui/gact`.
- `which clio` identifies the launcher being used for the demo so stale PATH
  assumptions are explicit in the release notes.
- `gact version` reports the current short revision, contract version, Go
  runtime, and dirty state.
- `gact diag` reports `path_gact_status: matches running binary` and
  `clio_gact_status: matches running binary`; any stale path blocks the demo
  candidate.
- Any dirty state is explained in the verification notes. Untracked or modified
  visual artifacts must not be mistaken for release-candidate source changes.

## Automated Gates

Run the focused TUI gates first:

```bash
go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact ./emulator/internal/server -count=1
go test -p 1 ./tui -run 'TestCLI_(VersionReportsBuildMetadata|DumpBundle|Env|Capabilities)' -count=1
python3 -m unittest visual_loop/test_check_visual_corpus.py visual_loop/test_check_slash_command_coverage.py visual_loop/test_assert_live_observability.py
python3 visual_loop/check_visual_corpus.py --root . --require-git-tracked --require-indexed --require-strict-live-pass
python3 visual_loop/check_visual_corpus.py --root . --require-indexed --require-ndp-demo-ready
python3 visual_loop/check_copy_selection_readiness.py --root . --strict
python3 visual_loop/check_diagnostics_readiness.py --root . --strict
python3 visual_loop/check_live_lifecycle_readiness.py --root . --strict
python3 visual_loop/check_provider_recovery_readiness.py --root . --strict
python3 visual_loop/check_agent_blueprint_marketplace_readiness.py --root . --strict
```

Run broader workspace gates before marking the release PR ready:

```bash
make fmt
make vet
make test
```

Acceptance:

- CI is green on the release PR or the failed job has a linked fix/deferral.
- The visual corpus strict gate passes in a clean checkout, not only on a local
  machine with untracked screenshots; the same gate also fails slash-command
  drift between the palette, Help Commands, and
  `SLASH_COMMAND_VISUAL_COVERAGE.md`.
- The NDP demo gate is run separately when validating the four-case demo. It is
  expected to fail until all four cases have real TUI visuals, short GIFs, and
  live-run streaming proof manifests, not merely deterministic screenshots or
  artifact-producing manifests.
- The readiness scripts with `--strict` prove maintained deterministic evidence
  for copy/selection, diagnostics, lifecycle, provider, and Agent Blueprint
  marketplace surfaces. Their `--strict-live` modes are only for the final
  owned-backend evidence pass and are expected to fail until #150-#154 and the
  live part of #128/#143 have corresponding manifests/screenshots.
- The maintained 1.0
  [capability matrix](TUI_ONE_ZERO_CAPABILITY_MATRIX.md) and Doctor rows agree
  with every decoded capability field.

## Visual Loop

Before release, inspect the maintained corpus rather than relying only on unit
tests:

```bash
python3 visual_loop/check_visual_corpus.py --root . --require-git-tracked --require-indexed --require-strict-live-pass
python3 visual_loop/check_visual_corpus.py --root . --require-indexed --require-ndp-demo-ready
python3 visual_loop/check_copy_selection_readiness.py --root . --strict
python3 visual_loop/check_diagnostics_readiness.py --root . --strict
python3 visual_loop/check_live_lifecycle_readiness.py --root . --strict
python3 visual_loop/check_provider_recovery_readiness.py --root . --strict
python3 visual_loop/check_agent_blueprint_marketplace_readiness.py --root . --strict
python3 visual_loop/assert_live_observability.py \
  visual_loop/screenshots/<capture>.jsonl \
  --mode benchmark-hierarchy \
  --report visual_loop/screenshots/<capture>.strict.report.md
```

Acceptance:

- Conversation/tools, MCP reconnect, marketplace/Agent Blueprint lifecycle,
  sidebars, settings/provider, ask-user/retry, semantic live events, and
  benchmark replay screenshots are present and readable.
- Screenshots show summaries and surfaced errors, not hidden backend failures or
  raw JSON walls where summaries are expected.
- The `slash_command_coverage` section reports every canonical operator command
  documented and visible in Help Commands, with folded aliases absent from Help.
- The `ndp_demo_readiness` section reports CLIO artifact proof, deterministic
  TUI proof, real TUI visuals, short GIF recordings, live-run streaming proof
  manifests, and ready case counts; use `--require-ndp-demo-ready` only for the
  final four-case NDP demo gate.
- Temporal assertions prove route/delegation/tool-start/tool-complete/parent
  resume evidence appears before final completion for the benchmark hierarchy
  path tracked in #113.

## Manual Terminal Matrix

Manual evidence must be captured in PR #148, in the specific issue being closed,
or in the current live-demo proof issue (#149 for the four-case NDP recordings).
Use #150-#154 for their corresponding terminal, diagnostics, runtime lifecycle,
prompt/expert-pack lifecycle, and provider recovery proof instead of burying
those artifacts in unrelated comments.
At minimum verify:

- Current Linux/WSL terminal path.
- Target ALCF or remote terminal path.
- One local terminal path with mouse mode enabled.
- Keyboard-only operation for the same surfaces.

Required workflows:

- `gact agent connect visual-benchmark` against current CLIO `develop`.
- At least one fresh non-benchmark session.
- Settings/model/provider configuration, including provider errors.
- Copy from conversation footer actions, selected conversation blocks,
  detail/raw views, and clipboard failure messaging.
- Capture `gact diag` clipboard and terminal-selection rows:
  `mouse_capture`, `clipboard_native`, `clipboard_missing`, `clipboard_osc52`,
  `terminal_selection`, `TERM`, and `TERM_PROGRAM`; use `/mouse` while
  comparing mouse-capture and native terminal text selection behavior.
- Paste into main input, compose, ask/retry, rename, context-add, prompt edit,
  MCP install, workspace-create, and agent write modals.
- Mouse hit targets for header buttons, sidebars, context/files, settings,
  provider, palette/help/doctor, details, and close/back buttons.
- Sidebar layout, right-sidebar placement, file picker tree expansion, and
  Agents+Files runtime sidebar visual proof.
- Context file preview and attachment upload when CLIO advertises the
  corresponding capabilities.
- MCP reconnect from `/mcp`, including truthful reconnect success/failure and
  global `session_id=""` notification/semantic event handling.
- Agent Blueprint marketplace/source workflows: source provenance, install,
  validate, protected built-in actions, workspace update/delete actions,
  validation warnings/errors, MCP trust/metadata, and packaged command rows.
- Permission, user-question, retry, rewind, semantic-event, and runtime
  provenance flows.

Acceptance:

- No canned/fake fallback response hides a CLIO/backend error.
- No sidebar/right-sidebar click leaks into conversation selection.
- Text selection quality is documented for mouse and non-mouse modes.
- Any remaining manual gap has a linked follow-up issue and an explicit
  non-blocking rationale before 1.0 tagging.

## Final Decision

Do not tag 1.0 until:

- All release-blocking TUI issues are closed or explicitly deferred.
- The installed `gact` binary matches the release-candidate commit.
- CI is green on the release PR.
- Visual-loop screenshots and temporal reports are inspected.
- Manual smoke notes are captured with exact dates, terminals, backend commits,
  TUI commit, and commands used.
