# Copy Latency Telemetry Evidence

Captured: 2026-06-12

## Scope

This report preserves deterministic evidence for the #156 copy-responsiveness
slice. Copy operations are no longer only visible as generic conversation key
latency. The TUI interaction report now classifies operator copy actions as
`kind: copy` with semantic targets and readable labels:

- `conversation:copy:full-conversation` -> full conversation copy
- `conversation:copy:selected-block` -> selected block copy
- `detail:copy` -> detail copy
- `sidebar:copy:session-id` -> session id copy

## Runtime Contract

`GACT_TUI_LATENCY_REPORT` JSON now exposes:

- `supported_by.copies: true` when copy actions were sampled
- per-interaction rows with `kind: copy`
- per-section `copy_count`
- target labels in section summaries and detail rows

This lets `/metrics` and live capture reports show whether copy actions are
slow independently from ordinary navigation keys.

## Verification

```bash
go test -p 1 ./tui/internal/ui \
  -run 'TestTUIInteractionLatency|TestWriteTUIInteractionLatencyReport|TestMetricsViewShowsTUIInteractionLatency|TestMetricsTUILatency' \
  -count=1
```

Result: passed.

## Remaining Work

This closes the TUI-owned observability gap for copy latency. It does not prove
native terminal selection permutations; that remains tracked by #150 and the
deferred live terminal checklist.
