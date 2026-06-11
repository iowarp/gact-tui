# NDP Demo Readiness

- report: `/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/ndp_demo_four_cases.md`
- report exists: `true`
- ready for real demo: `false`

| Case | CLIO artifact proof | Deterministic TUI | Real TUI stills | Short GIF | Live-run manifest | Ready |
| --- | --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | yes | yes | no | no | no |
| California current wildfire features | yes | yes | yes | no | no | no |
| California NWS warnings | yes | yes | yes | no | no | no |
| Fresno CIMIS weather profile and visualization | yes | yes | yes | no | no | no |

## Streaming Proof Contract

A short GIF proves that the terminal view moved over time, but it does not prove that the run was a live CLIO stream. Each real run must also write a streaming proof manifest: a small JSON receipt produced by the capture helper after inspecting the owned backend session.

Required manifest fields:
- `case_id`
- `session_id`
- `backend`
- `artifact_name`
- `session_status`
- `assistant_message_count`
- `verified_artifact`
- `requested_user_input`
- `provider_streaming_limitation`
- `live_streaming_false`
- `turn_cancelled`
- `completion_timeout`
- `semantic_event_count`
- `live_observed_event_count`
- `streaming_event_types`

A manifest only counts as live-run proof when the case/artifact match, an assistant message and expected artifact were observed, at least one `semantic_event_count` and one `live_observed_event_count` were recorded, `streaming_event_types` is non-empty, and the run did not request user input, time out, cancel, or report `provider_streaming_limitation` / `live_streaming_false`.

## Real Capture Inventory

| Case | Still captures | Short GIF | Live-run manifest | Artifact observed | Streaming events | Session status |
| --- | --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | no | no | legacy | no | legacy |
| California current wildfire features | yes | no | no | legacy | no | legacy |
| California NWS warnings | yes | no | yes | yes | no | idle |
| Fresno CIMIS weather profile and visualization | yes | no | yes | yes | no | idle |

## Missing: San Diego / EarthScope seismic waveform review
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_san_diego_earthscope_short.gif` (missing)
- Live-run manifest does not prove streaming-ready demo semantics:
  - `visual_loop/screenshots/ndp_tui_real_san_diego_earthscope_manifest.json` (streaming proof manifest missing)

## Missing: California current wildfire features
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_wildfire_short.gif` (missing)
- Live-run manifest does not prove streaming-ready demo semantics:
  - `visual_loop/screenshots/ndp_tui_real_wildfire_manifest.json` (streaming proof manifest missing)

## Missing: California NWS warnings
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_california_nws_warnings_short.gif` (missing)
- Live-run manifest does not prove streaming-ready demo semantics:
  - `visual_loop/screenshots/ndp_tui_real_california_nws_warnings_manifest.json` (manifest missing required fields: semantic_event_count, live_observed_event_count, streaming_event_types; no semantic events observed; no live-observed semantic events observed; streaming_event_types is empty; provider did not expose live streaming; manifest records live_streaming=false)

## Missing: Fresno CIMIS weather profile and visualization
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_fresno_cimis_short.gif` (missing)
- Live-run manifest does not prove streaming-ready demo semantics:
  - `visual_loop/screenshots/ndp_tui_real_fresno_cimis_manifest.json` (manifest missing required fields: semantic_event_count, live_observed_event_count, streaming_event_types; no semantic events observed; no live-observed semantic events observed; streaming_event_types is empty; provider did not expose live streaming; manifest records live_streaming=false)
