# TUI Latency Visual Readiness

- maintained evidence ready: `true`
- strict live evidence ready: `false`
- maintained evidence: `5/5`
- strict live evidence: `0/2`

| Area | Evidence | Maintained | Strict live | Ready |
| --- | --- | --- | --- | --- |
| Metrics modal | deterministic TUI latency section renders | yes | no | yes |
| Target semantics | click target semantics report | yes | no | yes |
| PTY mouse | terminal mouse click/wheel latency proof | yes | no | yes |
| Copy latency | copy action latency is reported separately from navigation keys | yes | no | yes |
| Owned CLIO | partial owned-backend live latency capture | yes | no | yes |
| Active CLIO | active long live-stream latency capture | no | yes | no |
| Active CLIO mouse | active live-stream click/wheel latency capture | no | yes | no |

## Missing: Active CLIO - active long live-stream latency capture
- False manifest keys: `active_stream_evidence`
- Non-positive counters: `backend_metrics_sample_count`
- Active-stream blockers: `session_status_idle`, `backend_metrics_sample_count_zero`, `provider_streaming_limitation`, `live_streaming_false`

## Missing: Active CLIO mouse - active live-stream click/wheel latency capture
- False manifest keys: `active_stream_evidence`
- Non-positive counters: `backend_metrics_sample_count`
- Active-stream blockers: `session_status_idle`, `backend_metrics_sample_count_zero`, `provider_streaming_limitation`, `live_streaming_false`
