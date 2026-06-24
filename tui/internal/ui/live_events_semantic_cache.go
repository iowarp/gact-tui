package ui

// live_events_semantic_cache.go caches per-session semantic live messages and merges them with loaded history.

import (
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *conversationComponent) ensureSemanticLiveMessage(sessionID, turnID string) *gact.Message {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		sessionID = c.app.session.currentID()
	}
	if sessionID == "" {
		return nil
	}
	msgID := "semantic_live"
	if turnID != "" {
		msgID += "_" + stableIDFragment(turnID)
	} else {
		msgID += "_" + stableIDFragment(sessionID)
	}
	for i := range c.messages {
		if c.messages[i].ID == msgID {
			return &c.messages[i]
		}
	}
	now := time.Now()
	c.messages = append(c.messages, gact.Message{
		ID:        msgID,
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata: map[string]any{
			"semantic_live_message": true,
			"turn_id":               turnID,
		},
	})
	return &c.messages[len(c.messages)-1]
}

func (c *conversationComponent) cacheSemanticLiveMessagesForSession(sessionID string) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" || !c.sessionAllowsSemanticLiveCache(sessionID) {
		return
	}
	var live []gact.Message
	for _, msg := range c.messages {
		if msg.SessionID == sessionID && msg.Metadata != nil && msg.Metadata["semantic_live_message"] == true {
			live = append(live, cloneMessage(msg))
		}
	}
	if len(live) == 0 {
		return
	}
	if c.app.connection.semanticLiveMessagesBySession == nil {
		c.app.connection.semanticLiveMessagesBySession = map[string][]gact.Message{}
	}
	c.app.connection.semanticLiveMessagesBySession[sessionID] = live
}

func (c *conversationComponent) mergeLoadedMessagesWithSemanticLiveCache(sessionID string, loaded []gact.Message) []gact.Message {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" || !c.sessionAllowsSemanticLiveCache(sessionID) {
		delete(c.app.connection.semanticLiveMessagesBySession, sessionID)
		return loaded
	}
	cached := c.app.connection.semanticLiveMessagesBySession[sessionID]
	if len(cached) == 0 {
		return loaded
	}
	merged := cloneMessages(loaded)
	seen := make(map[string]bool, len(merged))
	seenHandoffs := semanticHandoffKeysInMessages(merged)
	for _, msg := range merged {
		if msg.ID != "" {
			seen[msg.ID] = true
		}
	}
	for _, msg := range cached {
		if msg.ID != "" && seen[msg.ID] {
			continue
		}
		filtered := cloneMessage(msg)
		filtered.Parts = filterCachedSemanticParts(filtered.Parts, seenHandoffs)
		if len(filtered.Parts) == 0 {
			continue
		}
		merged = append(merged, filtered)
	}
	return merged
}

func semanticHandoffKeysInMessages(messages []gact.Message) map[string]bool {
	keys := map[string]bool{}
	for _, msg := range messages {
		for _, part := range msg.Parts {
			if key := semanticHandoffComparableKey(part); key != "" {
				keys[key] = true
			}
		}
	}
	return keys
}

func filterCachedSemanticParts(parts []gact.Part, seen map[string]bool) []gact.Part {
	if len(parts) == 0 || len(seen) == 0 {
		return parts
	}
	filtered := make([]gact.Part, 0, len(parts))
	for _, part := range parts {
		if part.Metadata != nil && part.Metadata["semantic_event"] == true {
			if key := semanticHandoffComparableKey(part); key != "" && seen[key] {
				continue
			}
		}
		filtered = append(filtered, part)
	}
	return filtered
}

func semanticHandoffComparableKey(part gact.Part) string {
	if part.Type != gact.PartTypeExpertHandoff {
		return ""
	}
	md := part.Metadata
	stage := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		stringValue(md["stage"]),
		stringValue(md["dispatch_target"]),
		stringValue(md["event_type"]),
	)))
	status := strings.ToLower(strings.TrimSpace(firstNonEmpty(stringValue(md["status"]), "observed")))
	agent := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		stringValue(md["agent_id"]),
		stringValue(md["expert"]),
	)))
	parent := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		stringValue(md["parent_id"]),
		stringValue(md["parent"]),
	)))
	summary := strings.ToLower(strings.TrimSpace(strings.Join(strings.Fields(firstNonEmpty(
		stringValue(md["output_summary"]),
		stringValue(md["summary"]),
		part.Text,
	)), " ")))
	if agent == "" || summary == "" {
		return ""
	}
	return strings.Join([]string{stage, status, parent, agent, summary}, "\x1f")
}

func (c *conversationComponent) sessionAllowsSemanticLiveCache(sessionID string) bool {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return false
	}
	for _, session := range c.app.session.sessions {
		if session.ID != sessionID {
			continue
		}
		switch session.Status {
		case gact.StatusRunning, gact.StatusWaitingPermission, "pending", "queued":
			return true
		default:
			return false
		}
	}
	return false
}

func (c *conversationComponent) hasToolPart(callID, partType string) bool {
	callID = strings.TrimSpace(callID)
	if callID == "" {
		return false
	}
	for _, msg := range c.messages {
		for _, part := range msg.Parts {
			if part.CallID == callID && part.Type == partType {
				return true
			}
		}
	}
	return false
}

func (c *conversationComponent) removeSyntheticSemanticToolParts(callID string) {
	callID = strings.TrimSpace(callID)
	if callID == "" {
		return
	}
	for mi := range c.messages {
		parts := c.messages[mi].Parts[:0]
		for _, part := range c.messages[mi].Parts {
			if part.CallID == callID && part.Metadata != nil && part.Metadata["semantic_event"] == true {
				continue
			}
			parts = append(parts, part)
		}
		c.messages[mi].Parts = parts
	}
}

func messageHasPartID(msg gact.Message, partID string) bool {
	partID = strings.TrimSpace(partID)
	if partID == "" {
		return false
	}
	for _, part := range msg.Parts {
		if part.ID == partID {
			return true
		}
	}
	return false
}

func messageHasSemanticDuplicate(msg gact.Message, duplicateKey string) bool {
	duplicateKey = strings.TrimSpace(duplicateKey)
	if duplicateKey == "" {
		return false
	}
	for _, part := range msg.Parts {
		if part.Metadata == nil || part.Metadata["semantic_event"] != true {
			continue
		}
		if stringValue(part.Metadata["semantic_duplicate_key"]) == duplicateKey {
			return true
		}
	}
	return false
}
