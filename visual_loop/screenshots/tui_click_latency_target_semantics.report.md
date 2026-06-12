# TUI Click Latency Target Semantics

Date: 2026-06-12

Scope: implementation evidence for target-aware TUI interaction latency rows.

## What changed

- Mouse click and wheel samples are keyed by the semantic hit target when one is available.
- Metrics rows preserve a human target label, for example `command chip` or `message composer`.
- The JSON latency report now includes `target_label` beside the raw `last_hit_target`.
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
- Exported latency JSON includes target labels for click rows.

## Remaining #160 gap

The current VHS version used by the visual loop does not provide scripted mouse primitives. Live owned-backend capture still proves `/metrics` and report export with keyboard interactions only. True terminal click-latency evidence needs either a PTY mouse-event injector or another capture harness that can send terminal mouse sequences to the running TUI.
