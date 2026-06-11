# GACT TUI Visual Loop Handoff

This folder is a handoff for a fresh Codex session whose job is to harden the GACT TUI presentation layer with a real visual feedback loop.

## Visual Coverage Index

The maintained tape/screenshot inventory is in [`COVERAGE.md`](COVERAGE.md).
Update it when adding, renaming, or retiring visual-loop tapes, and use its
"Missing Or Deferred" section to track views that should receive coverage later.
[`MISSING_CAPTURES.md`](MISSING_CAPTURES.md) is a generated operator backlog
derived from that ledger; regenerate it after changing missing-state rows.
Existing captures that are useful but not primary coverage live in
[`PRESERVED_CAPTURES.md`](PRESERVED_CAPTURES.md) until they are promoted or
removed.
Run `python3 visual_loop/check_visual_corpus.py --root .` to verify required
artifacts and referenced coverage entries are present. The report also lists
unindexed tapes/screenshots so useful captures can be added to the matrix later;
use `--require-indexed` to ensure every tape/screenshot is listed in one of the
visual-loop index files. Use `--include-deferred` when you want the report to
print the Missing Or Deferred capture ledger without requiring those planned
captures to exist yet. Use `--write-deferred-report
visual_loop/MISSING_CAPTURES.md` to refresh the standalone backlog. The corpus
check fails if that generated backlog is stale relative to `COVERAGE.md`.
The same corpus command also audits slash-command discoverability: built-in
palette commands must be documented in `SLASH_COMMAND_VISUAL_COVERAGE.md`,
canonical commands must appear in the Help Commands tab, and folded aliases must
stay out of Help. Run `python3 visual_loop/check_slash_command_coverage.py
--root .` only when you want the smaller command-specific report.
The report also includes the four-case NDP demo readiness summary when the CLIO
evidence report is available. By default that section is informational so normal
visual corpus checks can pass while any NDP case lacks manifest-backed streaming
proof; add `--require-ndp-demo-ready` for the final demo gate.

When copy or terminal-selection behavior changes, refresh the maintained
diagnostic report:

```bash
go build -p 1 -o tui/gact ./tui
visual_loop/capture_gact_diag.sh
```

The generated `visual_loop/screenshots/gact_diag_clipboard_terminal.report.md`
must include `mouse_capture`, `clipboard_native`, `clipboard_missing`,
`clipboard_osc52`, `terminal_selection`, `TERM`, and `TERM_PROGRAM`.

For the live terminal permutation backlog (#150), capture the actual terminal
environment from the terminal emulator being verified:

```bash
visual_loop/capture_live_terminal_copy_env.sh
```

This writes `visual_loop/screenshots/live_terminal_copy_env.report.md` with the
real terminal variables, clipboard diagnostics, and a manual verification
checklist. The helper refuses `TERM=dumb` captures unless
`GACT_ALLOW_DUMB_TERMINAL_CAPTURE=1` is set for a non-interactive smoke test; do
not use forced captures as proof that native selection works.

Refresh the diagnostics readiness report after changing doctor, metrics, memory,
or CLI diagnostic evidence:

```bash
python3 visual_loop/check_diagnostics_readiness.py --root . \
  --write-report visual_loop/screenshots/diagnostics_readiness.report.md \
  --strict
```

For the deferred live diagnostics backlog (#151), capture Doctor and Metrics
screenshots from an owned CLIO backend without starting or stopping CLIO:

```bash
CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND=1 \
  visual_loop/capture_live_diagnostics_tui.sh \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --session <RUNNING_SESSION_ID>
```

The script writes `live_clio_doctor_partial_gaps.png`,
`live_clio_metrics_active_stream.png`, and a manifest under
`visual_loop/screenshots/`. The metrics proof is only valid when the supplied
session is actively streaming during capture.

For the live runtime catalog backlog (#152), capture `/tools`, `/mcp`, and
Agent Blueprint marketplace-source breadth from an owned CLIO backend:

```bash
CLIO_RUNTIME_CATALOG_CAPTURE_OWN_BACKEND=1 \
  visual_loop/capture_live_runtime_catalogs_tui.sh \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --session <SESSION_ID>
```

The script writes live runtime catalog screenshots plus
`live_clio_runtime_catalogs_manifest.json`. It does not perform install/remove
operations; use it after running registry-backed lifecycle operations on the
owned backend when those success paths are being preserved.

For the live prompt and expert-pack lifecycle backlog (#153), capture successful
prompt save plus expert-pack install/update/delete from an owned disposable CLIO
backend:

```bash
CLIO_PROMPT_EXPERT_PACK_CAPTURE_OWN_BACKEND=1 \
CLIO_PROMPT_EXPERT_PACK_CAPTURE_MUTATE=1 \
  visual_loop/capture_live_prompt_expert_packs_tui.sh \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --session <SESSION_ID> \
  --expert-pack-source <DISPOSABLE_PACK_SOURCE>
```

The script writes `live_clio_prompt_expert_pack_lifecycle_manifest.json` plus
prompt and expert-pack lifecycle screenshots. It performs real prompt and
expert-pack writes, including delete, so only run it against an isolated backend
and workspace prepared for this proof.

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

## Current Gaps

### Scroll State

The old release-blocking conversation scroll bug has deterministic coverage now:

- `semantic_long_transcript_scroll.tape`
- `semantic_long_transcript_bottom.png`
- `semantic_long_transcript_after_g.png`
- `semantic_long_transcript_after_pagedown.png`
- `semantic_long_transcript_scroll.gif`

Keep this evidence because it guards the exact user complaint: after scrolling
up, `G`, End/PageDown, and wheel-down must visibly reattach to the latest
conversation rows. Future regressions should be fixed at the scroll
state/rendered-line geometry level rather than by adding one-off render nudges.

### Tool Rendering

Tool output still needs continuous scrutiny in realistic CLIO sessions, but the
visual loop now has semantic fixture coverage for the NDP/EarthScope/NWS/CIMIS
demo shapes and several catalog/tool/MCP surfaces. The remaining concern is not
"raw JSON everywhere"; it is whether newly added CLIO tool shapes keep getting
useful inline summaries with raw evidence preserved in detail views.

Bad historical examples looked like this:

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

## Live Observability Temporal Gate

Use `assert_live_observability.py` on captured SSE/visual-loop JSONL timelines
when validating live CLIO benchmark behavior. The default `benchmark-hierarchy`
mode requires the visible timeline to prove this ordered sequence before turn
completion:

```text
route_or_delegate -> child_expert_active -> tool_started -> tool_completed -> parent_resumed
```

The gate intentionally requires matched benchmark hierarchy observations to
precede `message.completed` by at least 0.25s. This prevents a false pass where
the TUI receives a final burst of posthoc evidence immediately before the final
answer, which looks correct in a settled screenshot but fails the human
observability requirement.

```bash
python3 visual_loop/assert_live_observability.py \
  visual_loop/screenshots/<capture>.jsonl \
  --mode benchmark-hierarchy \
  --report visual_loop/screenshots/<capture>.strict.report.md
```

For narrower smoke checks that only prove live tool start/complete events,
`--mode basic-tools` remains available and has no live-lead requirement by
default.

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

Important distinction:

- `--output-jsonl` and `--report` save benchmark evidence artifacts.
- They do not, by themselves, create TUI-visible sessions.
- TUI-visible sessions are created because the harness talks to a live backend
  through `POST /v1/sessions` and `POST /v1/sessions/{id}/messages`.
- Keep that backend process alive and run `gact connect visual-benchmark` to
  inspect the generated sessions in the TUI.
- If the backend is stopped, transcript recovery depends on the backend's
  session/message persistence. The JSONL/report are audit artifacts, not a
  session-import format.

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

Before opening the TUI, verify both artifact and backend state:

```powershell
Test-Path tmp/visual-loop-full.jsonl
Test-Path tmp/visual-loop-full.md
Invoke-RestMethod http://127.0.0.1:<PORT>/v1/sessions | ConvertTo-Json -Depth 8
```

## Current Visual Loop Corpus

The current Linux/WSL visual loop reuses the persisted CLIO benchmark sessions;
do not rerun the ALCF benchmark unless the CLIO trace-capture semantics change.
On Linux/WSL, rebuild and relink with `make dev-install` before launching
`gact` through either the shell or CLIO. That target points both
`~/.local/bin/gact` and `~/.local/share/clio/gact` at the current checkout so
visual-loop changes cannot be hidden behind a stale CLIO launcher. Then run the
VHS tapes under `visual_loop/tapes/` and inspect the resulting PNGs under
`visual_loop/screenshots/`.

Before a release pass, run the corpus manifest check:

```bash
python3 visual_loop/check_visual_corpus.py --root .
python3 visual_loop/check_visual_corpus.py --root . --require-git-tracked
python3 -m unittest visual_loop/test_check_visual_corpus.py visual_loop/test_assert_live_observability.py
```

This fast check verifies that the maintained tapes, screenshots, live benchmark
replay artifacts, and temporal-observability reports are present and non-empty.
The tracked-artifact mode also fails required non-GIF artifacts that only exist
as local untracked files, so a clean checkout cannot accidentally lose release
evidence. GIF recordings are generated media ignored by default; keep useful
GIFs indexed in `PRESERVED_CAPTURES.md`, and promote only release-critical
recordings with an explicit tracking decision. This does not replace screenshot
inspection or strict live benchmark assertions; it catches missing acceptance
artifacts before the visual review starts.

When a fresh live benchmark capture is intended to close the temporal
observability work, run the stricter corpus gate too:

```bash
python3 visual_loop/check_visual_corpus.py --root . \
  --require-git-tracked \
  --require-strict-live-pass
```

This fails unless at least one maintained strict live-observability report has
`verdict: PASS`. Historical reports that only prove basic tool streaming should
remain useful artifacts, but they must not be mistaken for closure-grade
benchmark hierarchy proof.

### Temporal live-observability gate

Screenshots alone can miss the worst streaming regression: the TUI appears
frozen during a long CLIO turn, then the final settled transcript looks fine.
Pair live or benchmark captures with the JSONL temporal assertion:

```bash
python3 visual_loop/assert_live_observability.py \
  visual_loop/screenshots/live_observability_YYYYMMDD_HHMMSS.jsonl \
  --report visual_loop/screenshots/live_observability_YYYYMMDD_HHMMSS.temporal.md
```

Default `benchmark-hierarchy` mode requires this order before final completion:
route/delegate, child expert active, tool started, tool completed, parent
resumed. Use `--mode basic-tools` only for synthetic smoke cases that do not
exercise hierarchy. A strict failure with a basic-tools pass means live tool
visibility exists, but the benchmark hierarchy/parent-resume semantics are not
yet proven.

Fresh ALCF corpus from 2026-05-25:

- Backend used for capture: `http://127.0.0.1:41918`
- Report: `/home/jcernuda/clio-agent/docs/ALCF_DEMO_BENCHMARK_REPORT.md`
- JSONL evidence: `/home/jcernuda/clio-agent/tmp/clio-demo-benchmark-alcf-metis-20260525-visual-loop2.jsonl`
- Result: 16/21 clean passes, 2 expected surfaced errors, 1 partial recovery, 2 failures.
- Stress coverage: meets the documented benchmark standard.

Fresh high-value sessions:

| Case | Session | Notes |
| --- | --- | --- |
| `workflow_hdf5_overview`, `workflow_parquet_profile`, `workflow_memory_followup`, `workflow_csv_event_schema`, `workflow_visual_dashboard` | `sess_0075ece46770` | multi-turn workflow memory and mixed HDF5/Parquet/CSV/visualization evidence |
| `csv_status_visual_summary` | `sess_8ad20b4688f7` | visualization error/failure with repeated chart attempts and explicit missing-column error |
| `cross_file_triage_nanoagents` | `sess_3b3102631306` | nanoagent child-session pressure |
| `cross_file_dirty_quality_gate_nanoagents` | `sess_34f692e3217e` | dirty-data nanoagent pressure |
| `reasoning_cross_file_triage_nanoagents` | `sess_bd30728fcc95` | reasoning-only nanoagent routing |
| `ndp_catalog_discovery` | `sess_482be4bf076e` | NDP catalog/tool summaries |
| `ndp_seismic_waveform_to_plot` | `sess_aae8071afb04` | NDP plus SAC/seismic plus artifact path |
| `missing_hdf5_error`, `missing_csv_error` | `sess_cd8fc09979a7` | expected surfaced errors; no fake assistant answer |
| `provider_swap_memory_followup` | `sess_286ec4360014` | provider/model swap plus retained context |
| `context_pressure_compaction_followup` | `sess_f2eb419f7ca0` | explicit compaction marker plus retained evidence follow-up |

`visual_scatter_artifact` originally produced `sess_2c4a75e36258`, but the
live `/messages` endpoint for that session is empty even though the benchmark
JSONL and ARC conversation contain the partial answer/evidence. For TUI
rendering work, use the rehydrated GACT import fixture:

- Fixture: `visual_loop/fixtures/alcf_20260525_scatter_rehydrated.json`
- Imported session used in current screenshots: `sess_8ec382da38a3`
- Tape: `visual_loop/tapes/live_alcf_20260525_scatter.tape`
- Screenshots: `visual_loop/screenshots/live_alcf_20260525_scatter_partial.png`,
  `visual_loop/screenshots/live_alcf_20260525_scatter_bottom.png`,
  `visual_loop/screenshots/live_alcf_20260525_scatter_detail.png`

The current scatter screenshot verifies that repeated identical `plot_scatter`
tool calls collapse to one semantic preview plus a repetition notice, the
partial planner error is readable, and raw metadata detail remains advertised.

Current tape targets:

| Tape | Session | Purpose |
| --- | --- | --- |
| `live_alcf_20260525_scatter.tape` | `sess_8ec382da38a3` | rehydrated ALCF scatter partial; repeated tool-call compaction, readable partial planner error, and recovered prose marked partial after the surfaced error |
| `live_alcf_20260525_errors.tape` | `sess_cd8fc09979a7` | fresh expected surfaced errors from the ALCF run |
| `live_alcf_20260525_ndp_scroll.tape` | `sess_aae8071afb04` | fresh NDP/SAC transcript; verifies `G`/PageDown return to the artifact bottom, long scientific paths stay readable inline, and SAC plot evidence shows artifact plus trace counts |
| `live_alcf_20260525_csv_failure.tape` | `sess_8ad20b4688f7` | failed CSV visualization; verifies message-level `error_info` remains visible and expandable and later recovered prose is marked as partial after the surfaced error |
| `live_alcf_20260525_nanoagents.tape` | `sess_3b3102631306` | fresh cross-file nanoagent case; verifies collapsed/expanded child sessions, child drill-down, compact child labels, and shortened Parquet tool paths |
| `live_alcf_20260525_provider_swap.tape` | `sess_286ec4360014` | fresh provider-swap follow-up; verifies retained Parquet context, readable tool evidence, and exact duplicate tool telemetry compaction after the swap |
| `live_alcf_20260525_compaction.tape` | `sess_f2eb419f7ca0` | fresh context-pressure case; verifies the compacted summary marker, compaction detail modal, and `G` bottom behavior |
| `live_alcf_20260525_catalogs.tape` | `sess_aae8071afb04` | fresh NDP/SAC session catalog drill-down; verifies agents, local Codex skills, tool metadata, MCP servers, and per-tool/per-server detail views |
| `live_alcf_20260525_memory.tape` | `sess_f2eb419f7ca0` | fresh context-pressure memory view; verifies `/memory` palette discovery, ARC hit-rate stats, retained-token pressure, budget overrun, and transcript-derived compaction retention |
| `live_alcf_20260525_sidebar_sections.tape` | `sess_3b3102631306` | fresh sidebar outline pass; verifies compact session rows, continuous child branches, hollow-circle status markers, and independent sessions/context section collapse |
| `live_clio_ndp.tape` | `sess_674829ad532b` | NDP/seismic workflow, scroll return-to-bottom, long assistant detail |
| `live_clio_ndp_top.tape` | `sess_674829ad532b` | NDP top-of-transcript smoke view |
| `live_clio_provenance_detail.tape` | `sess_674829ad532b` | promoted tool evidence and raw provenance detail |
| `live_clio_catalogs.tape` | `sess_674829ad532b` | agents, tools, MCP catalog drill-down |
| `live_clio_catalogs_narrow.tape` | `sess_674829ad532b` | narrow catalog/tool-detail layout |
| `live_clio_memory.tape` | `sess_674829ad532b` | memory command palette entry point |
| `live_clio_artifacts.tape` | `sess_d993083e3584` | visualization artifact summary and raw plot-result detail |
| `live_clio_sidebar_errors.tape` | `sess_08ebaf83905e` | missing-file errors, raw error detail, child toggle footer |
| `live_clio_nanoagents.tape` | `sess_1fb7b4b568f2` | child/nanoagent grouping and opening a child session |
| `live_clio_compaction.tape` | `sess_530d7025d35f` | compaction marker and detail modal |
| `live_clio_memory_pressure.tape` | `sess_530d7025d35f` | over-budget context and retained compaction evidence |
| `live_clio_state_markers.tape` | `sess_a6c3a15a2a78`, `sess_530d7025d35f` | provider-swap transcript and compaction state markers |

Four-case NDP demo readiness is tracked separately from deterministic fixture
coverage. Run this before claiming the live demo is ready:

```bash
python3 visual_loop/check_ndp_demo_readiness.py --root .
```

To preserve the exact current missing-file list in the repo-local visual
evidence ledger, refresh `NDP_DEMO_VISUAL_READINESS.md`:

```bash
python3 visual_loop/check_ndp_demo_readiness.py --root . \
  --write-report visual_loop/NDP_DEMO_VISUAL_READINESS.md
```

Use `--strict` only when all four real TUI recordings are expected to exist. The
checker reports CLIO artifact proof, deterministic TUI proof, and valid real TUI
recordings independently so deterministic fixtures or placeholder files cannot
be mistaken for the actual demo video/GIF evidence.

Current preserved real TUI screenshots cover all four NDP cases and are useful
operator evidence. They are not yet release-ready video/GIF or streaming proof
under the current manifest standard: all four cases need short GIF recordings,
San Diego/EarthScope and wildfire need manifests, while California NWS warnings
and Fresno CIMIS have artifact-producing manifests that still record provider
streaming limitations.

Use the guarded capture helper for the remaining live recordings. It never
starts, stops, or reconfigures CLIO; point it only at an isolated backend that
you own. After VHS finishes, it validates that the prompt/early/live screenshots
are real PNGs and the short recording is a real GIF, then writes a manifest that
records whether the backend transcript actually produced the expected artifact
without user-input or provider-streaming blockers:

```bash
go build -p 1 -o tui/gact ./tui
CLIO_NDP_CAPTURE_OWN_BACKEND=1 visual_loop/capture_ndp_demo_tui.sh \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --workspace <WORKSPACE_ID_OR_NAME_OR_ROOT> \
  --case california_nws_warnings \
  --agent-blueprint <optional-blueprint-id>

CLIO_NDP_CAPTURE_OWN_BACKEND=1 visual_loop/capture_ndp_demo_tui.sh \
  --backend http://127.0.0.1:<OWN_CLIO_PORT> \
  --workspace <WORKSPACE_ID_OR_NAME_OR_ROOT> \
  --case fresno_cimis_weather \
  --agent-blueprint <optional-blueprint-id>
```

After both runs, verify readiness with
`python3 visual_loop/check_ndp_demo_readiness.py --root . --strict`.

Provider failure/recovery evidence uses the same owned-backend rule as the
diagnostics and lifecycle helpers. Prepare an isolated CLIO backend with a real
failed provider session and, when available, a recovered/successful session.
Then run:

```bash
CLIO_PROVIDER_RECOVERY_CAPTURE_OWN_BACKEND=1 \
  visual_loop/capture_live_provider_recovery_tui.sh \
    --backend http://127.0.0.1:<OWN_CLIO_PORT> \
    --failure-session <FAILED_SESSION_ID> \
    --recovery-session <RECOVERED_SESSION_ID>
```

The helper records the provider failure inline view, operator detail view, retry
override warning, and optional recovery/provider-setup screenshots. It does not
start, stop, authenticate, or reconfigure CLIO.

Note: `provider_swap_memory_followup` proves retained context visually through
the follow-up prompt, Parquet tool evidence, and final answer. The persisted
GACT session export does not currently include a provider-transition event or
per-message model metadata, so an explicit provider/model switch banner would
require a CLIO capture-semantics change and a fresh benchmark run. Do not fake
that marker from the benchmark title or prompt text.

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

## Suggested Next Tasks

1. Close the remaining four-case NDP demo proof gaps under live TUI execution:
   capture the required short GIFs for all four cases, add manifests for the
   preserved San Diego/EarthScope and wildfire runs, and rerun California NWS
   warnings and Fresno CIMIS until their manifests no longer record provider
   streaming limitations. Use
   `python3 visual_loop/check_ndp_demo_readiness.py --root .` to verify the
   exact missing or invalid manifest-backed streaming proof.
2. Continue the slash-command/operator-surface audit from `COVERAGE.md`, filling
   targeted missing states instead of regenerating broad suites.
3. Add true range-selection semantics for transcript/detail/text-entry surfaces
   if product scope requires native-feeling mouse copy beyond the current scoped
   copy and drag-copy actions.
4. For each new CLIO tool or semantic event shape, add a deterministic fixture
   proving the inline summary and detail/raw-evidence rendering.
5. Run the screenshot loop and inspect the images before claiming visual fixes
   are done.
