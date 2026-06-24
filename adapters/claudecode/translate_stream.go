package claudecode

// translateStreamEvent maps one claude stream_event frame to GACT
// §7.4 partial events. Returns (events, new_active_msg_id) so the
// caller can thread message id state across calls (message_start
// is the only frame that carries it; deltas/stops reference by
// index only).
//
// Mapping (text only — tool_use streaming left for the final
// assistant frame, which lands seconds later and replaces by id):
//
//	message_start              → message.created (empty parts shell)
//	content_block_start (text) → message.part.added
//	content_block_delta(text_delta) → message.part.delta {text_append}
//	content_block_stop         → message.part.completed
//	message_stop               → message.completed
//
// Anything else (input_json deltas, message_delta, content_block
// starts for tool_use) is dropped — the assistant frame's
// message.created replaces by id and fills the final state.
func translateStreamEvent(raw map[string]any, sessionID, activeMsgID string) ([]gactEvent, string) {
	inner, _ := raw["event"].(map[string]any)
	if inner == nil {
		return nil, activeMsgID
	}
	et, _ := inner["type"].(string)
	switch et {
	case "message_start":
		m, _ := inner["message"].(map[string]any)
		msgID, _ := m["id"].(string)
		model, _ := m["model"].(string)
		if msgID == "" {
			return nil, activeMsgID
		}
		ev := gactEvent{
			Type: "message.created",
			Payload: map[string]any{
				"id":          msgID,
				"session_id":  sessionID,
				"role":        "assistant",
				"parts":       []map[string]any{},
				"model":       map[string]any{"provider_id": "anthropic", "model_id": model},
				"created_at":  nowISO(),
				"stop_reason": nil,
				"usage":       map[string]any{},
			},
		}
		return []gactEvent{ev}, msgID
	case "content_block_start":
		if activeMsgID == "" {
			return nil, activeMsgID
		}
		idx, ok := indexOf(inner["index"])
		if !ok {
			return nil, activeMsgID
		}
		blk, _ := inner["content_block"].(map[string]any)
		if blk == nil || blk["type"] != "text" {
			// tool_use blocks come fully formed in the assistant frame
			return nil, activeMsgID
		}
		txt, _ := blk["text"].(string)
		ev := gactEvent{
			Type: "message.part.added",
			Payload: map[string]any{
				"message_id": activeMsgID,
				"part": map[string]any{
					"id":   streamPartID(activeMsgID, idx),
					"type": "text",
					"text": txt,
				},
			},
		}
		return []gactEvent{ev}, activeMsgID
	case "content_block_delta":
		if activeMsgID == "" {
			return nil, activeMsgID
		}
		idx, ok := indexOf(inner["index"])
		if !ok {
			return nil, activeMsgID
		}
		delta, _ := inner["delta"].(map[string]any)
		if delta == nil || delta["type"] != "text_delta" {
			return nil, activeMsgID
		}
		txt, _ := delta["text"].(string)
		ev := gactEvent{
			Type: "message.part.delta",
			Payload: map[string]any{
				"message_id": activeMsgID,
				"part_id":    streamPartID(activeMsgID, idx),
				"delta":      map[string]any{"text_append": txt},
			},
		}
		return []gactEvent{ev}, activeMsgID
	case "content_block_stop":
		if activeMsgID == "" {
			return nil, activeMsgID
		}
		idx, ok := indexOf(inner["index"])
		if !ok {
			return nil, activeMsgID
		}
		ev := gactEvent{
			Type: "message.part.completed",
			Payload: map[string]any{
				"message_id": activeMsgID,
				"part_id":    streamPartID(activeMsgID, idx),
			},
		}
		return []gactEvent{ev}, activeMsgID
	case "message_stop":
		if activeMsgID == "" {
			return nil, activeMsgID
		}
		ev := gactEvent{
			Type:    "message.completed",
			Payload: map[string]any{"message_id": activeMsgID},
		}
		return []gactEvent{ev}, "" // clear active id
	}
	return nil, activeMsgID
}

// streamPartID derives a stable part_id from (msg_id, index) so the
// message.part.delta + message.part.completed events that follow a
// content_block_start can target the same Part. The final assistant
// frame's message.created will overwrite with claude's real ids.
func streamPartID(msgID string, idx int) string {
	return "part_" + msgID + "_" + itoa(idx)
}

// indexOf coerces a JSON-decoded number to int (json decode lands as
// float64 by default).
func indexOf(v any) (int, bool) {
	switch x := v.(type) {
	case float64:
		return int(x), true
	case int:
		return x, true
	}
	return 0, false
}

// itoa is a small int-to-string without strconv import (used by
// streamPartID).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
