# The clio-agent ↔ human interaction channel

**Design notes — July 2, 2026.** Companion to (and in several places a correction of)
`clio-mcp-ui-design-brief.md` (June 27). Where the June brief scoped "adding interactive UI
via MCP Apps," this doc reframes the work as a single cohesive entity — a **bidirectional
structured interaction channel** between the agent and the human — and records the design
conclusions reached in conversation, including the ones that supersede the brief.

Nothing here is built yet. This is the settled *shape* the implementation should key off.

---

## 1. The reframe: it was never "MCP-UI support"

The feature is clio's **structured, non-text interaction channel**: the general capability for
the agent and the human to exchange *structured* turns in both directions, beyond plain text.
Everything discussed collapses onto that. MCP-UI rendering (maps, timelines, charts) is one
surface on the channel; agent-asks-human clarification is another. They are two facets of one
mechanism, not two features.

This reframe is load-bearing because it dictates how the work is decomposed (§7): as **one
entity designed whole**, not as render-only-now / interactive-later phases.

## 2. The three axes (separated by *initiator*, not by surface)

The distinguishing axis is **who initiates** and **where the answer goes** — not "how rich is
the widget."

| Axis | Flow | Model aware? | Example |
|---|---|---|---|
| **1. AskUserQuestion** | `LLM → human` (ask), `human → LLM` (answer as tool result) | yes | "Which approach: A, B, or C?" |
| **2. MCP-UI** | `MCP → human` (render), `human → LLM` (decision via the surface) | yes (via the decision) | click a station on a map, submit |
| **3. MCP elicitation** | `MCP → human` (form/url), `human → MCP` (answer) | **no — LLM-blind** | a tool needs an API key mid-run |

Axis 1 and Axis 2 are what the two anchor use cases (§6) need. Axis 3 (elicitation) is **in
scope** but is a distinct, separable capability: the MCP *server* reaching out to the human on
its own initiative, transparently to the model. It is not required by the anchor cases and
carries the thorniest security surface (URL mode), so it is gated and additive (§5).

Note Axis 2's producer is the **MCP server** (e.g. the geo server owns the map), which is why
it is not merely "AskUserQuestion with a nicer skin" — different initiator, different plumbing.

## 3. Three interaction *primitives*, not one

An earlier draft wrongly merged these through the SDK's `canUseTool`. They are distinct, by
initiator, and clio is **multi-provider** (the Claude Agent SDK is *one* provider among
several — exec, dspy, etc.), so nothing may be modeled as SDK-specific:

| Primitive | Initiator | Shape | clio mechanism |
|---|---|---|---|
| `ask_user_question` | the LLM | a **tool call**, human-fulfilled | a clio-native tool (shell_bash-shaped); the executor emits the interaction, awaits the answer, returns it as the tool result |
| permission / approval | host / policy | a **gate** around a tool call | clio's existing process-global permission gate (an interceptor, not a tool) |
| MCP elicitation | an MCP server, mid-tool | the one real "ask while running" case | MRTR round-trip (server yields `InputRequiredResult`, clio re-issues) |

### 3.1 `ask_user_question` is a normal tool

The universal primitive across *every* provider is the agent loop's tool-call boundary: the
loop stops to execute a tool and resumes with its result. `ask_user_question` is a tool whose
"execution" is *waiting for a human*:

```
read(file):            call → executor reads disk      → result → resume
shell_bash(cmd):       call → executor runs subprocess  → result → resume
ask_user_question(q):  call → executor shows q, waits   → result → resume  (result = the human's answer)
```

There is **no mid-execution callback** — just a tool whose result has unbounded latency and
completes out-of-band. This is provider-agnostic by construction (works for exec, dspy, SDK
alike), unlike an SDK `canUseTool` bridge which would only cover the SDK provider. The SDK's
built-in AskUserQuestion + `canUseTool` is merely *one provider's* implementation of this row
and must not become clio's universal model. (`canUseTool` re-enters only as the SDK provider's
*permission* implementation — the second row.)

The one requirement this puts on clio: the tool executor must **park a call and resume it on an
out-of-band re-POST** (a coroutine awaiting a future that resolves when the answer arrives).

## 4. No new turn state

An earlier draft proposed `turn.state = awaiting_interaction` as "the single new state." That
was over-engineered. A tool call is *already* a stop point.

- **choice / form / url (blocking):** the turn is "in progress, a tool in flight" — the
  existing tool-execution suspension, with a human on the slow end. elicitation's
  `InputRequiredResult → ask → answer → re-issue` is a tool-call round-trip. No new state.
- **show (usually non-blocking):** the tool *completes* and returns the UI; the turn can
  finish. The human's interaction returns **later, attached to their next message** (§5.1),
  not as a suspension. So "all four share one new state" was doubly wrong.

Whether something blocks is **orthogonal** to its kind: a map can be blocking ("pick one to
continue") or non-blocking ("here's a plot, comment whenever"). Blocking rides the tool-call
suspension; non-blocking rides "a later user message with attached state."

**The only genuinely new wire affordances** (both additive to the existing tool-call model):
1. a **"human-completable" marker** on a pending `tool_call` (so on render *and* on
   reconnect-replay the frontend knows it owes an answer, vs. a tool the backend computes
   itself), and
2. an **answer-submission endpoint**, keyed by the tool-call id.

And even these are **not new in kind** — clio already blocks a turn on a human **permission**
decision and resumes on the frontend's response. "Backend blocked, awaiting a frontend-supplied
value, resumed by re-POST" is the *existing permission mechanism*. The interaction channel is
that mechanism with a richer body. What is actually new is only **payload shapes** + the
completable flag.

## 5. Transport: the duplex lane is not needed

The June brief's §5 (a scoped duplex WebSocket lane, "where the weeks are") rested on
interaction being *server-initiated, mid-turn* push. The MCP 2026-07 spec RC
(**SEP-2322, Multi Round-Trip Requests**) removes that premise: it **replaces** server-initiated
`elicitation/create` / `sampling/createMessage` / `roots/list` with a round-trip — the server
returns `InputRequiredResult { inputRequests, requestState }`, the client collects input, and
**re-issues the original call** with `inputResponses + requestState`. That is a suspend-and-resume
request/response, which **REST+SSE does natively** (emit the interaction part on SSE, re-POST the
answer carrying the opaque `requestState`).

**Conclusion: the whole channel stays on REST+SSE. No duplex lane.** This supersedes the brief's
§5 recommendation.

### 5.1 The interactive-artifact conversation loop (Axis 2, in full)

The vision that most justifies Axis 2 is *explore visually, then converse about what you
explored*:

> agent renders an interactive plot → human brushes a time window → human says "give me a static
> image with just this timeframe, only the north series, no title (it's for a paper)" → agent
> re-invokes the plot tool with the refined params → new static artifact.

Design resolution:
- **Most of the reference the model already has** — it authored the plot, so it knows the
  series and the title. The *only* genuinely-new, iframe-local thing is **the human's
  selection.** The return channel carries deltas, not whole state.
- **Attach the active artifact's state to the human's next message** — do not stream every
  zoom/brush back (context spam). "this timeframe" resolves to the selection snapshot bundled
  with that turn. (Small addition to the message-send shape: an outgoing user message may carry
  a referenced artifact's state.)
- **Two real requirements, both bounded:** (a) the component reports selection **semantically**
  (`[t0,t1]`, not pixels) — so it's more than a passive Plotly embed, but it's built once per
  component; (b) the tool is **parameterized** for range/series/title/format so the agent can
  re-render a static export. Same tool, two modes (interactive-explore vs static-export).

### 5.2 Semantic vs pixel grounding — per-component, self-describing

- The MCP Apps `updateModelContext` channel is **native but opaque**: it carries anything, but
  the protocol defines *no* vocabulary for "point at a thing," no annotation UX, and nothing
  about vision. Those are **authored per component**, which is exactly what the opaque-tunnel
  design wants (the contract carries `{action, content}` with component-defined `content`).
- **Make the payload self-describing** (natural language + optional structure + optional pixel
  crop) so any LLM can consume it with no shared schema. Semantic-vs-pixel is just *how much the
  component pre-digested*:
  - **semantic** (preferred): the component extracts domain values (a plot can). Any LLM.
  - **pixel + VLM** (fallback): only "user circled *this* region" + a crop; needs a
    vision-capable model. For surfaces that model nothing (a flat rendered image).
- **What is referenceable is per-component and deliberate** — a component can be pointed at and
  instructed only for the things it chose to model. "Change the font of this text" is cheap if
  the agent authored the text (semantic re-render) and expensive if it's opaque baked-in pixels
  (needs VLM grounding *and* an image-editing path).
- **Annotation-on-selection** (type an instruction anchored to a selection, *inside* the
  iframe) is a nice UX that turns `show` into an input surface. It is **app-authored UI**, not a
  protocol feature — its home is the shared component library, built once.
- The **pixel/VLM path is capability-gated on the model** (can this session's model see?).

### 5.3 Elicitation gating (Axis 3)

MCP elicitation must be gated on **client capability** (`clientCapabilities.elicitation.{form,url}`;
servers MUST NOT send undeclared modes — same discipline as MCP Apps'
`ctx.client_supports_extension`). The catch: from clio-kit's view the "client" is **clio-agent**
(the FastMCP proxy), not the human's frontend. So capability must **propagate end-to-end**:

```
frontend GACT caps (interaction_form/url) → clio-agent's declared MCP client caps → clio-kit's elicit-or-fallback
```

clio-agent is the **translator** between the GACT capability flags and the MCP client
capabilities, and "client support" is a **derived, per-session** property, not a static
server-pair handshake. Because clio-agent runs one aggregating proxy but serves many sessions
with different caps: **declare optimistically at the gateway, apply the real gate per-session at
the GACT boundary** — if a session's frontend can't surface a form, resolve that elicitation with
`action: "decline"`/`"cancel"` + a structured reason (a *valid* response, not a fake). Every
clio-kit server that elicits needs a **real fallback branch** — return the data it has, or a
structured "input required, unavailable here" — never pretend it got the answer (cleanup rule 1,
no silent fallback).

## 6. Anchor use cases

The **EarthScope** anchor spans **two `show` surfaces**:

- **EarthScope geo/station map** — the **founding consumer** (§7). It is the case that exercises
  the *return* direction (station-select → the model), so the substrate cannot be designed
  without it. `MCP → human` map, `human → LLM` selection.
- **EarthScope `plot_timeseries`** — the interactive chart (zoom, legend toggle, hover-snap)
  **and** the §5.1 brush-a-window → re-render-to-static-export loop (the "paper-ready image of
  just this timeframe, north only, no title" flow). Its return payload is the brushed selection.

Deferred beyond this pass (the substrate supports them later):

- **Darshan I/O timeline** — a further `show` consumer (timeline component); interactive
  zoom/pan/hover, largest context-window win.

These map onto the brief's four reusable components (build once, point many servers at them):
**chart** (plot, darshan metrics), **table** (pandas, slurm), **map** (geo/EarthScope),
**timeline** (darshan I/O, chronolog).

## 7. Decomposition: one entity, not phases

**The anti-pattern to avoid** (called out explicitly): slicing cohesive design/implementation
work into horizontal waves that each patch every layer (contract, clio, frontend). That is what
produces god-files, churn, and dead code. "Render-only now, bridge later" is exactly this trap —
the no-op scaffolding built to be flipped later *is* the dead code.

**The correct cut is vertical, by cohesive entity:**
- **One cohesive unit, co-designed and built whole:** the interaction channel — the wire
  payload kinds, the human-completable tool_call + answer endpoint, the capability flags, clio's
  tool-executor parking + elicitation handling + the existing permission-gate reuse, the
  frontend host glue — **plus the geo/station map** as the consumer that proves every path
  (including the return direction). The map is *inside* the founding unit precisely because
  leaving it out forces the substrate to be built twice.
- **Then genuinely independent consumers:** the Darshan timeline and the plot chart, added on a
  finished substrate. Adding one does not reopen the channel or the map. *This* is legitimate
  sequencing (another whole component on stable rails), as opposed to another horizontal layer
  of completeness smeared across all components.

## 8. Non-negotiable invariants (write these into the build)

So nobody "simplifies" the design back into a trap:

1. **No new turn-state machine.** Blocking interactions reuse the tool-call suspension and
   generalize the permission-response round-trip; non-blocking artifacts ride "a later user
   message with attached state." The only new wire bits are payload shapes + a human-completable
   flag on a pending tool_call + an answer-submission endpoint.
2. **`ask_user_question` is a clio-native tool** (shell_bash-shaped, provider-agnostic), **not**
   an SDK `canUseTool` bridge. clio is multi-provider.
3. **Stay on REST+SSE** — model interaction as the SEP-2322 round-trip. No duplex lane.
4. **Opaque, self-describing payloads.** The contract carries `{action, content}`; `content` is
   component-defined; components emit NL + optional structure/pixels. No universal "pointing"
   schema.
5. **Elicitation is gated per-session, derived end-to-end**, and every producer has a real
   fallback. No silent fallback anywhere.
6. **Capability-gate every kind** (`interaction_choice`, `interaction_form`, `interaction_url`,
   `interaction_show`, plus model-vision for the pixel/VLM path) so frontends degrade honestly.
   The Go TUI renders choice/form/url natively and falls back to text on `show`.
7. **Spec-first** (CLAUDE.md rule 5): wire-visible changes land in `contract/SPEC.md` + the
   conformance suite first, then propagate to emulator, clio-agent, adapters, and clients.

## 9. Scope boundaries & open items

- **Reachable in this repo (gact-tui):** the wire contract + conformance, the **emulator**
  (stands in as the backend so the channel is testable without clio), the Go **TUI** rendering,
  and **apps/web** iframe rendering. This is the whole *GACT side* and is a self-contained slice.
- **Separate repos (not here):** **clio-agent** (the real backend: tool-executor parking,
  elicitation handling, capability translation) and **clio-kit** (the MCP servers emitting
  `show`/elicitation). Those are their own efforts, keyed off the same settled contract.
- **Open:** confirm the exact `InputRequiredResult`/SEP-2322 envelope against the pinned spec;
  confirm FastMCP proxy preserves `_meta.ui` on re-exposed tools (brief §6 Q1); the URL-mode
  elicitation security requirements (show full URL, no pre-fetch/pre-auth, sandboxed open) are
  load-bearing and cannot be hand-waved.
