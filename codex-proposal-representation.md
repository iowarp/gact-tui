# Codex Proposal: Execution Representation

## Problem

The TUI currently renders CLIO execution as separate streams instead of one execution timeline. Assistant prose is accumulated into `message.part.*`, while semantic/tool events are appended into synthetic semantic live messages. That creates duplicated `ASSISTANT` blocks, main-agent text bunched at the top, repeated expert returns, stale `running now` labels, and visible `[redacted]` placeholders.

The correct UI model is not "messages plus a pile of event cards." It is one chronological execution timeline per user turn.

## Ground Truth Files

- `a_clio_trace.jsonl`: what CLIO emitted and/or persisted as trace evidence; this is the backend audit truth.
- `b_tui_rendered.txt`: what the terminal user actually saw; this is the rendered UI truth.
- `c_tui_received.jsonl`: what the TUI received and folded into client state; this is the client input/state truth.

Current reference capture:

```text
/home/jcernuda/gact-tui/visual_loop/tui_audit_san_diego_alcf_gemma4_trajectory_tui_projection/
```

## Desired Model

Build a projector that consumes the chronological event stream from `c_tui_received.jsonl` and produces an execution timeline. Rendering should consume that timeline, not raw message parts and semantic events independently.

The timeline groups by user turn:

```text
turn
  user prompt
  assistant text segment
  expert handoff
    expert lifecycle
      react step
        thinking affordance
        tool run
        observation/detail
      expert report
  assistant text segment
```

Assistant prose must be segmented by event order. If main says one paragraph before delegating, another after geospatial returns, and another after handing to data, those are three timeline nodes interleaved with the real semantic events. They must not be collapsed into one block at the top.

Every resumed agent block should preserve this order:

```text
agent
  agent-visible planning / progress text, if the agent emitted any

  ↳ parent → child
    child instruction / handoff question, if available
```

Do not render an empty `main` or `data` label just because a semantic event exists. The agent label appears when there is either visible agent text or a child handoff/report nested under that agent. If both exist, visible text comes first and the handoff comes second.

Parent planning text and child instructions are different things. For example, main may first say it is resolving San Diego, then separately hand a concrete geocoding task to `geospatial`. Render both when both are available. If an agent does not emit visible planning text and only emits raw/redacted reasoning, do not invent a planning paragraph.

## Timeline Node Kinds

- `user_text`: the user prompt that starts the turn.
- `assistant_text`: streamed assistant prose, split where semantic/tool events occur.
- `agent_handoff`: parent expert delegates to child expert.
- `expert_started`: child expert lifecycle begins.
- `react_step`: one ReAct step, including thought/reasoning/tool/observation when available.
- `tool_run`: normalized started/completed tool call with arguments and result.
- `expert_report`: the expert output returned to the parent.
- `routing_decision`: orchestrator/planner routing when it adds useful information.
- `error`: failed tool, failed expert, backend error, or malformed event.

## Rendering Rules

Render exactly one visible assistant turn per user turn. Semantic execution is nested inside that turn.

Do not render synthetic `semantic_live_*` assistant headers when a timeline projection exists.

Never render literal `[redacted]`. If a field is unavailable, omit it or show a compact unavailable-detail affordance only when that helps debugging.

Parsed ReAct `thought` should be visible inline as plain prose. It is the agent's explanation of the local action and is useful for understanding the workflow. Do not prefix it with field labels. Raw reasoning-channel content, when present, should stay behind detail expansion:

```text
  Resolve "San Diego" to coordinates and restrict the search to the US.
```

Do not label visible boundaries with numeric step names. Step indexes are internal ordering keys. The UI should show distinct turns through spacing, indentation, a faint vertical guide, and the action header:

```text
    geospatial
      Resolve "San Diego" to coordinates and restrict the search to the US.
      Geocode location(query: San Diego · countrycodes: us · limit: 1)
      ⎿ San Diego, San Diego County, California, United States

      Return the resolved region with the default station-discovery radius.
      resolved region · center 32.72, -117.2 · radius 100 km · confidence high
```

If raw `reasoning` exists, the action can add a compact detail affordance:

```text
      Choose the nearest station catalog before staging data. · reasoning trace Ctrl+E
```

If neither `thought` nor `reasoning` exists, do not show a local note row.

Tool calls should be compact by default and expanded on demand:

```text
  Geocode location(query: San Diego, countrycodes: us, limit: 1)
    San Diego, San Diego County, California, United States
    center 32.7174202, -117.162772
    source osm_nominatim
```

Avoid using `·` as a generic crutch to pack unrelated fields into one line. Use it only for very short peer metadata where it improves scanning. Lists, rankings, file previews, and evidence with multiple values should use separate lines. Expansion labels should be generic by content type, such as `Ctrl+E full output`, `Ctrl+E full preview`, `Ctrl+E full diff`, or `Ctrl+E full image`, not custom per-tool phrases like `full ranking`.

## Interaction Semantics

`Enter` and `Ctrl+E` are different interactions and must not be treated as interchangeable labels.

`Enter` opens the message/event detail window. It shows semantic metadata, structured fields, provenance, and raw JSON when needed. It answers: "what is this transcript item?"

`Ctrl+E` opens the expanded user artifact or output. It shows the full file, full diff, full table preview, full plot/image, full stdout/stderr, or full reasoning trace when present. It answers: "show me the thing this item produced or collapsed."

Transcript hints should mention `Ctrl+E` only when there is collapsed produced content:

```text
⎿ earthscope_converted_data.csv · 153082 bytes
  Site, Latitude, (deg), ...
  P475, 32.803967, -117.236... · Ctrl+E full preview
```

```text
⎿ prepared earthscope_stations_clean.csv
  - Site,Latitude,(deg),Height,...
  + Site,Latitude,(deg)
  + P475,32.803967,-117.236... · Ctrl+E full diff
```

For semantic details only, do not show an inline hint:

```text
NDP catalog search(search: earthscope, converted · limit: 10)
⎿ earthscope_converted_data.csv
```

`Enter` still works there, but it is the default message-detail action and should not be advertised on every row.

Avoid duplicate status metadata. Prefer one status word when needed:

```text
running
completed
failed
```

Avoid rows like:

```text
completed · returned · 20626ms
```

Timing belongs in detail unless it is the main point of the row.

Expert reports should collapse duplicate events. `expert.extract.completed` and `blueprint.delegation.completed` often describe the same returned evidence. Render one expert report turn using the richer payload. Keep the return boundary visible, because it tells the user that control returned from the child to the parent. Do not compress the returned payload into a lossy one-liner.

DSPy extract returns should show the actual extracted evidence, not a generic "returned evidence" placeholder. Prefer structured fields and artifacts over summary prose:

```text
geospatial returned evidence
  San Diego, San Diego County, California, United States
  center 32.7174202, -117.162772
  radius 50 km · confidence high · provenance osm_nominatim
```

If the extract contains a long report, show the first useful lines according to the collapse threshold and put the full report in detail.

Returned evidence that points to a concrete artifact should render the artifact, not only a prose summary. Inline previews must be bounded by the existing TUI collapse threshold setting (`collapse_threshold` / `Theme.CollapseThreshold`). The full rendered view opens from detail. For downloaded/staged tabular files, show the header plus the first data row when available. For images/plots, show a small text/image-capable preview inline where possible and put the full rendered image in detail, with a text fallback that includes path, size, and caption.

Examples:

```text
ndp_dataset_discovery returned evidence
  Cleaned EarthScope station metadata catalog
  /tmp/.../earthscope_stations_clean.csv
  Site, Latitude, Longitude, ...
  1101 rows · Ctrl+E full preview
```

```text
visualization returned evidence
  P475.CI.LY_.20 timeseries plot
  /tmp/.../P475.CI.LY_.20_timeseries.png
  Ctrl+E full image
```

The detail view should render the file according to type: CSV/table preview for tabular files, image preview for PNG/JPEG when supported, text preview for plain text/logs, and raw metadata as a secondary tab or section. The transcript should preserve enough evidence to be trustworthy without forcing the user into raw JSON.

If a tool or shell command creates or changes files, render the file effect directly. Show the first few useful changed lines inline, then hide the rest behind expansion. Diff preview budgets count changed lines, not total displayed lines, so context lines may make the visual preview longer than the configured number:

```text
Shell command
  prepared earthscope_stations_clean.csv
  - Site,Latitude,(deg),Height, ...
  + Site,Latitude,(deg)
  + P475,32.803967,-117.236...
```

Detail should show the right artifact view:

- changed text/code/config: inline diff preview based on changed-line budget, full unified diff first in detail, full file second
- generated/downloaded CSV/table: inline header plus first data row when available, larger table preview first in detail, raw file second
- generated plot/image: inline preview/caption, full image first in detail, path/metadata second
- generated binary/archive: inline metadata preview, file metadata and extracted manifest in detail
- shell stdout/stderr: inline output preview, command output, exit code, and changed-file list in detail

Do not make users infer file changes from raw shell output if the changed path is known.

Preview size should use the existing TUI collapse threshold. The configured threshold is a budget, not a target. If the useful summary fits in fewer lines, do not pad it. For diffs, the threshold counts changed lines; surrounding context lines are allowed. If later UX needs independent budgets for diffs, artifacts, and tool output, those should be split deliberately from the existing setting rather than introduced accidentally.

Indentation should follow the span tree:

```text
main
  geospatial
    Geocode location
    resolved region
  data
    ndp_dataset_discovery
      NDP catalog search
      NDP resource staging
```

## Backend Reasoning Change Impact

Claude's proposed CLIO change improves the data model but does not remove the need for the TUI projector.

If `react.step.completed.payload.reasoning` is added, then `react.step.completed` becomes the canonical transcript source for ReAct steps:

```text
payload.thought
payload.reasoning
payload.tool_name
payload.tool_args
payload.observation
```

The TUI should stop using `lm.call` for normal transcript rendering. `lm.call` remains durable/raw/debug evidence only. `lm.token.delta` reasoning heartbeats should not become transcript content.

Updated rendering rule:

- `thought` exists: show it inline as plain prose, summarized only if it is too long for the normal transcript.
- `reasoning` exists: expose it as `reasoning trace Ctrl+E`; do not inline raw chain-of-thought by default.
- neither exists: show no thinking affordance.
- raw `lm.call`: inspector/detail only.

This backend change reduces inference and redaction handling in the TUI, but the TUI still must project one chronological timeline from mixed assistant text, semantic events, tool events, and expert lifecycle events.

## Implementation Shape

Create a projection layer before further rendering edits:

```text
tui/internal/ui/execution_timeline.go
tui/internal/ui/execution_projector.go
tui/internal/ui/execution_render.go
tui/internal/ui/execution_detail.go
tui/internal/ui/execution_projector_test.go
```

The projector should ingest append-only live events in receive order. It should preserve enough sequence information to split assistant text around semantic events. Rendering from final accumulated `gact.Part.Text` is insufficient because that loses the timing of assistant deltas.

Merge semantic and tool event evidence by stable ids where available:

- `turn_id` groups one user request lifecycle.
- `span_id` / `parent_span_id` builds nesting.
- `expert_span_id` groups an expert.
- `step_span_id` groups a ReAct step.
- `call_id` pairs tool start/completion and can join semantic tool events with unredacted tool payloads.

## Acceptance Checks

Use the A/B/C capture as a golden regression target.

The rendered `B` should satisfy:

- exactly one visible `ASSISTANT` block for the user turn
- no literal `[redacted]`
- no stale `running now` after tool completion
- no duplicate geospatial/data expert return rows
- assistant prose interleaved with semantic events in the order present in `C`
- parsed ReAct thought shown inline as plain prose; raw reasoning/detail stays expandable
- tool details available through detail expansion
- indentation reflects main/data/ndp/geospatial nesting

The received `C` should satisfy:

- contains chronological assistant deltas and semantic events
- contains `react.step.completed` for each ReAct step
- contains step thought, and after the backend change, step reasoning when available
- contains enough ids to build the span tree

The trace `A` should satisfy:

- contains durable backend evidence for debugging
- may contain raw `lm.call`
- is not required to be the normal transcript rendering source

## Target B Excerpt

For the San Diego capture, the `main -> geospatial -> main -> data -> ndp_dataset_discovery -> data` slice should render as one assistant turn with interleaved execution, not as separate semantic and assistant transcript blocks.

```text
● USER
Find the nearest station to San Diego on earthscope, download and analyze the data and plot it

● ASSISTANT
main
  I am initiating the workflow to locate the nearest EarthScope station to San Diego, stage its data,
  perform an analysis, and generate a visualization. I will start by resolving the geographic
  coordinates for San Diego.

  ↳ main → geospatial
    Resolve the place name "San Diego" into coordinates (latitude, longitude) and define a search
    region for station discovery.

    geospatial
      The user wants to resolve the place name "San Diego" into coordinates and a search region.
      Since a place name is provided, call geo_geocode with the query restricted to the US.
      Geocode location(query: San Diego · countrycodes: us · limit: 1)
      ⎿ San Diego, San Diego County, California, United States
        center 32.7174202, -117.162772
        source osm_nominatim

      The coordinates and bounding box were resolved; apply the default station-discovery radius
      and return the resolved region.
      resolved San Diego with default station-discovery radius

    geospatial returned evidence
      San Diego, San Diego County, California, United States
      center 32.7174202, -117.162772
      radius 50 km · confidence high · provenance osm_nominatim

main
  The region for San Diego has been resolved. I am now proceeding to discover the nearest EarthScope
  GNSS station and stage its time-series data for analysis.

  ↳ main → data
    Using the resolved coordinates for San Diego (32.7174202, -117.162772) and the 100km radius,
    discover the nearest EarthScope/NDP GNSS station, rank candidates by distance, and stage the
    time-series CSV for the nearest station.

    data
      I am initiating the data acquisition process for San Diego. The first step is to discover and
      stage the EarthScope station metadata catalog from the NDP.

      ↳ data → ndp_dataset_discovery
        Search the NDP for the EarthScope GNSS station metadata catalog and stage the CSV file to
        provide a metadata path for spatial filtering in the San Diego region.

        ndp_dataset_discovery
          Search for the EarthScope station metadata catalog using the exact NDP terms
          "earthscope" and "converted".
          NDP catalog search(search: earthscope, converted · limit: 10)
          ⎿ earthscope_converted_data.csv

          Stage the discovered CSV resource into the active workspace so downstream spatial
          filtering can read it locally.
          NDP resource staging(url: earthscope_converted_data.csv · output_dir: …/gact-tui-audit-…)
          ⎿ earthscope_converted_data.csv · 153082 bytes
            Site, Latitude, (deg), ...
            P475, 32.803967, -117.236...
            Ctrl+E full preview

          Extract the station id, latitude, and longitude columns into a cleaned metadata file.
          Shell command(cut first 3 columns → earthscope_stations_clean.csv)
          ⎿ prepared earthscope_stations_clean.csv
            - Site,Latitude,(deg),Height,...
            + Site,Latitude,(deg)
            + P475,32.803967,-117.236...
            Ctrl+E full diff

        ndp_dataset_discovery returned evidence
          Cleaned EarthScope station metadata catalog
          /tmp/.../earthscope_stations_clean.csv
          Site, Latitude, (deg)
          P475,32.803967,-117.236...
          Ctrl+E full preview

    data
      The staged metadata catalog is ready. I will filter stations within the San Diego search
      radius and rank them by distance before staging the nearest station time series.

      Filter points by radius(center: 32.7174202, -117.162772 · radius: 50 km)
      ⎿ 9 stations within radius
        P475 9.48 km
        SIO5 15.94 km
        P472 19.86 km
        Ctrl+E full output
```

This excerpt intentionally shows repeated `main` and `data` labels because those agents resume at different lifecycle points. It must not become repeated `ASSISTANT` blocks.

## Work Order

1. Add an execution timeline data model and projector.
2. Build a reduced golden fixture from the San Diego A/B/C capture.
3. Project `C` into timeline nodes and assert order/nesting/content.
4. Replace synthetic semantic live transcript rendering with timeline rendering for CLIO sessions.
5. Preserve existing detail modal access for raw payloads.
6. Re-run the clean ALCF/Gemma capture.
7. Compare new `B` against the acceptance checks.
8. Rebuild/install the TUI before asking the user to try it.
