# CLIO Conversation Render Contract

Status: owner-approved and locked as of 2026-08-27.

This contract replaces the deleted `apps/web/CANONICAL-CONVERSATION.md`. It defines the
conversation grammar shared by the browser and desktop application. The legacy document's nested
agent-log composition is not the target. The approved product has two presentations of one
authoritative transcript: **Full** and **Chain**.

Changes to this grammar require explicit owner review. A visual refactor, component replacement,
or transport change must preserve every causal and losslessness rule below.

## 1. Authority and losslessness

The focused session transcript is the only source of conversation content. Its ordered message
blocks arrive through the GACT session stream and reconcile with the authoritative session
snapshot.

- A renderer may group canonical blocks for presentation, but it must not invent, summarize away,
  merge, duplicate, reorder, or relabel their meaning.
- A semantic trace, observability record, process timeline, or provider diagnostic may enrich the
  Observability canvas. It may not add conversation content or repair the transcript in React.
- `sequence` orders blocks when present. Stable wire order is the fallback when a historical block
  lacks a sequence.
- Unknown future block types remain visible as a typed placeholder. The rest of the message stays
  readable.
- Incomplete, interrupted, failed, and cancelled turns remain visibly incomplete. They never gain a
  fabricated final iteration or answer.
- Provider names are provenance, not presentation categories. Reasoning is labeled `Thinking`
  unless the server supplies a user-facing semantic label; the UI does not hard-code provider-
  specific thinking grammars.

This boundary is especially important when the provider transcript and semantic ReAct trace both
describe the same action. The transcript wins. Rendering both projections as conversation content
is corruption, not additional observability.

## 2. Turn and iteration model

A **turn** begins with one user message and contains the assistant response produced for that
request. The response may be completed, interrupted, cancelled, or failed.

An **iteration** is an ordered slice of an assistant response:

1. zero or more canonical reasoning blocks;
2. zero or more visible `next_thought` text blocks;
3. zero or more tool invocations emitted by that model response.

A new canonical reasoning block after visible text or tools starts the next iteration. Multiple
tools emitted by one model response stay in the same iteration and preserve their wire order. The
UI never creates an extra iteration merely to obtain a one-tool-per-row layout.

The final normal iteration has no tool invocation. Its `next_thought` is still activity text; the
user-facing final answer remains the canonical `answer` block that follows the activity. A partial
turn with no tool is not considered final unless the message completed normally.

Iteration numbers are internal identity only. The UI does not print `Iteration 1`, `15 model
steps`, or similar bookkeeping when causal order already communicates the structure.

## 3. Shared projection rules

Full and Chain consume the exact same assembled iteration objects. Switching modes changes detail,
not content or ordering. The toggle belongs to the assistant turn and does not navigate away from
the transcript.

Each iteration exposes:

- canonical reasoning text;
- visible next-thought text;
- every tool call in order;
- any child/background work correlated to the tool that started it;
- live, terminal, or interrupted state;
- a concise disclosure label for Chain mode.

The concise label is presentation metadata, not a replacement transcript. It uses the canonical
visible next thought when available, then canonical reasoning, then the first tool's user-facing
title. It must not be synthesized from semantic traces or copied back into Full mode as new text.
Expanding the disclosure always reveals the exact Full slice from which it was derived.

## 4. Full mode

Full mode presents each iteration directly, without an iteration wrapper heading:

1. **Thinking** — AI Elements `Reasoning` for every canonical reasoning lane. It opens while its
   block streams, closes calmly after completion, and remains manually keyboard-accessible. A
   finished block must never say `in progress`.
2. **Next thought** — visible assistant text in the causal position supplied by the transcript. It
   is not renamed `Final thought` and does not receive decorative taxonomy.
3. **Tool cards** — one card per actual invocation, immediately after the text that led to it.
4. **Correlated child/background work** — immediately after its owning tool, not collected into a
   duplicate list at the end of the conversation.

Reasoning and tool details begin collapsed unless actively streaming or awaiting an action that
requires attention. Users may expand them in place. Collapsing content is a view preference and
never removes it from the transcript model.

## 5. Chain mode

Chain mode is the compact activity presentation. It uses the sourced AI Elements
`ChainOfThought` composition and renders one disclosure per assembled iteration.

- The current streaming disclosure opens automatically so incoming reasoning, text, and tools are
  observable.
- It closes after completion; the user may reopen any disclosure.
- The summary line contains the concise activity label. A tool icon belongs to the actual tool row,
  not to the summary.
- Tool state may appear as subordinate metadata when it materially explains what is running or why
  the iteration stopped.
- Expanding a disclosure renders the same Thinking, next-thought, tool, and correlated child work as
  Full mode.
- Switching the turn to Full mode expands the complete turn projection without changing the
  canonical block set.

Chain mode is not permission to discard provider reasoning or tool output. It is a navigable index
over the lossless Full projection.

## 6. Tools and tool reasoning

Tool cards use the sourced AI Elements `Tool` composition behind the CLIO presentation adapter.

- The server-provided display title is authoritative. A clean humanized fallback is allowed only
  when the server supplies no title; raw identifiers such as `fs_read_file` are not primary labels.
- The input section heading is **Arguments**.
- The result section is **Result** or **Error**, according to the authoritative tool outcome.
- Pending, running, succeeded, failed, denied, and cancelled states remain distinct and labeled.
- Duration is supplemental metadata and never substitutes for state.
- The full arguments and result remain available inside the disclosure; compact summaries do not
  replace them.

Some historical tool blocks carry a `thought` field that repeats the model's next-thought text. The
approved rule is:

1. a canonical `next_thought` block renders in the iteration's text lane;
2. a tool `thought` is ignored when that lane already has text;
3. only when the canonical lane is absent may the tool `thought` fill that lane immediately before
   the tool;
4. it never renders again inside Arguments, Result, or a second Thinking box.

This preserves recoverable historical content without duplicating modern transcripts.

## 7. Child and background activity

Starting a child agent, skill-driven child, relay job, MCP task, background application, or other
asynchronous work is a tool-mediated action. Its transcript representation stays at that tool's
causal position.

- Plain click on a child opens the child as the central conversation.
- Shift-click opens it as a durable right-canvas tab.
- A visible secondary action provides the canvas behavior to keyboard and touch users.
- Long-running activity remains reachable through the shared background-activity control and the
  Observability canvas without duplicating its transcript card.
- Child sessions do not appear as primary sessions in workspace navigation.
- Assignment, state, duration, and result remain available; decorative nested chrome does not carry
  meaning.

The Observability canvas may show richer Gantt/timeline relationships, including the main agent and
tool calls within children. It is a peer view of the same work, not a second transcript.

## 8. A2UI, artifacts, and other residual blocks

Reasoning, next-thought, and tool blocks form the structured activity projection. All other message
blocks are **residual blocks** and remain lossless.

Within the residual sequence, the renderer preserves canonical order for:

- A2UI surfaces and updates;
- artifacts and resources;
- plans and tasks;
- approvals, questions, and action cards;
- citations and diffs;
- routing or compaction metadata;
- typed errors;
- unknown future blocks;
- the final answer.

A2UI is useful presentation chosen by the agent or skill, not prose the user must request. A surface
appears as a first-class interactive block associated with its creating work; it is not raw JSON and
is not forced into one end-of-turn dashboard. Surface creation, streaming updates, ready state,
failure, and deletion use the same labeled live-state grammar as native content.

Artifacts use the native AI Elements-backed artifact card. The card itself is the open target;
there is no redundant `Open` button or raw URI. Static images may be subordinate fallbacks for an
interactive analysis view, but they do not duplicate that view inline.

Adjacent artifact blocks render as one AI Elements `Attachments` grid without changing their wire
order or entity identity. Tiles use a compact, consistent footprint that is large enough to scan in
the transcript; the preview/icon is vertically centered above one single-line filename with its
extension preserved, followed by quiet media-type and size metadata. The grid is only a visual
group: activating a tile replaces the artifact-index canvas tab with that artifact, while
Shift-click may retain the index in a split canvas when space permits. Hover details supplement the
tile and never contain its only required information.

If an entity referenced by a residual block is unavailable, the renderer shows a bounded typed
state at that exact location. It does not silently omit the block.

## 9. Streaming and interaction acceptance

- Incoming deltas are frame-batched; animation does not invent or delay text.
- Active Thinking opens while streaming and closes after completion. This behavior is intentional.
- Reasoning, assistant text, tools, A2UI, and background work share a labeled live grammar.
- Completion flushes every received delta before the live state settles.
- Switching Full/Chain, expanding details, or opening child work never moves transcript focus or
  changes canonical ordering.
- Hover-only actions have keyboard and touch equivalents.
- Reduced motion removes spatial sweeps while retaining immediate state and disclosure changes.
- Large transcripts virtualize inactive rows while keeping the active streaming block mounted.

## 10. Acceptance examples

The contract is satisfied only when all of these remain true:

1. one provider response containing two tools renders one iteration with both tools in wire order;
2. a repeated tool `thought` does not duplicate the canonical next thought;
3. a streaming Thinking disclosure opens, then closes after completion while remaining manually
   expandable;
4. Chain expansion and Full mode show the same canonical content;
5. a spawned child appears beside the tool that started it and opens centrally or in the canvas by
   the shared click contract;
6. A2UI, artifact, error, and final-answer residuals retain their canonical relative order;
7. an unknown block produces a visible typed placeholder without hiding later content;
8. a cancelled partial response is interrupted, never mislabeled as final;
9. no semantic trace record can add or replace transcript content;
10. tool details say Arguments and keep their authoritative Result or Error available.

The Phase 4 live EarthScope/NDP and SPOTTER screenshots are acceptance evidence against this file,
not a source from which the grammar may be reinterpreted.
