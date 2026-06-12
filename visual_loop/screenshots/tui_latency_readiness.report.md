# TUI Latency Visual Readiness

- maintained evidence ready: `true`
- strict live evidence ready: `false`
- maintained evidence: `4/4`
- strict live evidence: `0/1`

| Area | Evidence | Maintained | Strict live | Ready |
| --- | --- | --- | --- | --- |
| Metrics modal | deterministic TUI latency section renders | yes | no | yes |
| Target semantics | click target semantics report | yes | no | yes |
| PTY mouse | terminal mouse click/wheel latency proof | yes | no | yes |
| Owned CLIO | partial owned-backend live latency capture | yes | no | yes |
| Active CLIO | active long live-stream latency capture | no | yes | no |

## Missing: Active CLIO - active long live-stream latency capture
- Missing manifest keys: `active_stream_evidence`, `active_stream_blockers`
- False manifest keys: `active_stream_evidence`
- Non-positive counters: `backend_metrics_sample_count`, `tui_latency_sample_count`
