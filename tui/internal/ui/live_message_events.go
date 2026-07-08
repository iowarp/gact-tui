package ui

// live_message_events.go applies message-created/completed/cost SSE events to the conversation.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *conversationComponent) applyMessageCompleted(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	if sid := c.replaySessionID(valuefmt.StringValue(pl["session_id"])); c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	msgID, _ := pl["message_id"].(string)
	if msgID == "" {
		return
	}
	defer c.bumpMessageEpoch(msgID)
	for i := range c.messages {
		if c.messages[i].ID != msgID {
			continue
		}
		metadata, ok := pl["metadata"].(map[string]any)
		if !ok || len(metadata) == 0 {
			return
		}
		if c.messages[i].Metadata == nil {
			c.messages[i].Metadata = map[string]any{}
		}
		for k, v := range metadata {
			c.messages[i].Metadata[k] = v
		}
		normalizeMessagePresentation(&c.messages[i])
		return
	}
}

func (c *conversationComponent) settleTerminalMessageCompletion(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	stopReason := strings.TrimSpace(valuefmt.StringValue(pl["stop_reason"]))
	if !messageCompletedStopReasonSettlesSession(stopReason) {
		return
	}
	sid := c.replaySessionID(valuefmt.StringValue(pl["session_id"]))
	if sid == "" {
		sid = c.app.session.currentID()
	}
	if sid == "" || c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	settledStatus := statusForTerminalStopReason(stopReason)
	c.app.session.markSessionSettled(sid, settledStatus)
}

func messageCompletedStopReasonSettlesSession(stopReason string) bool {
	switch stopReason {
	case gact.StopReasonEndTurn, gact.StopReasonMaxTokens, gact.StopReasonCancelled, gact.StopReasonError, gact.StopReasonPermissionDenied:
		return true
	default:
		return false
	}
}

func statusForTerminalStopReason(stopReason string) string {
	switch stopReason {
	case gact.StopReasonCancelled, gact.StopReasonError, gact.StopReasonPermissionDenied:
		return stopReason
	default:
		return gact.StatusIdle
	}
}

// applyCostUpdated rolls the latest cost/tokens into the local sessions
// slice so the footer's meter and the sidebar status both stay live.
//
// Accepts either a dedicated cost.updated event (session_id inside
// the inner payload) OR a message.completed event (session_id at the
// outer envelope level — payload only carries cost_usd + tokens).
// Falls back to the outer envelope's session_id when the inner one
// is absent so both shapes flow through the same accumulator.
func (c *conversationComponent) applyCostUpdated(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	sid, _ := pl["session_id"].(string)
	if sid == "" {
		// message.completed shape: session_id sits one level up.
		sid, _ = e.Payload["session_id"].(string)
	}
	if sid == "" {
		return
	}
	for i := range c.app.session.sessions {
		if c.app.session.sessions[i].ID != sid {
			continue
		}
		if cost, ok := pl["cost_usd"].(float64); ok {
			// Cumulative meter: add the per-message increment to the
			// session's running total. cost.updated events already
			// carry running totals (treat as set); message.completed
			// carries per-turn delta (treat as add). We can tell
			// them apart by whether ``tokens`` looks like a delta
			// (small) vs total (large) — easier heuristic: if the
			// session already had a non-zero CostUSD and the inner
			// payload omits session_id, it's a delta.
			_, hasInnerSID := pl["session_id"].(string)
			if hasInnerSID {
				c.app.session.sessions[i].CostUSD = cost
			} else {
				c.app.session.sessions[i].CostUSD += cost
			}
		}
		if tokens, ok := pl["tokens"].(map[string]any); ok {
			_, hasInnerSID := pl["session_id"].(string)
			if v, ok := tokens["input"].(float64); ok {
				if hasInnerSID {
					c.app.session.sessions[i].Tokens.Input = int(v)
				} else {
					c.app.session.sessions[i].Tokens.Input += int(v)
				}
			}
			if v, ok := tokens["output"].(float64); ok {
				if hasInnerSID {
					c.app.session.sessions[i].Tokens.Output = int(v)
				} else {
					c.app.session.sessions[i].Tokens.Output += int(v)
				}
			}
		}
		return
	}
}

func (c *conversationComponent) applyMessageCreated(e client.SSEEvent) {
	mp, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	if sid := c.replaySessionID(valuefmt.StringValue(mp["session_id"])); c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	m := decodeMessage(mp)
	normalizeMessagePresentation(&m)
	defer c.bumpMessageEpoch(m.ID)
	// Replace existing message with same ID if present (server may re-emit).
	for i, existing := range c.messages {
		if existing.ID == m.ID {
			c.messages[i] = m
			return
		}
	}
	c.messages = append(c.messages, m)
}
