# CLIO Web/Desktop Conversation Rendering — Source of Truth

The single reference for how the conversation transcript must render. Distilled
from owner feedback over a long review session. **Read this before EVERY change.
Do not re-litigate anything here.**

---

## ★ CANONICAL CONVERSATION RENDER (authoritative — supersedes the sketches in §9.2)

The **entire** approved run is rendered out in
**[CANONICAL-CONVERSATION.md](./CANONICAL-CONVERSATION.md)** — read that as the
exact target. It is grounded line-by-line in the real EarthScope/LA wire capture.
Everything below in this file is consistent with it; where an older sketch (e.g.
§9.2's `⚙`/`STEP` sample) differs, **the canonical document wins**.

### Locked structural rules (these are the corrections that took several passes)

1. **Agent name = a colored header, shown ONCE atop that agent's block** (in the
   agent's category color). It is NOT glued to each line. It **reappears** when
   that agent *resumes* after control left it — e.g. `▎main` is shown again after
   a `⤶ returns to main`, because main is taking a fresh turn.
2. **`●` marks a TURN, never the agent name.** An LLM always emits text, so every
   turn has text. Each of these is its own `●` turn: a reasoning/thought, a tool
   call, a delegation decision, an answer. (Exactly the Claude-Code shape:
   `● text…` then `● Bash(…)`.)
3. **A delegation is one of the PARENT's turns.** `● → delegates to <child>` sits
   at the parent's depth; the task the parent sent is the line(s) directly under
   it (first-class, full prominence, not muted). The child's work indents **one
   level** beneath that turn. Recursive to any depth.
4. **`⤶ returns to <parent>`** closes the child block and hands control back.
5. **Tool result indents under its call with `⎿` and shows the REAL output** via
   the content-type path (§4) — never a `N items · M fields` count, never `ok`
   when the tool returned data, never the content-block envelope.
6. **Expand/collapse is for TRUNCATION ONLY.** A short result renders inline in
   full with **no** expand control. A long result collapses to a summary line
   with a `▾`/`▸` toggle and `expand`/`collapse` — the affordance appears *because*
   something is cut, never by default.
7. **Model text is always full, never collapsed** (rule §2 / §0.2). Only tool
   output compacts.
8. **Depth = indentation only.** No boxes, bars, or cards (§2.1).
9. **Workflow-contract glyph** (owner-approved 2026-07-11, iowarp/gact-tui#305):
   a small document icon on a delegation CALL row and RETURN row, shown ONLY when
   that row carries a non-empty typed `workflow_state`; hover shows the full state
   pretty-printed (titled `Workflow contract → child` on a call / `← child` on a
   return), click pins it (selectable, X / Esc to close). It is the ONLY glyph
   added to the flow — the contract is never rendered raw in the transcript.

---

## ★★ DSPy contract → render lanes (server-stream contract — DEFINITIVE, owner-confirmed 2026-07-09)

The client renders this **verbatim**; clio ("the agent") owns emitting it clean. Where this
conflicts with older sketches below, **this section wins.**

### The thinking lane (all kinds)

```
> thinking (n characters) ▼      PROVIDER-extracted native CoT ONLY. DSPy hides the CoT, so clio
                                 pulls it straight from the provider. Present on a reasoning
                                 provider (e.g. Haiku); absent where the provider doesn't expose
                                 it. Collapsed by default. THIS IS THE ENTIRE thinking lane —
                                 no DSPy contract field ever goes here.
```

Its one known defect: the provider CoT sometimes **overflows into the response** past the
`[[ ## field ## ]]` split boundary (clio #877).

### Agents come in three kinds — field meanings DEPEND on the kind

A blueprint declares `module.kind` (`predict` | `chain_of_thought` | `react`); the program is
built at `gact/agents/builders.py:1644-1658`. **`reasoning` is an overloaded field name — never
gate on the field name alone.**

| kind | program | visible response | has an extract? |
|---|---|---|---|
| `react` | `dspy.ReAct` subclass | **`next_thought`** (per loop step) | **YES** — post-loop `ChainOfThought` emitting `reasoning` + `answer` |
| `chain_of_thought` | `dspy.ChainOfThought` | **`reasoning`** — this IS its whole visible conversation | **NO** |
| `predict` | `dspy.Predict` | (declared outputs only) | **NO** |

EarthScope pack — `react`: geospatial, visualization, earthscope_station_catalog,
ndp_dataset_discovery, ndp_resource_resolver, gnss_timeseries_analysis.
`chain_of_thought`: **main**, data, analysis, **synthesis**, seismic_event_catalog,
station_network_analysis.

> ⚠️ Suppressing the field named `reasoning` without gating on `kind == react` would **delete the
> entire visible transcript** of main / data / analysis / synthesis.

### A `react` expert's loop step

```
> thinking (n characters) ▼      provider CoT
●  next_thought                  THE RESPONSE — its visible text (not "step reasoning")
●  tool_call(params)             next_tool_name(next_tool_args)
   ⎿ tool response               the observation (feeds the next step)
```

Exception: the final loop step's tool is `finish` — the **finish tool call is not rendered**
(only its `next_thought`, e.g. "… — finish.").

### A `react` expert's extract — SUPPRESSED ON THE AGENT (clio #878)

The extract (a `ChainOfThought` over the trajectory) emits `reasoning` + `answer`. **Both are
suppressed at the agent**, so neither reaches the `/v1` wire as a visible part; the extract emits
**no `●` bullet**:

- `reasoning` — dropped. Not brought to the parent, no conversational value.
- `answer` — very repetitive with the previous final-step `next_thought`; it survives only inside
  the return contract.

So the extract renders as the expert's **return to its parent**, contract hidden by default:

```
> thinking (n characters) ▼           provider CoT for the extract call
  <child> returns to <parent>   show more ▼
     └ return contract = { output/answer , workflow_state }     ← DEFAULT HIDDEN
```

`show more` == byte-for-byte the child's parent-bound `output`/`answer` (`delegation.py`
`row["output"]` ← the extract `answer`).

**This happens at the AGENT (server) — NOT in the web render.** The bullet vanishes because it
never reaches the stream. The client renders verbatim; it does **not** filter it out (that would
be a compensation, the exact thing we delete). Suppressing the *visible part* is not dropping the
*value*. The only client change is **deleting** the now-dead `isTerminalCompletionReasoning`
heuristic — no render-code changes.

### `main` and `synthesis` — main has no extract, and must not run after synthesis

`main` is `kind: chain_of_thought` (`main.md`): a single `ChainOfThought`, re-invoked once per
delegation round by the settle traversal, delegating via a **typed `next_expert` Literal output
field** (`builders.py:1164-1178`), not tool calls. It therefore has **no `next_thought` and no
extract**; its visible block is its `reasoning`. Its `answer` does not stream visibly
(`_answer_stream_visible = agent_id == "synthesis" or not workflow_state`, `builders.py:1799-1802`).

**`synthesis` IS `main`'s extract** — the final summarization pass, special because it holds the
full context, which is exactly why its response is genuine content and not a restatement.
`synthesis` writes the user-facing answer (`main.md`: *"your `synthesis` child writes the
user-facing answer, never you"*), and its `answer` is the one that streams visibly.

> ⚠️ **`main` must NOT run after `synthesis` returns.** Today the settle traversal re-invokes the
> parent after every child (`turn_delegation.py:1010`) — including after `synthesis` — and main's
> `answer` then becomes "the deliverable" (`turn_delegation.py:931-935`), restating what synthesis
> just wrote. That extra round is the ROOT of the double-answer (clio #736); the client's
> `dedupeRepeatedText` and the server's `suppressed_parent_resume_offsets` are both compensations
> for it. The fix: when `synthesis` returns, the turn ENDS and **synthesis's answer is the to-user
> response**.

---

## ★★★ Delegation `expert_handoff` envelope field-map (render-lane registry — owner principle, 2026-07-11)

The `expert_handoff` part carries a typed metadata envelope (SPEC §4.5). **An
unmapped typed field is invisible information** — every key the server emits must
have a decision ON THE RECORD here: either its declared render surface, or an
explicit "not rendered — <reason>". "Unmapped" is never an accident. This is the
render-lane analogue of the client-filter registry (SPEC.md Appendix A): each row
is a promise about where a typed field goes and why.

| key | render surface | rationale |
|---|---|---|
| `output` / `answer` | return row `show more` (byte-for-byte) | the child's parent-bound deliverable; verbatim, never summarized (#885). |
| `workflow_state` | #305 contract icon + popup on BOTH call and return rows (arrives on `delegate.started` via clio-agent#888) | the typed workflow contract; shown on demand, full bytes, never raw in the flow. |
| `status` | failure render on returns (`is-err` + status chip) | drives the failed-return render when `output` is empty (#882). |
| `error` / `message` | failure detail line under a failed return (`⎿ <error>`) | typed failure detail; the client never scrapes a failure sentence from `output`. |
| `stage` | transcript STRUCTURE only (`call(child)` / `returns to`; drives which lane a part takes) | lifecycle enum is wire vocabulary — never rendered as prose. |
| `parent_agent` / `child_agent` | transcript STRUCTURE (delegation graph → depth, owner headers) | names the edge; resolves indentation, never rendered as prose. |
| `question` / `input` | call-row task line, VERBATIM | the instruction the parent sent the child (first-class, not muted). |
| `thought` | (when on a tool_call) the `●` step reasoning above the call | the model's step reasoning (clio #732); on handoffs it is bookkeeping. |
| `agent_id` | not rendered — emitter attribution, already implied by the resolved owner/child | |
| `resumed_from` | not rendered — `parent.resumed` bookkeeping for the structural return twin | |
| `tools_called` | expanded into the child's tool rows (not a field on the header) | the per-tool rows already render; the array is a carrier, not a surface. |
| `duration_ms` | not rendered on the handoff — telemetry lives on the tool footer, not the delegation edge | |
| `depth` | not rendered — a server hint; the client recomputes depth from the delegation graph (generic, no trust in a vendor number) | |
| `delegate_to` | not rendered — a resolution alias for `child_agent`, already used for structure | |
| `pack_id` / `provider_id` / `model_id` | not rendered — provenance bookkeeping, no place in the flow | |

New typed keys land here with a decision the moment they appear on the wire — do
not let a field ship unmapped.

---

## 0. How I work on this (process rules — these failed before)

- **Verify against REAL runs only.** Live clio at `http://127.0.0.1:17800`, a real
  session, the real built web. **Never the mock/emulator** — the mock renders a
  *different code path* (`AssistantTurnView`) than real sessions
  (`execution_tree`), so mock screenshots looked "good" while the real screen was
  bad. This single mistake caused every "I still see the same thing."
- **READ raw, don't parse.** Dump the real render HTML and the real session JSON
  to files and **Read** them into context. Do **not** use python/jq to extract or
  summarize data into context — read the raw thing with the Read tool.
- **The REAL renderer** is the `execution_tree` path:
  `ExecutionTree.tsx` + `executionProjection*.ts`
  (`executionProjectionModel` / `Timeline` / `Preview` / `Report`), fed by the SSE
  **semantic events**. `buildAssistantTurnModel` returns null for real sessions, so
  `AssistantTurnView` is **dead code for real data** — do not edit it expecting
  results.
- **One coherent design.** No piecemeal random tweaks. Especially: **stop changing
  font sizes per element.**
- **Run real runs, iterate.** Make a change → rebuild → capture the live render →
  read it → fix again.

---

## 1. The goal

Render the conversation like the **TUI / Claude Code's own terminal log**: a flat,
indexed log that shows the **maximum model output** (every thought / reasoning)
while staying readable, compacting **only tool output**.

---

## 2. Core principles (non-negotiable)

1. **FLAT LOG. NO BOXES.** No bordered / backgrounded / rounded **cards** around
   messages, turns, the execution tree, or tool blocks. Indentation + a gutter
   marker only. Like Claude Code: `● step`, then `⎿ output` indented beneath.
2. **ONLY TOOL OUTPUT COLLAPSES.** Model text — main's thoughts, every expert's
   reasoning, the final answer — is **always shown in full, never collapsed.**
3. **SHOW ALL MODEL OUTPUT.** Main's thoughts, each expert's thoughts, the
   expert's thought when it requests a tool. Nothing summarized away.
4. **CONSISTENT TYPOGRAPHY.** One base body size for all transcript text.
   Differentiate by **weight/color only**, never per-element `font-size`. Nothing
   "tiny." Do not keep changing sizes.
5. **PROPER INDEXING.** A marker per step (`●` for a turn owner / action, `⎿` for
   its tool output indented under it). Delegation depth = **indentation**, not
   nested boxes.
6. **FULL WIDTH — no premature wrapping.** Text fills the content column. No
   narrow `max-width` / `width: fit-content` / `width: max-content` on text,
   markdown, task, result, or answer containers that wraps a line at ~half width
   and leaves a large whitespace gap on the right. This currently happens on
   *some* blocks but not others — make it uniform and full-width everywhere. (Seen
   live: "…with a 100 km" / "S 33.659541" / "…Nominatim" each broke mid-column
   with a massive right gap.)

---

## 3. Conversation shape (what each turn must contain)

For each delegation (e.g. `main → geospatial`), in flow, indented by depth, NO box:

- `● main → geospatial` — one line. **The task main sent** = one inline muted line
  under it, NOT a boxed "↳ task" card.
- **main's own thoughts/reasoning** around the delegation (currently missing —
  must be shown).
- `● geospatial` as the turn owner, then **its own reasoning/thought text** (full).
- **its thought when requesting a tool**, then the tool call:
  `⎿ tool_name(args) · Nms` → a **semantic preview of the real data** (see §4).
- **what the expert returned to main** (its result).

Final answer: `● Answer`, full markdown, **never collapsed**.

The owner must be able to read, for any expert: *what main asked it, what it
thought, what it did (tools), and what it returned.* And see that an expert is
**taking a turn** — not a free-floating task + tool.

---

## 4. Tool output — the ONE thing that compacts (render by CONTENT TYPE, never by tool name)

**Backend-agnostic rule:** the renderer detects what the result *is*, not which
tool produced it. **Never** special-case a tool name (`geo_geocode`, `ndp_*`,
`pandas_*`, …) — a generic GACT client carries zero backend vocabulary. The set
is extensible; start with:

- **Image** (an image part, or a path with an image extension) → render **inline**
  (thumbnail → click to enlarge). Never as JSON.
- **Diff** (a unified diff) → render with `+/−` line coloring.
- **Markdown / prose** → render as markdown.
- **CSV / tabular** (a header line + rows, or a profile carrying `columns[]`) →
  a small **table of the columns + ~3 example rows**, nicely formatted.
- **Structured JSON / object** → the backend-provided `summary` / `preview` +
  key fields.
- **Plain text** → text.

Always collapse the **long tail** by size with a working expand + a `show raw`
toggle. The reference implementation is the **TUI's** content-type rendering —
`tui/internal/ui/execution_observations.go` (`executionSpecificObservationPreview`,
CSV / artifact / diff previews) and `render_previews.go` (`collapseForPreview`).
Mirror it; do **not** modify `tui/`.

---

## 5. Strip injected scaffolding

These must **never** appear in the rendered conversation:
- `(In progress—routing to synthesis…)` / `(In progress—awaiting…)`
- `[...delegation output truncated; exact evidence retained below...]` and the
  `[exact retained evidence index]` blocks.

---

## 6. Other surfaces that must be present

- **The context view we designed** — the Claude `/context`-style **segmented bar**
  (`ContextFooter` + `ContextPanel`, `context-usage.css`). It is currently missing
  from the live render and must be restored.
- **The composer (user input box)** must match the **content-column width** — the
  same width as the answer / transcript area. It is currently tiny; make it the
  full content width.

---

## 7. Verbatim owner feedback (do not contradict these)

- "we only compact tool returns nothing more, just like the tui"
- "the turns should not be hidden"
- "i don't get your insistence of everything having to be on a box"
- "we are now collapsing messages for no reason" / "you are collapsing text, not
  emitting and showing some text"
- "zero rendering zero collapsing" (on a raw-JSON tool result)
- "where is all the data, like we had it there before"
- "this is also tiny now" / "you keep changing the font size of different things
  randomly for no reason, without any sense"
- "what is the message from main to analysis, what is a turn of analysis, what is
  the thought of analysis when requesting that tool, what did analysis return to
  main"
- "main usually has thoughts that are not being represented here"
- "why is there still injected messages (In progress—…)"
- "you run real runs you iterate" / "no more emulations"
- "read it literally put things on files and READ them, don't python them into
  your context"
- "where is my context view that we designed"
- gold standard: make it read like **Claude Code's own output** — `● action`,
  `⎿ tool output` indented, proper indexes, collapsible (tools only).

---

## 9. Live-streaming path (from live mid-run review — CRITICAL)

A turn renders via TWO paths: persisted message → `AssistantTurnView` (clean,
fixed); LIVE streaming (SSE events) → the **execution-projection / ExecutionTree**
(`extree__*`) + a `ConversationExecutionTrace` (`cx-trace*`) disclosure. The owner
only sees the **live** path during a run, and it is the old boxed renderer. The
live path MUST be made identical to the clean `AssistantTurnView` render. Required:

- **Markdown everywhere.** ALL text (answer, each expert's reasoning) renders as
  markdown — NEVER literal `**asterisks**`. (Live path currently shows raw `**`.)
- **Real tool result, not a count.** The tool result must render the ACTUAL data
  via the content-type path (geocode → resolved place + lat/lon; CSV → table; …).
  NEVER a generic `N item · M fields` count summary.
- **Turn delineation.** `main → <expert>` is the delegation *operation* (an edge).
  Under it the expert takes **turns**, each turn = reasoning text → tool call →
  tool response. A new reasoning block is the next turn. The turns must be
  **visually delineated** (you can tell turn 1 from turn 2), not blurred together.
- **Routing is a subtle chip**, not a line. The backend emits `(Routing to X
  expert …)` status text (clio-generated, not the web) — it must NOT appear as a
  noisy parenthetical in the flow.
- **No `extree` box / "agent execution" label; no `cx-trace` "Execution trace"
  disclosure; consistent font (kill 10px/11px); user prompt full width** (it wraps
  at ~50% today).
- **Verify MID-STREAM** — a reloaded session renders via `AssistantTurnView`; you
  must capture while a run is live to see the execution path.

### 9.1 The conceptual model (CORRECTED, from live design review)

The conversation is a **hierarchy of agent turns** joined by **light delegation
edges**. Get this model right, not just the styling.

- **An agent TURN = one LLM round of that agent: its thoughts (reasoning) + its
  action** (a tool call, a delegation decision, or a final answer). An agent may
  take several turns.
- **`main` has its own turn(s) that must be shown.** main receives the user
  prompt → the LLM returns **main's thoughts + the routing/delegation decision**.
  Surface main's reasoning (from the stream — `llm.response.completed` for main;
  the clio asks cover the redaction/scaffolding). Do NOT show only the routing.
- **A delegation (`main → geospatial`) is a LIGHT EDGE, not a panel.** Render it
  subtly — a **small dot + spacing/indent** to mark the separation and the prompt
  main passed. **No heavy green left-bar / bordered rule.** It is an operation, not
  a container.
- **The expert's execution is SEPARATE from the handoff.** After the edge, the
  expert (geospatial) runs **its own turns, owned by it** (label/marker = the
  agent). geospatial's "The user request names a place…" is geospatial's turn, not
  the handoff.
- **Each expert turn must be visually delineable.** e.g. geospatial turn 1 =
  reasoning → `Geo Geocode(…)` → result; turn 2 = reasoning → return. The reader
  must be able to count turns 1, 2, … per agent.
- Depth/nesting = **indentation + a subtle dot marker**, never a colored bar.

### 9.2 The React-loop turn shape (DEFINITIVE — confirmed with owner)

Each expert invocation renders as: **[0] parent prompt → [1..N] turns → return**.

- **[0] Parent prompt** — the delegation task the parent sent this expert (input,
  not an LLM turn). Shown first as the opening context. (Dropping it = "misses
  step 0".)
- **[k] A turn = ONE LLM response = its reasoning text + the SINGLE action it
  takes** (a tool call, or `finish`). Reasoning and the tool call are the **same
  turn** — the reasoning is the LLM deciding to call that tool; never split them
  into disconnected blocks.
- The tool **result (`⎿`) is the observation** that feeds the NEXT turn.
- **`→ returns`** — the structured result handed back to the parent (the final
  step). Render its key fields.
- Model wording like "STEP 1/2/3" is just the model narrating its plan — it's the
  model's text, render it; do not invent or strip it.

**Turn marker = `●` per turn (DECIDED with owner).** Each turn starts with a `●`
+ its reasoning; `⚙` the tool call and `⎿` the result indent under it; a blank
line separates turns (gap alone is NOT enough — the `●` is what makes the
boundary unambiguous). The parent prompt opens with `↳`, **FULL prominence (NOT
muted)** — it's as important as anything; the return uses `⮑`. Agent name is a
header, depth = indentation + light dots (no bars).

```
ndp_dataset_discovery
  ↳ search the NDP for EarthScope GNSS station metadata…        (parent prompt [0], muted)

  ● STEP 1 search — narrow earthscope/converted terms
    ⚙ ndp_search_datasets(search_terms: earthscope, converted)
    ⎿ count: 1 · EarthScope Stations Dataset

  ● STEP 2 stage the resource by URL
    ⚙ ndp_stage_resource(url: …earthscope_converted_data.csv)
    ⎿ ok · staged …converted_data.csv · 153082 B · text/csv

  ● STEP 3 clean — keep first 3 columns
    ⚙ shell_bash(cut -d, -f1-3 … > …clean.csv)
    ⎿ (no output, exit 0)

  ● all three done — finish
  ⮑ returns: metadata_found · metadata_path …clean.csv · analysis_ready false
```

FULL CONVERSATION MODEL (authoritative — `main` is an agent with turns; a
delegation is one of main's turns; the child indents ONE LEVEL below it;
RECURSIVE; the `<agent> returned` hand-back is KEPT; the task is FIRST-CLASS,
never muted; depth = indentation + light dots, never bars):
```
GACT
  ● main — thinks "<main's own reasoning>"
  ● main — delegates to geospatial
       Resolve 'Los Angeles' into coordinates…             (task — full prominence)
       geospatial                                          ← indent one level
         ● thinks "…" → ⚙ geo_geocode(…) → ⎿ Los Angeles 34.05,−118.24
         ● thinks "…" → finish
         geospatial returned                               (KEEP the hand-back)
           center 34.05,−118.24 · 100 km · high confidence
  ● main — delegates to data
       Discover EarthScope GNSS stations…
       data                                                ← indent one level
         ● thinks "…" → delegates to ndp_dataset_discovery
              Search the NDP for metadata…
              ndp_dataset_discovery                        ← indent again (recursive)
                ● STEP 1 → ⚙ ndp_search_datasets(…) → ⎿ count: 1
                ● STEP 2 → ⚙ ndp_stage_resource(…) → ⎿ ok · 153082 B
                ● finish
                ndp_dataset_discovery returned
                  metadata_path …clean.csv · analysis_ready false
         data returned …
  ● main — final answer (markdown)
```

Rules locked: ● per turn; reasoning + its action on the same turn; ⚙ tool call,
⎿ result indented; blank line between turns; the delegation TASK is first-class
(not muted); each delegated agent indents one level under the delegating turn;
`<agent> returned` + its return content is always shown.

## 8. Definition of done

On the **live** EarthScope session, captured from the real page and read raw:
- No card boxes anywhere in the conversation.
- One consistent, readable font; nothing tiny.
- Each expert turn shows: owner, main's task to it, main's + the expert's
  thoughts, its tool calls with semantic+collapsed real-data output, its return.
- Tool output (only) collapses; all model text is full.
- Plot renders inline; no `(In progress)` / truncation scaffolding.
- The context segmented bar is present.
- Reads like Claude Code's flat indexed log.
