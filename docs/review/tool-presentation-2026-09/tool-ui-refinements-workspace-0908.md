# Tool UI refinements: dedicated live examples

**Historical checkpoint, superseded:** the installation, fresh sessions, and current
verification are recorded in `tool-ui-installed-qualification-0908.md`. The pending
statements below describe the initial workspace creation, not current status.

Created 2026-09-08 in the existing contained generation; no old workspace, session,
or browser tab was removed or reset.

- Workspace: `Tool UI refinements` (`ws_5b56ce232bc2`).
- Root: `D:/Libraries/Documents/projects/clio_develop_workspace/generations/20260905-112411-20732/workspaces/tool-ui-refinements`.
- First session: `01 — File previews and text wrapping` (`sess_a616f3032c3b`).
- URL: http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_a616f3032c3b
- Browser tab 13 was opened and its rendered screenshot reviewed.

The real session completed Markdown creation/read (metadata, heading, table, long
URL), Python read/proposal/write/read (42 to 43), a delayed PowerShell command
with stdout/stderr and exit code 0, and Markdown artifact registration. It uses
the currently installed build, not the uncommitted refinements below. Observing
the completed terminal does not independently prove live streaming timing.

All subsequent qualification sessions for this campaign belong in this workspace
and should have descriptive numbered titles. Preserve historical examples.

## 02 — Plan mode badge and review

- Session: `sess_fa70f194984e` in this same workspace.
- URL: http://127.0.0.1:5174/workspaces/ws_5b56ce232bc2/sessions/sess_fa70f194984e
- Submitted through the visible composer with `Execution mode: Plan` selected.
- Confirmed `Sent in Plan mode` in the DOM before and after reload and visually
  reviewed the badge beside the user timestamp in browser tab 14.
- This badge already exists in installed UI commit `4720c62b`; no new production
  badge code was needed to make this fresh example appear. Missing historical
  message metadata must not be replaced by inference from prose/current mode.
- The run saved a plan and is awaiting approval; `example.py` remains at 43.
  It also shows a blocked shell attempt and rejected artifact registration before
  successfully writing the plan. These failures are preserved, not concealed.
- Added regression coverage for recorded-mode round trips and absent historical
  mode metadata. Focused prompt-mode and submission suites: 17 passed, 0 skipped.
- Does not yet qualify the locally changed plan-review boundary composition.

## Local implementation in progress

- Code and terminal text use wrapping with arbitrary-token overflow protection.
- Result dialogs retain vertical scrolling without a global horizontal scrollbar.
- Chain activity is split at actual plan-review tool invocations; reviews remain
  outside both outer Activity and inner iteration disclosures, in wire order.
- Plan review test covers Full and Chain, including collapsing Activity while
  retaining the visible review. Before the change Chain failed because the review
  was absent; the first cold Full test also timed out loading Markdown.
- Focused verification after the change: 29 passed, 0 skipped across
  `conversation-turn.test.tsx`, `conversation-process-sequence.test.tsx`, and
  `bounded-result.test.tsx`.

These local changes are not yet CI-qualified or installed. Unified document
panels, session Work visibility/lifecycle, broader coverage, and live qualification
remain open; creating this workspace is not campaign completion.
