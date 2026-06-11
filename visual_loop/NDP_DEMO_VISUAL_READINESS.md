# NDP Demo Readiness

- report: `/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/ndp_demo_four_cases.md`
- report exists: `true`
- ready for real demo: `false`

| Case | CLIO artifact proof | Deterministic TUI | Real TUI stills | Short GIF | Streaming proof | Ready |
| --- | --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | yes | yes | no | no | no |
| California current wildfire features | yes | yes | yes | no | no | no |
| California NWS warnings | yes | yes | yes | no | no | no |
| Fresno CIMIS weather profile and visualization | yes | yes | yes | no | no | no |

## Real Capture Inventory

| Case | Still captures | Short GIF | Manifest | Artifact observed | Streaming proof | Session status |
| --- | --- | --- | --- | --- | --- | --- |
| San Diego / EarthScope seismic waveform review | yes | no | no | legacy | no | legacy |
| California current wildfire features | yes | no | no | legacy | no | legacy |
| California NWS warnings | yes | no | yes | yes | no | idle |
| Fresno CIMIS weather profile and visualization | yes | no | yes | yes | no | idle |

## Missing: San Diego / EarthScope seismic waveform review
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_san_diego_earthscope_short.gif` (missing)
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_san_diego_earthscope_manifest.json` (manifest missing; streaming proof not verified)

## Missing: California current wildfire features
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_wildfire_short.gif` (missing)
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_wildfire_manifest.json` (manifest missing; streaming proof not verified)

## Missing: California NWS warnings
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_california_nws_warnings_short.gif` (missing)
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_california_nws_warnings_manifest.json` (provider did not expose live streaming)

## Missing: Fresno CIMIS weather profile and visualization
- Real TUI recording artifacts missing or invalid:
  - `visual_loop/screenshots/ndp_tui_real_fresno_cimis_short.gif` (missing)
- Real TUI recording manifest does not prove streaming-ready live demo:
  - `visual_loop/screenshots/ndp_tui_real_fresno_cimis_manifest.json` (provider did not expose live streaming)
