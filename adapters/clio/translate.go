package clio

// Placeholder — GACT <-> CLIO event translator.
//
// Incoming (CLIO SSE events):
//
//   event: routing         data: {"selected_expert": "data"}
//   event: chunk           data: {"text": "partial answer..."}
//   event: done            data: {"duration_ms": 1234.5, "selected_expert": "data"}
//   event: error           data: {"error": "...", "message": "...", "details": {...}}
//
// Outgoing (GACT v0.1 events):
//
//   message.part.added     (type=thinking, text="Routing to {expert}...")
//   message.part.delta     (append to a single text part id)
//   message.completed      (+ session.status_changed -> idle)
//
// TODO (CLIO-BBBBBBBBBB Phase 2):
//   - type EventTranslator struct { bus events.Bus; sessionID string; msgID string; partID string }
//   - func (t *EventTranslator) OnCLIOEvent(evt SSEvent) []events.Event
//   - Handle error path: map CLIO error_info dict -> GACT error_info
//     on message.completed (don't raise; the shape aligns already).
//
// Per-tool events (tool.call.started / completed) are deferred — CLIO
// doesn't emit them today. Phase 3 backs them in post-hoc from the
// per-turn Invocation.tools_called list via a follow-up GET.
