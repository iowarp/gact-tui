# Prompt For The Next Codex Visual Loop Pass

You are Codex working on CLIO and GACT TUI visual polish. Use this prompt as the
starting point for a fresh run.

## Clone And Branches

```powershell
git clone https://github.com/iowarp/clio-agent.git
git clone https://github.com/iowarp/gact-tui.git

cd clio-agent
git switch visual_loop

cd ..\gact-tui
git switch visual_loop
```

If the repos already exist locally, fetch and switch instead:

```powershell
cd D:\Libraries\Documents\projects\clio-agent
git fetch origin
git switch visual_loop
git pull --ff-only

cd D:\Libraries\Documents\projects\gact-tui
git fetch origin
git switch visual_loop
git pull --ff-only
```

## Read First

Read these files before editing:

- `gact-tui/visual_loop/README.md`
- `clio-agent/visual_loop/README.md`
- `clio-agent/TASK.md`
- `clio-agent/docs/ALCF_DEMO_BENCHMARK_REPORT.md`
- `clio-agent/scripts/run_demo_benchmark.py`
- `gact-tui/tui/internal/ui/app.go`
- `gact-tui/tui/internal/ui/render.go`
- `gact-tui/tui/internal/ui/detail_view.go`
- `gact-tui/tui/internal/ui/part_scroll_test.go`
- `gact-tui/tui/internal/ui/tool_evidence_test.go`
- `gact-tui/tui/internal/ui/sidebar_nav_test.go`
- `clio-agent/src/clio_agent/gact/app.py`

The key product problem is not only correctness. Users need to understand what
CLIO did: routing, expert handoffs, nanoagent sessions, tool calls, tool results,
memory/context state, provider/model changes, and errors.

## Baseline Verification

Run backend checks:

```powershell
cd D:\Libraries\Documents\projects\clio-agent
uv sync --extra dev --extra optimizers
uv run ruff check src/clio_agent/gact/app.py tests/test_gact/test_tools_called.py tests/test_gact/test_nanoagents.py
uv run pytest tests/test_gact/test_tools_called.py tests/test_gact/test_nanoagents.py -q
```

Run TUI checks:

```powershell
cd D:\Libraries\Documents\projects\gact-tui
go test -p 1 ./tui/internal/ui ./tui/internal/client ./emulator/pkg/gact -count=1
go build -p 1 -o tui\gact.exe .\tui
```

## Establish A Real Visual Loop

Prefer Linux or WSL for screenshots if Windows VHS hangs. Check:

```powershell
vhs --version
ttyd --version
go version
```

Use the `tui-screenshot` skill if available. Build or reuse stable binaries
under `gact-tui/.tools` rather than temp folders, especially for
`emulator-server.exe`, to avoid repeated Windows firewall prompts.

Create deterministic screenshot fixtures for:

- Long conversation with many NDP/search/stage tool calls.
- Nested child/nanoagent sessions in the sidebar.
- Expert handoffs plus final assistant synthesis.
- Tool detail expansion for short and large outputs.
- Small and large terminal sizes.

Save screenshots under `gact-tui/visual_loop/screenshots/`. Inspect the images
before claiming a layout is fixed.

## Recreate Real CLIO Benchmark Sessions

Do not rely only on synthetic fixtures. Recreate the real session shapes from
the CLIO benchmark harness so the TUI has to deal with long transcripts,
nanoagents, child sessions, multi-tool turns, provider swaps, compaction, and
surfaced errors.

From `clio-agent`, deploy or reuse a GACT backend:

```powershell
$env:CLIO_AGENT_SRC = "D:\Libraries\Documents\projects\clio-agent"
$env:CLIO_AGENT_MAX_STEPS = "12"
$env:CLIO_GACT_TURN_TIMEOUT_S = "900"
$env:CLIO_TRANSIENT_PROVIDER_RETRY_DELAYS = "5,15"
gact agent deploy clio visual-benchmark
gact agent list
```

Configure a provider through the TUI, then run selected benchmark cases against
the backend `HOST:PORT`:

```powershell
# Long NDP/seismic workflow with tier-3 handoffs and many tool results.
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case ndp_seismic_waveform_to_plot `
  --output-jsonl tmp/visual-loop-ndp.jsonl `
  --report tmp/visual-loop-ndp.md

# Multiple materialized child/nanoagent sessions.
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case cross_file_triage_nanoagents `
  --case cross_file_dirty_quality_gate_nanoagents `
  --case reasoning_cross_file_triage_nanoagents `
  --output-jsonl tmp/visual-loop-nanoagents.jsonl `
  --report tmp/visual-loop-nanoagents.md

# Provider swap, context pressure, compaction, and surfaced errors.
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --case provider_swap_memory_followup `
  --case context_pressure_compaction_followup `
  --case missing_hdf5_error `
  --case missing_csv_error `
  --output-jsonl tmp/visual-loop-state-errors.jsonl `
  --report tmp/visual-loop-state-errors.md
```

For a full high-pressure transcript set:

```powershell
uv run python scripts/run_demo_benchmark.py --base-url http://127.0.0.1:<PORT> `
  --output-jsonl tmp/visual-loop-full.jsonl `
  --report tmp/visual-loop-full.md `
  --case-delay-s 2 `
  --require-stress-criteria
```

Then run:

```powershell
gact connect visual-benchmark
```

Use the generated sessions for screenshot review. The target visual issues are:
sidebar scale, child-session collapse/expand, nested expert handoffs, long raw
tool output, detail expansion, bottom scrolling, provider-switch markers,
compaction visibility, and error surfacing.

## Primary Task

Fix conversation scrolling. Current bug: after scrolling up, the selection/cursor
moves but the visible transcript does not reliably return to the true bottom.
Down, End, G, PageDown, and wheel-down should all be able to reattach to the
bottom and make the latest visible lines readable.

Add failing tests first. Test visual rows and viewport position, not only message
counts.

## Secondary Task

Redesign tool and result rendering for real scientific workflows:

- Show clear boundaries between handoffs, tool calls, tool results, and final
  assistant text.
- Summarize known CLIO tool outputs semantically instead of dumping raw JSON in
  the transcript.
- Keep raw JSON available behind Enter or Ctrl+E detail views.
- Wrap semantically before hard wrapping so keys/values do not split in confusing
  places.
- Make detail views scrollable and wide enough to be useful.
- Never hide errors behind fake, repeated, deterministic, or canned responses.

Important tool families:

- NDP search/details/stage.
- Parquet schema/statistics/query.
- CSV read/schema.
- HDF5 and ADIOS/BP5 inspection.
- SAC/seismic waveform inspection if present.
- Shell/utility calls.

## Information Architecture

The TUI should support drill-down, not close menus on Enter:

- Agent view: top-level agents first, then nested agents/skills/tools/MCPs.
- Skill view: list plus detail panel.
- Tool view: list plus schema, owning expert(s), permission, and examples.
- MCP view: server status, tools exposed, owning expert(s), errors.
- Memory/context view: what memory percentage means, active context, limits, and
  compaction state.

Agent hierarchy is central. Do not flatten everything into one namespace. The
future direction is hierarchical intelligence: orchestrator -> domain expert ->
subexpert/tool bundle/nanoagent -> evidence -> synthesis.

## Engineering Rules

- Do not hardcode benchmark-specific paths or prompts.
- Do not add deterministic fallback text that hides model/provider/tool errors.
- Make new agent/tool/skill metadata generic and extensible.
- Keep tests deterministic.
- Use conventional commits.
- Do not commit generated screenshots unless they are intentionally part of the
  visual-loop artifact set.

## Desired Transcript Shape

A complex turn should read like:

```text
USER
Find a bounded seismic waveform dataset...

ROUTE
orchestrator -> data -> ndp_catalog

TOOL
NdpSearchDatasets(...)
RESULT
4 datasets found. Best candidate: Salton Sea Seismic Data...

HANDOFF
data -> analysis, with staged resource path...

TOOL
SacInspect(...)
RESULT
3 traces, sample rate..., duration...

HANDOFF
analysis -> visualization, with statistics...

TOOL
PlotWaveform(...)
RESULT
artifact: ...

ASSISTANT
Concise synthesis with caveats and links to evidence.
```

The real UI does not need these exact labels, but the user must be able to see
the same structure and expand details.
