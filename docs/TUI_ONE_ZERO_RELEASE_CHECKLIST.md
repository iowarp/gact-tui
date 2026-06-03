# GACT TUI 1.0 Release Checklist

Date: 2026-06-03

This checklist is the current release-readiness gate for the Bubble Tea TUI.
The 0.9 audit documents a completed historical pass; do not use it as proof
that 1.0 is ready. 1.0 is ready only when the current release-candidate commit,
installed binary, CI, visual-loop corpus, and manual terminal evidence all
agree.

## Current Tracking Scope

Open TUI hardening issues that must be closed or explicitly deferred before
tagging 1.0:

- #93: CLIO capability parity and gating matrix
- #104: manual verification umbrella
- #105: mouse and semantic hit-target audit
- #106: settings, provider, and configuration UX
- #107: terminal copy, paste, and text selection
- #108: visual-loop benchmark acceptance suite
- #109: sidebar module ordering, context, files, and layout semantics
- #110: release packaging, version metadata, and CI readiness
- #113: CLIO semantic execution events end to end

## Release-Candidate Identity

Run these from the release-candidate branch before visual or manual testing:

```bash
git status --short
git rev-parse --short=12 HEAD
make dev-install
make verify-dev-install
gact version
```

Acceptance:

- `make verify-dev-install` proves both shell `gact` and CLIO-launched `gact`
  resolve to this checkout's `tui/gact`.
- `gact version` reports the current short revision, contract version, Go
  runtime, and dirty state.
- Any dirty state is explained in the verification notes. Untracked or modified
  visual artifacts must not be mistaken for release-candidate source changes.

## Automated Gates

Run the focused TUI gates first:

```bash
go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact ./emulator/internal/server -count=1
go test -p 1 ./tui -run 'TestCLI_(VersionReportsBuildMetadata|DumpBundle|Env|Capabilities)' -count=1
python3 -m unittest visual_loop/test_check_visual_corpus.py visual_loop/test_assert_live_observability.py
python3 visual_loop/check_visual_corpus.py --root . --require-git-tracked --require-strict-live-pass
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
  machine with untracked screenshots.
- The maintained 1.0
  [capability matrix](TUI_ONE_ZERO_CAPABILITY_MATRIX.md) and Doctor rows agree
  with every decoded capability field.

## Visual Loop

Before release, inspect the maintained corpus rather than relying only on unit
tests:

```bash
python3 visual_loop/check_visual_corpus.py --root . --require-git-tracked --require-strict-live-pass
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
- Temporal assertions prove route/delegation/tool-start/tool-complete/parent
  resume evidence appears before final completion for the benchmark hierarchy
  path tracked in #113.

## Manual Terminal Matrix

Manual evidence must be captured in #104 or the specific issue being closed.
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
  `clipboard_native`, `clipboard_missing`, `clipboard_osc52`,
  `terminal_selection`, `TERM`, and `TERM_PROGRAM`; use `/mouse` while
  comparing mouse-capture and native terminal text selection behavior.
- Paste into main input, compose, ask/retry, rename, context-add, prompt edit,
  MCP install, workspace-create, and agent write modals.
- Mouse hit targets for header buttons, sidebars, context/files, settings,
  provider, palette/help/doctor, details, and close/back buttons.
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
