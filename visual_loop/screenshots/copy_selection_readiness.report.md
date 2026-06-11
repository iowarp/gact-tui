# Copy And Selection Visual Readiness

- ready for maintained deterministic copy proof: `true`
- deterministic evidence: `2/2`
- deferred live terminal evidence: `0/1`

| Area | Evidence | Required | Ready |
| --- | --- | --- | --- |
| Copy UI | detail, block, drag-copy, native-selection, and failure affordances | yes | yes |
| Copy diagnostics | maintained clipboard and terminal-selection diagnostics | yes | yes |
| Live terminal | real terminal copy/selection permutation checklist | deferred | no |

## Missing: Live terminal - real terminal copy/selection permutation checklist
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_terminal_copy_env.report.md` (missing)
- Missing diagnostic markers:
  - `capture_mode: live-terminal`
  - `TERM:`
  - `TERM_PROGRAM:`
  - `clipboard_native:`
  - `clipboard_missing:`
  - `clipboard_osc52:`
  - `terminal_selection:`
  - `Manual Copy/Selection Checklist`
- Live report must contain `capture_mode: live-terminal`.
- Incomplete live checklist items:
  - `CLIO drag-copy mode with mouse capture enabled` (missing)
  - `Native terminal text selection works with mouse capture disabled` (missing)
  - `Alt-drag terminal selection works while mouse capture is enabled` (missing)
  - `Detail-modal copy by key/button copies only the detail payload` (missing)
  - `Selected conversation block copy copies only the selected block` (missing)
  - `Clipboard failure path shows actionable diagnostics` (missing)
