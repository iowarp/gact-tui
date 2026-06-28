# clio issue: per-step ReAct `thought` is missing from the ordered transcript stream

**Filed by:** gact-tui rendering work (feat/context-update)
**Severity:** rendering-correctness (transcript is missing real model output)
**Verified against:** live wire capture of the EarthScope/LA blueprint run
(`clean-earthscope-la.wire.sse`), haiku provider.

## Summary

The clean transcript stream (`message.part.*`) does **not** carry the ReAct
`thought` that precedes each tool call. The thought exists — the model always
emits it — but clio only publishes it on the **`semantic.event` /
`react.step.completed`** channel, which gact-tui (by design) treats as
structure/telemetry, not transcript. The result: rendered turns jump straight
from a delegation header to a bare `tool_call`, with none of the reasoning text
that an LLM actually produced. Every step has text; the wire drops it.

## Evidence (from the capture)

`tool_call` message.part — no thought anywhere on it:

```
type=tool_call  keys = [agent_id, call_id, id, input, metadata, tool_name, type]
rationale = None   text = None   metadata = {stream_source, telemetry_source}
```

The thought is only here, on a different channel:

```
semantic.event  event_type=react.step.completed
  actor      = {agent_id: geospatial, role: expert}
  turn_id    = msg_user_b0b5df728a09
  payload    = { step_index, is_finish, tool_name, tool_args, observation,
                 thought, reasoning }
  thought    = "The request asks me to resolve \"Los Angeles\" to grounded
                coordinates and region definition. The question provides a place
                name but not explicit coordinates, so I need to call geo_geocode…"
  tool_name  = geo_geocode
  tool_args  = {query: "Los Angeles", countrycodes: us, limit: 1}
```

Same gap for the closing step (`is_finish`): its `thought` is the agent's
wrap-up reasoning, also only on the semantic channel.

## What we need

Emit each ReAct step's `thought` as an **ordered transcript part** positioned
immediately before its `tool_call`, attributed to the same `agent_id`/`turn_id`.
Either:

1. a `thinking` (or `text`) `message.part.added` carrying the step thought, or
2. a `thought` field **on the `tool_call` part itself** (we picked this as the
   preferred shape: one ordered channel, no client-side join).

Then the transcript renders as the model actually ran — `text → tool → text` —
straight from wire order, with no reconstruction in any client (web/desktop/TUI).

## Related ordering defects (same root: transcript ≠ what the model produced)

- **`GET /messages` (persisted) regroups parts by type** (all routing, then all
  handoffs with `delegate.started` dropped, then thinking, then text) with **no
  sequence/timestamp/index key** — so a reloaded turn cannot be restored to
  chronological order. The live stream is correctly ordered; persistence is not.
  Please persist parts in arrival order (or add a monotonic sequence key).
- **`expert_handoff delegate.started` is dropped on reload**, so the persisted
  turn loses the parent's delegation/task text entirely.

## Why we are not fixing this client-side

A client-side join of `react.step.completed.thought` onto `tool_call` (by
`turn_id`+`agent_id`+`tool_name`/`step_index`) is fragile and wrong in spirit:
it re-derives ordered model output from a telemetry channel, breaks on reload
(semantic events aren't replayed identically), and forces every client to
reimplement the same guesswork. The thought is first-class model output and
belongs in the ordered transcript.
