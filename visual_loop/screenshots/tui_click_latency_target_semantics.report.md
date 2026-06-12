# TUI Click Latency Target Semantics

Date: 2026-06-12

Scope: implementation evidence for target-aware TUI interaction latency rows.

## What changed

- Mouse click and wheel samples are keyed by the semantic hit target when one is available.
- Metrics rows preserve a human target label, for example `command chip` or `message composer`.
- The JSON latency report now includes `target_label` beside the raw `last_hit_target`.
- The JSON latency report now includes a `sections` summary with click, wheel, and key counts plus p95/max latency per surface.
- Untargeted clicks inside a valid surface receive readable labels such as `input surface` or `conversation surface`.
- Keyboard samples remain grouped by surface and input kind so the metrics view does not create noisy one-row-per-key tables.

## Verification

Command:

```sh
cd tui
go test ./internal/ui -run 'TestTUIInteractionLatency|TestTUILatency|TestWriteTUIInteractionLatencyReport|TestMetrics'
```

Result: PASS

Covered assertions:

- A real Bubble Tea mouse click on `input:command` records surface `input`, kind `click`, raw target `input:command`, and target label `command chip`.
- Two clicks on the same surface but different hit targets are preserved as separate latency summaries.
- Untargeted surface clicks keep a human label instead of a blank detail row.
- Exported latency JSON includes target labels for click rows.
- PTY mouse proof sends terminal SGR mouse events and fails unless it captures header, left sidebar, conversation, and input click sections plus conversation wheel latency.
- Live PTY mode can attach to an owned real CLIO backend and writes separate `live_clio_tui_mouse_latency_*` artifacts with active-stream blockers, backend latency sample count, and the same click-section proof.

## Remaining #160 gap

The current VHS version used by the visual loop does not provide scripted mouse primitives, so live owned-backend VHS capture still proves `/metrics` and report export with keyboard interactions only. True terminal click-latency evidence is covered by `capture_tui_mouse_latency_pty.py`. The remaining #160 gap is to run its live mode against an owned provider-backed CLIO session while that session is still streaming:

```sh
GACT_TUI_MOUSE_LATENCY_OWN_BACKEND=1 \
  visual_loop/capture_tui_mouse_latency_pty.py \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --session <RUNNING_SESSION_ID> \
  --live-clio \
  --require-active-stream
```
