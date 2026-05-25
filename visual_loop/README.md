# GACT TUI Visual Loop Handoff

This folder is a handoff for a fresh Codex session whose job is to harden the GACT TUI presentation layer with a real visual feedback loop.

## Current State

- Repository: `https://github.com/iowarp/gact-tui`
- Branch: `visual_loop`
- Paired backend repository: `https://github.com/iowarp/clio-agent`
- Paired backend branch: `visual_loop`
- OS where this handoff was written: Windows PowerShell.
- The TUI can build and the focused Go test packages pass, but VHS/screenshot capture has been unreliable on Windows because the Charm emulator server has been spawned from temporary paths and triggers firewall prompts.

## What Was Recently Fixed

- CLIO/GACT now has an `expert_handoff` part type in the emulator contract.
- The TUI promotes older `metadata.expert_handoffs` into first-class displayed handoff parts.
- Tool evidence from metadata is normalized into tool call/result parts.
- NDP search results get readable inline summaries instead of raw JSON where the summary path recognizes the tool/result shape.
- Raw tool results are preserved in metadata for detail expansion.
- Long unbroken words/URLs are hard-wrapped before rendering.
- Child/nanoagent sessions are collapsed by default in the sidebar.
- Sidebar key `c` toggles child/nanoagent sessions.
- Expanded child rows now render as one `└─` title connector with aligned status text, instead of duplicating `└` on both lines.
- The sidebar footer now advertises the actual delete key `x` and the child toggle `c`.

## Still Broken Or Not Good Enough

### Scroll State

The main conversation scroll is still a release-blocking bug. The observed behavior is stronger than "near the bottom":

- Once the transcript has scrolled up even a little, the viewport can fail to return to the bottom.
- The selection/cursor moves, but the visible text does not follow.
- Down, End/`G`, PageDown, and wheel-down need to reattach to the actual bottom reliably.
- This should be fixed at the scroll state/model level, not by adding more ad hoc render nudges.

The likely root problem is that the TUI mixes message-count based scrolling with visual-line based rendering. Long tool blocks are one message/part but many visual rows. A correct fix should account for rendered block/line positions.

### Tool Rendering

Tool output is still too raw and visually dense in realistic CLIO sessions. Examples from live use:

```text
NdpStageResource({dataset_identifier: 3264e7ee-ef6d-42d5-b722-8ad39670cf3d, identifier_type: id, resource_index: 0, server: global})
⎿ {"_meta":{"status":"success","tool":"stage_resource"},"dataset_id":"3264e7ee-ef6d-42d5-b722-8ad39670cf3d","dataset_name":"clm-full-climate-connectivity-
network","dataset_title":"Full
 │ Climate Connectivity
 │ Network", ...}
```

This is bad because:

- The JSON is treated like one line even though it renders as multiple visual rows.
- Wrapping happens mid-token instead of at semantic boundaries.
- Tool calls, tool results, and assistant synthesis have similar visual weight.
- It is hard to tell where a tool result ends and final prose begins.
- Inline transcript should show useful summaries, not raw JSON dumps.

### Desired Transcript Shape

For a many-tool scientific workflow, aim for this kind of presentation:

```text
● USER
Find a bounded seismic waveform dataset from NDP, inspect it, analyze it, and plot it.

↳ orchestrator -> data        success · 1.4s
  Found candidate datasets and delegated NDP catalog search.

↳ data -> ndp_catalog         success · 8.9s · 6 tools
  Selected "Salton Sea Seismic Data" from ucr-earth-and-planetary-sciences.

▌ NDP search datasets
  query: seismic
  status: success · 5 results · 430ms
  1. Salton Sea Seismic Data
     org: ucr-earth-and-planetary-sciences · resources: 1
     url: osdf:///ndp/public/ucr_seis/Data_Salton
  2. Ridgecrest CA Post-Earthquake Lidar
     org: opentopography · resources: 6 · formats: TIFF
  [3 more · Enter for details]

▌ NDP stage resource
  dataset: Full Climate Connectivity Network
  status: staged · 546 B · 320ms
  path: D:\...\tmp\clio-ndp-staging\WMS__Full_Climate_Connectivity_Network
  url: https://sparcal.sdsc.edu/geoserver/rrk/wms

↳ orchestrator -> analysis    success · 11.2s · 3 tools
  Inspected staged file and computed representative statistics.

▌ Parquet statistics
  file: facility_measurements.parquet
  column: pressure_pa · double
  count: 3000 · nulls: 0 · unique: 3000
  mean: 101231.18 · std: 766.51
  min: 98435.39 · median: 101229.29 · max: 103998.63
  [raw JSON · Enter for details]

↳ orchestrator -> visualization success · 2.1s
  Created scatter plot artifact.

● ASSISTANT
I found a bounded NDP candidate, staged the selected resource, inspected the data, and produced the plot artifact...
```

## Design Rules For The Next Pass

- Inline transcript gets summaries, not raw JSON, for known tools.
- Raw JSON must always remain available through Enter/Ctrl+E detail views.
- Tool blocks should have a header, a structured preview, and a subtle footer such as `[raw JSON · Enter for details]`.
- Long strings should break at semantic boundaries before hard wrap: commas, slashes, backslashes, hyphens, underscores, `:`, `?`, `&`.
- The scroll model should use rendered visual rows or block geometry, not message count alone.
- The selected block should be highlighted as a block, not only with a cursor glyph.
- Tool result previews should be visually distinct from final assistant prose.
- Handoff, tool call, tool result, and final answer order must be obvious.
- Evidence provenance must be clear: live event vs metadata-promoted event vs assistant prose.

## Recreating Real Benchmark Sessions

The backend repo contains the benchmark harness that produced the long sessions
used during this pass:

- `clio-agent/scripts/run_demo_benchmark.py`
- `clio-agent/docs/ALCF_DEMO_BENCHMARK_REPORT.md`

Read the report before designing visual fixtures. It records the 21-case live
ALCF run with prompts, selected agents, handoffs, tool calls, child sessions,
artifacts, elapsed time, and caveats. The most useful cases for TUI work are:

- `ndp_seismic_waveform_to_plot`: long NDP/seismic workflow with tier-3 handoffs
  (`ndp_catalog`, `analysis`, `sac_format`, `visualization`) and many NDP/SAC
  tool results.
- `cross_file_triage_nanoagents`: cross-file analysis with multiple materialized
  child/nanoagent sessions.
- `cross_file_dirty_quality_gate_nanoagents`: similar child-session pressure plus
  dirty data quality checks.
- `reasoning_cross_file_triage_nanoagents`: planner-hardening version of the
  cross-file nanoagent case.
- `provider_swap_memory_followup`: provider/model swap plus retained context.
- `context_pressure_compaction_followup`: context pressure and compaction state.
- `missing_hdf5_error` and `missing_csv_error`: surfaced-error presentation with
  no fake answer.

From `clio-agent`, create or reuse a live backend:

```powershell
uv sync --extra dev --extra optimizers
$env:CLIO_AGENT_SRC = "D:\Libraries\Documents\projects\clio-agent"
$env:CLIO_AGENT_MAX_STEPS = "12"
$env:CLIO_GACT_TURN_TIMEOUT_S = "900"
$env:CLIO_TRANSIENT_PROVIDER_RETRY_DELAYS = "5,15"
gact agent deploy clio visual-benchmark
gact agent list
```

Configure a provider in the TUI, then run selected cases against the listed
`HOST:PORT`:

```powershell
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case ndp_seismic_waveform_to_plot `
  --output-jsonl tmp/visual-loop-ndp.jsonl `
  --report tmp/visual-loop-ndp.md

uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case cross_file_triage_nanoagents `
  --case cross_file_dirty_quality_gate_nanoagents `
  --case reasoning_cross_file_triage_nanoagents `
  --output-jsonl tmp/visual-loop-nanoagents.jsonl `
  --report tmp/visual-loop-nanoagents.md

uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case provider_swap_memory_followup `
  --case context_pressure_compaction_followup `
  --case missing_hdf5_error `
  --case missing_csv_error `
  --output-jsonl tmp/visual-loop-state-errors.jsonl `
  --report tmp/visual-loop-state-errors.md
```

For the full stress shape:

```powershell
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --output-jsonl tmp/visual-loop-full.jsonl `
  --report tmp/visual-loop-full.md `
  --case-delay-s 2 `
  --require-stress-criteria
```

Then connect this TUI to the same agent:

```powershell
gact connect visual-benchmark
```

Use those sessions for visual review. They exercise exactly the hard surfaces:
hundreds of sessions, collapsed child sessions, nested handoffs, many tool
blocks, long JSON/URLs, provider switch markers, compaction, and surfaced errors.

## Important Files

- `tui/internal/ui/app.go`
  - main model, sidebar rendering, message normalization, scroll state.
- `tui/internal/ui/render.go`
  - message part rendering, tool result rendering, wrapping.
- `tui/internal/ui/detail_view.go`
  - detail expansion behavior.
- `tui/internal/ui/session_filter.go`
  - visible session filtering, now also hides child sessions unless expanded.
- `tui/internal/ui/sidebar_nav_test.go`
  - child session collapse/render tests.
- `tui/internal/ui/part_scroll_test.go`
  - selected-part scroll tests.
- `tui/internal/ui/tool_evidence_test.go`
  - handoff promotion and tool evidence summary tests.
- `tui/internal/ui/mouse_scroll_test.go`
  - mouse wheel sticky-bottom tests.
- `emulator/pkg/gact/messaging.go`
  - GACT part type definitions.
- `tui/internal/ui/locale/*.json`
  - localization strings. Do not add new visible English text without locale keys unless it is test-only.

## Verification Commands

From the `gact-tui` checkout:

```powershell
go test -p 1 ./tui/internal/ui -count=1
go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact -count=1
go build -p 1 -o tui\gact.exe .\tui
```

Root `go test ./...` may not work from the repository root because the repo uses a Go workspace with multiple modules. Test module paths explicitly.

## Visual Loop Requirement

Before claiming visual fixes are done, produce and inspect a screenshot. Passing tests alone is not enough for this task.

Preferred path:

1. Try Linux or WSL first for VHS/screenshot work.
2. Build a stable emulator server binary in a repo-local path instead of a temp path.
3. Run VHS against a deterministic fake backend state with long tool-heavy messages.
4. Save screenshots under `visual_loop/screenshots/`.
5. Inspect screenshots as design artifacts, not just proof that a command ran.

Windows issue to avoid:

- Repeated `emulator-server.exe` builds under `%TEMP%` triggered Windows firewall prompts and left many windows/processes. Use a stable path like `.tools/emulator-server.exe` or run the visual loop under Linux/WSL.

## Suggested First Tasks

1. Reproduce the scroll bug with a deterministic Go test:
   - Long assistant message with many addressable tool blocks.
   - Set `scrollOffset > 0`.
   - Press Down repeatedly, `G`, End, PageDown, and wheel-down.
   - Assert `scrollOffset == 0`, `stickyToBottom == true`, and the final rendered lines are visible.
2. Replace message-count anchoring with visual-row/block anchoring.
3. Introduce a structured tool preview layer:
   - NDP stage resource.
   - NDP dataset details.
   - Parquet statistics/schema.
   - CSV schema/read table.
   - HDF5/ADIOS/SAC summaries.
4. Ensure raw JSON is available in detail view for every preview.
5. Add render-width tests that strip ANSI and assert no visible line exceeds pane width.
6. Run the screenshot loop and review the image.
