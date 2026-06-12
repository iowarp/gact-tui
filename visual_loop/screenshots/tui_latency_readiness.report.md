# TUI Latency Visual Readiness

- maintained evidence ready: `true`
- strict live evidence ready: `false`
- maintained evidence: `4/4`
- strict live evidence: `0/2`

| Area | Evidence | Maintained | Strict live | Ready |
| --- | --- | --- | --- | --- |
| Metrics modal | deterministic TUI latency section renders | yes | no | yes |
| Target semantics | click target semantics report | yes | no | yes |
| PTY mouse | terminal mouse click/wheel latency proof | yes | no | yes |
| Owned CLIO | partial owned-backend live latency capture | yes | no | yes |
| Active CLIO | active long live-stream latency capture | no | yes | no |
| Active CLIO mouse | active live-stream click/wheel latency capture | no | yes | no |

## Missing: Active CLIO - active long live-stream latency capture
- Missing manifest keys: `active_stream_evidence`, `active_stream_blockers`
- False manifest keys: `active_stream_evidence`
- Non-positive counters: `backend_metrics_sample_count`, `tui_latency_sample_count`

## Missing: Active CLIO mouse - active live-stream click/wheel latency capture
- `visual_loop/screenshots/live_clio_tui_mouse_latency_manifest.json`: missing
- `visual_loop/screenshots/live_clio_tui_mouse_latency_report.json`: missing
- Missing manifest keys: `backend`, `captured_from_owned_backend`, `session_id`, `session_status`, `active_stream_evidence`, `active_stream_blockers`, `backend_metrics_sample_count`, `tui_latency_sample_count`, `mouse_event_source`, `click_sections`, `wheel_sections`, `section_latency_summary`, `click_targets`, `click_target_labels`, `live_click_section_evidence`, `provider_streaming_limitation`, `live_streaming_false`
- False manifest keys: `captured_from_owned_backend`, `active_stream_evidence`, `live_click_section_evidence`
- Non-positive counters: `session_message_count`, `backend_metrics_sample_count`, `tui_latency_sample_count`, `click_section_count`, `click_target_count`
