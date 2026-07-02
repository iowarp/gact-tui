# The absolute complete dspy.extract return — grounded in real persisted data

Source: the persisted assistant turn of a **completed** full-pipeline run,
`sess_cb77f926809b` (.clio/agent/messages/), cross-checked against clio
`runtime.py` (`final_pred = dspy.Prediction(trajectory=…, **extract)`) and the
web return builder `transcriptDelegationModel.ts` (lines 503, 533–538).

> Correction to my earlier draft: I had *guessed* the extract fields were
> `reasoning / answer / workflow_state / next_expert / next_task / completed`.
> That was wrong. Below is what the run **actually** emits.

## 1. The categories the extract actually returns

Every part clio emitted in the completed turn, by `metadata.signature_field_name`,
with real counts from the run:

| # | Category (`signature_field_name`) | part type | count | What it holds (real sample) |
|---|---|---|---|---|
| 1 | `provider_thinking:claude_code_sdk` | `thinking` | 38 | Raw SDK chain-of-thought — the model reasoning *out loud about the DSPy task itself* (e.g. *"The user is asking me to respond with the output fields for a DSPy signature…"*). **This is the leak behind the broken-message bug.** |
| 2 | `reasoning` | `text` | 21 | The ChainOfThought `reasoning` field (e.g. *"The request explicitly asks for a complete regional GNSS analysis pipeline: 1. 'around Los Angeles' requires geospatial resolution…"*). |
| 3 | `next_thought` | `text` | 14 | The ReAct loop's per-step thought (e.g. *"I have successfully resolved Los Angeles through OpenStreetMap Nominatim…"*). |
| 4 | `answer` | `text` | 1 | The single terminal deliverable — the full `## Region … ## Recommendations` markdown report. |

There are **no** `next_expert` / `next_task` / `completed` text fields. Routing
lives entirely in the `expert_handoff` envelope below.

## 2. The return envelope — `expert_handoff` metadata (real terminal values)

The terminal `main` return part carried these keys (full values in
`scratchpad/extract-return-full.txt`):

| key | real value (terminal `main` return) |
|---|---|
| `agent_id` | `main` |
| `stage` | `parent.resumed` |
| `status` | `completed` |
| `resumed_from` | `synthesis` |
| `output` | *(exact copy of the `answer` markdown)* |
| `output_summary` | the cleaned answer summary |
| `output_raw` | **`''`** (empty for a prose return) |
| `workflow_state` | full JSON: `{acquisition:{station_id:MTA1, local_path:…, size_bytes:50424246, status:staged}, artifact:{kind:gnss_timeseries_plot, data_points_plotted:5000, uncertainty_bounds:{…}, y_axes:[…]}, geospatial:{bbox:[…], center_lat:34.05, radius_km:50, provenance:osm_nominatim}}` |
| `delegate_to`,`question`,`thought`,`depth`,`duration_ms`,`pack_id`,`provider_id`,`model_id`… | routing / bookkeeping |

## 3. What we USE vs DISCARD, and where each goes

| Category | Rendered as | Verdict |
|---|---|---|
| `reasoning` / `next_thought` | **THE ● DOT-TEXT** — an in-flow prose row rendered *before* `↩ … returns to …` | **USED** |
| `answer` → `output_summary` | the return one-liner text (`dropBareJsonSummary(cleanProse(output_summary))`, line 503/533) | **USED** |
| `output_raw` | **SHOW DETAILS** (`raw`, line 538: `rawResultString(firstNonEmptyRaw(output_raw))`) | **USED — but `output_raw` is `''` for prose returns, so "show details" is empty there**; only structured child returns (data/analysis) put JSON here |
| `workflow_state` | *nothing* — stays in metadata, never surfaced | **DISCARDED from view** |
| `provider_thinking:claude_code_sdk` | rendered as the `thinking (N chars)` block | **USED — but this is the raw meta-narration; it's the broken-message source** |
| `delegate_to` / `question` | the `call(child)` task sub-line | **USED** |

## 4. Why the "dot text" felt wrong (your original complaint)

- The **dot-text is `reasoning`/`next_thought`** (prose). **"show details" is
  `output_raw`** — a *different* field, and **empty** on prose returns. So the
  dot-text paragraph and an empty "show details (0)" look unrelated because they
  are different categories.
- The one genuinely structured category — **`workflow_state`** (station, bbox,
  artifact, uncertainty bounds) — is **discarded from the view**, even though it's
  the most "show-details-worthy" thing the extract produces.

**Decision options (unchanged, now grounded):** (1) relabel the reasoning dot-row;
(2) put `workflow_state` into "show details" instead of the usually-empty
`output_raw`; (3) drop the reasoning dot-text when it duplicates `answer`.
