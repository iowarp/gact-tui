# NDP Demo Readiness

- report: `/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/ndp_demo_four_cases.md`
- report exists: `true`
- ready for real demo: `false`

| Case | CLIO artifact proof | Deterministic TUI | Real TUI visuals | Streaming proof | Ready |
| --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | yes | yes | no | no |
| California current wildfire features | yes | yes | yes | no | no |
| California NWS warnings | yes | yes | yes | no | no |
| Fresno CIMIS weather profile and visualization | yes | yes | yes | no | no |

## Real Capture Inventory

| Case | Visual artifacts | Manifest | Artifact observed | Streaming proof | Session status |
| --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | no | legacy | no | legacy |
| California current wildfire features | yes | no | legacy | no | legacy |
| California NWS warnings | yes | yes | yes | no | idle |
| Fresno CIMIS weather profile and visualization | yes | yes | yes | no | idle |

## Missing: San Diego / EarthScope seismic waveform review
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_san_diego_earthscope_manifest.json` (manifest missing; streaming proof not verified)

## Missing: California current wildfire features
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_wildfire_manifest.json` (manifest missing; streaming proof not verified)

## Missing: California NWS warnings
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_california_nws_warnings_manifest.json` (provider did not expose live streaming)

## Missing: Fresno CIMIS weather profile and visualization
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_fresno_cimis_manifest.json` (provider did not expose live streaming)
