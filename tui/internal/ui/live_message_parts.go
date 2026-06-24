package ui

// live_message_parts.go applies part-added/delta/completed SSE events to the conversation message.

import (
	"encoding/json"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *conversationComponent) applyPartAdded(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partRaw, _ := pl["part"].(map[string]any)
	if msgID == "" || partRaw == nil {
		return
	}
	if sid := c.replaySessionID(stringValue(pl["session_id"])); c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	defer c.bumpMessageEpoch(msgID)
	part := decodePart(partRaw)
	promoteMessagePartEventMetadata(&part, pl)
	if part.Type == gact.PartTypeToolCall {
		if part.Metadata == nil {
			part.Metadata = map[string]any{}
		}
		if strings.TrimSpace(stringValue(part.Metadata["status"])) == "" {
			part.Metadata["status"] = "running"
		}
	}
	if part.CallID != "" && (part.Type == gact.PartTypeToolCall || part.Type == gact.PartTypeToolResult) {
		c.removeSyntheticSemanticToolParts(part.CallID)
	}
	for i := range c.messages {
		if c.messages[i].ID == msgID {
			for j := range c.messages[i].Parts {
				if part.ID != "" && c.messages[i].Parts[j].ID == part.ID {
					c.messages[i].Parts[j] = part
					normalizeMessagePresentation(&c.messages[i])
					return
				}
			}
			c.messages[i].Parts = append(c.messages[i].Parts, part)
			normalizeMessagePresentation(&c.messages[i])
			return
		}
	}
}

func (c *conversationComponent) applyPartDelta(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partID, _ := pl["part_id"].(string)
	delta, _ := pl["delta"].(map[string]any)
	if msgID == "" || partID == "" {
		return
	}
	if sid := c.replaySessionID(stringValue(pl["session_id"])); c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	defer c.bumpMessageEpoch(msgID)
	for i := range c.messages {
		if c.messages[i].ID != msgID {
			continue
		}
		for j := range c.messages[i].Parts {
			if c.messages[i].Parts[j].ID != partID {
				continue
			}
			if v, ok := delta["text_append"].(string); ok {
				c.messages[i].Parts[j].Text += v
			}
			if v, ok := pl["stream_source"].(string); ok && v != "" {
				if c.messages[i].Parts[j].Metadata == nil {
					c.messages[i].Parts[j].Metadata = map[string]any{}
				}
				c.messages[i].Parts[j].Metadata["stream_source"] = v
			}
			if v := strings.TrimSpace(stringValue(pl["turn_id"])); v != "" {
				if c.messages[i].Parts[j].Metadata == nil {
					c.messages[i].Parts[j].Metadata = map[string]any{}
				}
				c.messages[i].Parts[j].Metadata["turn_id"] = v
			}
			if v, ok := pl["stream_fallback"].(map[string]any); ok && len(v) > 0 {
				if c.messages[i].Parts[j].Metadata == nil {
					c.messages[i].Parts[j].Metadata = map[string]any{}
				}
				c.messages[i].Parts[j].Metadata["stream_fallback"] = v
			}
			if v, ok := delta["thinking_append"].(string); ok {
				c.messages[i].Parts[j].Thinking += v
			}
			if v, ok := delta["input_json_append"].(string); ok {
				if c.messages[i].Parts[j].Metadata == nil {
					c.messages[i].Parts[j].Metadata = map[string]any{}
				}
				c.messages[i].Parts[j].Metadata["raw_input"] = v
			}
			return
		}
	}
}

// applyPartCompleted finalizes a part, including accumulated tool input JSON
// and CLIO's cleaned final text for streamed text parts.
func (c *conversationComponent) applyPartCompleted(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partID, _ := pl["part_id"].(string)
	if sid := c.replaySessionID(stringValue(pl["session_id"])); c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	defer c.bumpMessageEpoch(msgID)
	for i := range c.messages {
		if c.messages[i].ID != msgID {
			continue
		}
		for j := range c.messages[i].Parts {
			if c.messages[i].Parts[j].ID != partID {
				continue
			}
			p := &c.messages[i].Parts[j]
			promoteMessagePartEventMetadata(p, pl)
			if p.Type == gact.PartTypeToolCall && p.Metadata != nil {
				if raw, ok := p.Metadata["raw_input"].(string); ok && raw != "" {
					var parsed map[string]any
					if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
						p.Input = parsed
					}
					delete(p.Metadata, "raw_input")
					if len(p.Metadata) == 0 {
						p.Metadata = nil
					}
				}
			}
			if p.Type == gact.PartTypeText {
				if final, ok := pl["final_text"].(string); ok && final != "" {
					p.Text = final
				}
			}
			return
		}
	}
}
