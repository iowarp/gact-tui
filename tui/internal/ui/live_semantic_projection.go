package ui

// live_semantic_projection.go applies a generic semantic SSE event to the conversation.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *conversationComponent) applySemanticEvent(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := c.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = c.app.session.currentID()
	}
	if c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	eventType := firstNonEmpty(stringValue(pl["event_type"]), e.Type)
	if eventType == "" {
		return
	}
	switch eventType {
	case "tool.call.started":
		c.applyToolCallStarted(e)
		return
	case "tool.call.completed":
		c.applyToolCallCompleted(e)
		return
	}
	part, ok := semanticEventPart(e, pl, eventType)
	if !ok {
		return
	}
	partID := semanticEventPartID(e, eventType, stringValue(pl["turn_id"]))
	msg := c.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil || messageHasPartID(*msg, partID) {
		return
	}
	part.ID = partID
	if part.Metadata == nil {
		part.Metadata = map[string]any{}
	}
	part.Metadata["semantic_event"] = true
	part.Metadata["event_type"] = eventType
	part.Metadata["trace_id"] = stringValue(pl["trace_id"])
	part.Metadata["turn_id"] = stringValue(pl["turn_id"])
	part.Metadata["status"] = stringValue(pl["status"])
	part.Metadata["detail_level"] = stringValue(pl["detail_level"])
	part.Metadata["stream_source"] = "semantic_event"
	part.Metadata["raw_event"] = pl
	if duplicateKey := semanticEventDuplicateKey(pl, eventType, part); duplicateKey != "" {
		if messageHasSemanticDuplicate(*msg, duplicateKey) {
			return
		}
		part.Metadata["semantic_duplicate_key"] = duplicateKey
	}
	msg.Parts = append(msg.Parts, part)
	c.cacheSemanticLiveMessagesForSession(sid)
}
