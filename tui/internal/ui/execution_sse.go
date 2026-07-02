package ui

// execution_sse.go records SSE events into the execution timeline and resolves their turn IDs.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *executionComponent) recordSSE(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := c.app.conversation.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = c.app.session.currentID()
	}
	if sid == "" || c.app.conversation.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	record := executionTimelineEvent{
		Sequence:  c.nextSeq(),
		Type:      e.Type,
		SessionID: sid,
		Payload:   pl,
	}
	record.TurnID = c.turnIDForSSERecord(e.Type, pl)
	switch e.Type {
	case "message.created":
		if role := strings.TrimSpace(stringValue(pl["role"])); role == gact.RoleUser {
			record.Type = "turn.user_message"
			record.TurnID = firstNonEmpty(stringValue(pl["turn_id"]), stringValue(pl["id"]))
		} else {
			return
		}
	case "message.part.delta":
		delta := mapValue(pl["delta"])
		if strings.TrimSpace(stringValue(delta["text_append"])) == "" {
			return
		}
	case "message.part.added":
		partRaw := mapValue(pl["part"])
		part := decodePart(partRaw)
		record.Part = &part
		switch part.Type {
		case gact.PartTypeText:
			// Live text parts are already represented by message.part.delta.
			// Recording the later full part text creates a second assistant
			// prose node and makes live vs reload ordering diverge. Batch
			// providers still need the full part because they may emit no
			// deltas.
			if strings.TrimSpace(stringValue(pl["stream_source"])) == "live" {
				return
			}
			if strings.TrimSpace(part.Text) == "" {
				return
			}
		case gact.PartTypeExpertHandoff:
		default:
			return
		}
	case "semantic.event":
		eventType := firstNonEmpty(stringValue(pl["event_type"]), e.Type)
		if !semanticEventReachesLedger(eventType, stringValue(pl["status"])) {
			return
		}
		record.Type = eventType
	case "tool.call.started", "tool.call.completed":
	default:
		return
	}
	if c.executionEventsBySession == nil {
		c.executionEventsBySession = map[string][]executionTimelineEvent{}
	}
	events := append(c.executionEventsBySession[sid], record)
	if len(events) > executionLedgerMaxEvents {
		dropped := len(events) - executionLedgerTrimTarget
		kept := make([]executionTimelineEvent, executionLedgerTrimTarget)
		copy(kept, events[dropped:])
		events = kept
		if c.app.audit != nil {
			c.app.audit.RecordReceived("execution.ledger.trimmed", map[string]any{
				"reason":     "execution_ledger_cap",
				"session_id": sid,
				"dropped":    dropped,
				"kept":       len(kept),
				"cap":        executionLedgerMaxEvents,
			})
		}
	}
	c.executionEventsBySession[sid] = events
}

// semanticLedgerEventTypes mirrors the server's UI/SSE serving allow-list —
// contract/SPEC.md §7.6 "Served allow-list" is source of truth (clio
// semantic_events.py: SSE_UI_EVENT_TYPES): the ReAct trajectory atoms
// (react step / extract / expert response / expert lifecycle), the delegation
// atom on BOTH its prefixes (“blueprint.delegation.*“ for Agent Blueprint
// experts, plain “delegation.*“ for expert-pack / prompt-agent delegations),
// and memory.search.completed. Everything else (turn/agent/hook lifecycle,
// the “tool.call.*“ mirrors, “lm.token.delta“, memory bookkeeping) never
// reaches the wire — except through the failed-status gate below.
var semanticLedgerEventTypes = map[string]bool{
	"react.step.completed":                true,
	"expert.extract.completed":            true,
	"expert.response.completed":           true,
	"expert.lifecycle.started":            true,
	"blueprint.delegation.started":        true,
	"blueprint.delegation.completed":      true,
	"blueprint.delegation.parent_resumed": true,
	"blueprint.delegation.failed":         true,
	"delegation.started":                  true,
	"delegation.completed":                true,
	"delegation.parent_resumed":           true,
	"delegation.failed":                   true,
	"memory.search.completed":             true,
}

// semanticEventReachesLedger reports whether a semantic event belongs in the
// execution ledger: the §7.6 served allow-list PLUS the unconditional pass for
// failure/cancellation statuses (errors are first-class and are never
// filtered out of the served stream — SPEC.md §7.6, clio _SSE_ALWAYS_STATUSES).
func semanticEventReachesLedger(eventType, status string) bool {
	if semanticLedgerEventTypes[eventType] {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "failed", "error", "cancelled":
		return true
	}
	return false
}

// clearSessionLedger drops a session's execution-event ledger. Called when the
// backend reports session.cleared so the Ctrl+E drill-down cannot reflect
// pre-/clear state (#231).
func (c *executionComponent) clearSessionLedger(sessionID string) {
	delete(c.executionEventsBySession, sessionID)
}

// dropDeletedSessionLedger drops the execution-event ledger of a session the
// backend confirmed deleted, recording a structured execution.ledger.pruned
// audit event for the drop. Confirmed deletion (and session.cleared, via
// clearSessionLedger) are the only prune triggers: refreshed session lists
// are filtered views (workspace-scoped, and archived-filtered when the
// archived sidebar view is on), so a session's absence from one never proves
// it was deleted — and pruning on such lists would irreversibly destroy live
// sessions' ledgers, because lastSeenSeqIDBySession suppresses SSE replay on
// revisit (#231).
func (c *executionComponent) dropDeletedSessionLedger(sessionID string) {
	events, ok := c.executionEventsBySession[sessionID]
	if !ok {
		return
	}
	delete(c.executionEventsBySession, sessionID)
	if c.app.audit != nil {
		c.app.audit.RecordReceived("execution.ledger.pruned", map[string]any{
			"reason":     "session_deleted",
			"session_id": sessionID,
			"dropped":    len(events),
		})
	}
}

// recordedSemanticPayloads returns the payloads of recorded structural
// semantic events for a session, newest last. These are the cleaned-up
// backend's trajectory events (delegation / expert lifecycle / react steps);
// the sidebar derives per-agent runtime state from them instead of from
// synthesized transcript parts.
func (c *executionComponent) recordedSemanticPayloads(sessionID string) []map[string]any {
	if c.executionEventsBySession == nil {
		return nil
	}
	records := c.executionEventsBySession[sessionID]
	if len(records) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(records))
	for _, r := range records {
		if strings.TrimSpace(stringValue(r.Payload["event_type"])) == "" {
			continue
		}
		out = append(out, r.Payload)
	}
	return out
}

func (c *executionComponent) turnIDForSSERecord(eventType string, pl map[string]any) string {
	if turnID := strings.TrimSpace(stringValue(pl["turn_id"])); turnID != "" {
		return turnID
	}
	switch eventType {
	case "message.part.delta", "message.part.added", "message.part.completed":
		if turnID := c.turnIDForMessage(stringValue(pl["message_id"])); turnID != "" {
			return turnID
		}
	}
	return c.latestUserTurnID()
}

func messageTurnID(msg gact.Message) string {
	if turnID := strings.TrimSpace(msg.TurnID); turnID != "" {
		return turnID
	}
	if msg.Metadata != nil {
		if turnID := strings.TrimSpace(stringValue(msg.Metadata["turn_id"])); turnID != "" {
			return turnID
		}
	}
	if msg.Role == gact.RoleUser {
		return strings.TrimSpace(msg.ID)
	}
	return ""
}

func (c *executionComponent) turnIDForMessage(messageID string) string {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return ""
	}
	for i, msg := range c.app.conversation.messages {
		if msg.ID != messageID {
			continue
		}
		if msg.Role == gact.RoleUser {
			return messageTurnID(msg)
		}
		if turnID := messageTurnID(msg); turnID != "" {
			return turnID
		}
		for j := i - 1; j >= 0; j-- {
			if c.app.conversation.messages[j].Role == gact.RoleUser && sameSessionOrUnknown(c.app.conversation.messages[j].SessionID, msg.SessionID) {
				return messageTurnID(c.app.conversation.messages[j])
			}
		}
		return ""
	}
	return ""
}

func (c *executionComponent) latestUserTurnID() string {
	sid := c.app.session.currentID()
	for i := len(c.app.conversation.messages) - 1; i >= 0; i-- {
		msg := c.app.conversation.messages[i]
		if msg.Role != gact.RoleUser {
			continue
		}
		if sameSessionOrUnknown(msg.SessionID, sid) {
			return messageTurnID(msg)
		}
	}
	return ""
}
