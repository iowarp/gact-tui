# CLIO Web/Desktop Conversation Rendering — Source of Truth

The single reference for how the conversation transcript must render. Distilled
from owner feedback over a long review session. **Read this before EVERY change.
Do not re-litigate anything here.**

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
