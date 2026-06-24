package acp

import "encoding/json"

// translateUpdate maps one ACP `session/update` notification onto GACT SSE
// events (SPEC §7.4/§7.5). It runs on the ACP reader goroutine, in order,
// so the per-turn part state needs no extra locking against the prompt
// finalizer (which runs only after the prompt response lands).
func (sess *sessionState) translateUpdate(update map[string]any) {
	switch update["sessionUpdate"] {
	case "agent_message_chunk":
		text := contentText(update["content"])
		if text == "" {
			return
		}
		if sess.turn.textPart == nil {
			sess.turn.textPart = sess.newPart("text")
			sess.broadcast("message.part.added", map[string]any{
				"message_id": sess.turn.assistantMsgID, "part": sess.turn.textPart,
			})
		}
		sess.turn.textPart["text"] = str(sess.turn.textPart["text"]) + text
		sess.broadcast("message.part.delta", map[string]any{
			"message_id": sess.turn.assistantMsgID, "part_id": sess.turn.textPart["id"],
			"delta": map[string]any{"text_append": text},
		})

	case "agent_thought_chunk":
		text := contentText(update["content"])
		if text == "" {
			return
		}
		if sess.turn.thinkingPart == nil {
			sess.turn.thinkingPart = sess.newPart("thinking")
			sess.broadcast("message.part.added", map[string]any{
				"message_id": sess.turn.assistantMsgID, "part": sess.turn.thinkingPart,
			})
		}
		sess.turn.thinkingPart["thinking"] = str(sess.turn.thinkingPart["thinking"]) + text
		sess.broadcast("message.part.delta", map[string]any{
			"message_id": sess.turn.assistantMsgID, "part_id": sess.turn.thinkingPart["id"],
			"delta": map[string]any{"thinking_append": text},
		})

	case "tool_call":
		sess.closeOpenText() // a tool call ends the current text/thinking run
		callID, _ := update["toolCallId"].(string)
		name, _ := update["title"].(string)
		input, _ := update["rawInput"].(map[string]any)
		part := sess.newPart("tool_call")
		part["call_id"] = callID
		part["tool_name"] = name
		part["input"] = input
		sess.turn.toolParts[callID] = str(part["id"])
		sess.broadcast("message.part.added", map[string]any{"message_id": sess.turn.assistantMsgID, "part": part})
		sess.broadcast("tool.call.started", map[string]any{"call_id": callID, "tool_name": name})

	case "tool_call_update":
		callID, _ := update["toolCallId"].(string)
		isErr := update["status"] == "failed"
		if partID := sess.turn.toolParts[callID]; partID != "" {
			sess.broadcast("message.part.completed", map[string]any{
				"message_id": sess.turn.assistantMsgID, "part_id": partID,
			})
		}
		sess.broadcast("tool.call.completed", map[string]any{"call_id": callID, "is_error": isErr})
		toolMsg := map[string]any{
			"id": "msg_" + newID(12), "session_id": sess.id, "role": "tool", "created_at": nowISO(),
			"parts": []map[string]any{{
				"id": "part_" + newID(12), "type": "tool_result",
				"call_id": callID, "is_error": isErr, "content": toolResultContent(update["content"]),
			}},
		}
		sess.appendMessage(toolMsg)
		sess.broadcast("message.created", map[string]any{"message": toolMsg})
	}
}

// closeOpenText finalizes any open text/thinking part so a following tool
// call (or the turn end) starts a fresh part.
func (sess *sessionState) closeOpenText() {
	if sess.turn.textPart != nil {
		sess.broadcast("message.part.completed", map[string]any{
			"message_id": sess.turn.assistantMsgID, "part_id": sess.turn.textPart["id"],
		})
		sess.turn.textPart = nil
	}
	if sess.turn.thinkingPart != nil {
		sess.broadcast("message.part.completed", map[string]any{
			"message_id": sess.turn.assistantMsgID, "part_id": sess.turn.thinkingPart["id"],
		})
		sess.turn.thinkingPart = nil
	}
}

// finishParts closes any still-open part and writes the assembled parts
// back onto the cached assistant message so REST reads reflect the turn.
func (sess *sessionState) finishParts() {
	sess.closeOpenText()
	sess.mu.Lock()
	for _, m := range sess.cachedMessages {
		if m["id"] == sess.turn.assistantMsgID {
			m["parts"] = sess.turn.parts
			break
		}
	}
	sess.mu.Unlock()
}

func (sess *sessionState) newPart(partType string) map[string]any {
	p := map[string]any{"id": "part_" + newID(12), "type": partType}
	switch partType {
	case "text":
		p["text"] = ""
	case "thinking":
		p["thinking"] = ""
	}
	sess.turn.parts = append(sess.turn.parts, p)
	return p
}

// parsePromptResult pulls a GACT stop_reason + token usage out of an ACP
// PromptResponse ({stopReason, _meta?}). Token usage is not a standard ACP
// field, so it travels under a namespaced _meta key (clio uses
// "clio.coder/usage"); we scan _meta generically for an input/output object.
func parsePromptResult(raw json.RawMessage) (string, map[string]any) {
	var pr struct {
		StopReason string                     `json:"stopReason"`
		Meta       map[string]json.RawMessage `json:"_meta"`
	}
	_ = json.Unmarshal(raw, &pr)
	stop := pr.StopReason
	if stop == "" {
		stop = "end_turn"
	}
	tokens := map[string]any{"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
	for _, v := range pr.Meta {
		var u struct {
			Input      *int `json:"input"`
			Output     *int `json:"output"`
			CacheRead  *int `json:"cacheRead"`
			CacheWrite *int `json:"cacheWrite"`
		}
		if json.Unmarshal(v, &u) != nil {
			continue
		}
		if u.Input == nil && u.Output == nil {
			continue
		}
		tokens["input"] = deref(u.Input)
		tokens["output"] = deref(u.Output)
		tokens["cache_read"] = deref(u.CacheRead)
		tokens["cache_write"] = deref(u.CacheWrite)
		break
	}
	return stop, tokens
}

func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// contentText extracts text from an ACP content block — a {type:text,text}
// object, an array of them, or a bare string.
func contentText(v any) string {
	switch c := v.(type) {
	case string:
		return c
	case map[string]any:
		if c["type"] == "text" {
			return str(c["text"])
		}
	case []any:
		out := ""
		for _, e := range c {
			out += contentText(e)
		}
		return out
	}
	return ""
}

// toolResultContent converts ACP tool result content
// ([{type:"content",content:{type:text,text}}]) into GACT tool_result
// content ([{type:text,text}]).
func toolResultContent(v any) []map[string]any {
	out := []map[string]any{}
	arr, ok := v.([]any)
	if !ok {
		if txt := contentText(v); txt != "" {
			return []map[string]any{{"type": "text", "text": txt}}
		}
		return out
	}
	for _, e := range arr {
		m, ok := e.(map[string]any)
		if !ok {
			continue
		}
		if m["type"] == "content" {
			out = append(out, map[string]any{"type": "text", "text": contentText(m["content"])})
			continue
		}
		out = append(out, map[string]any{"type": "text", "text": contentText(m)})
	}
	return out
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// modelLabel renders a session's requested model (string or {model_id})
// into a display string.
func modelLabel(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var asString string
	if json.Unmarshal(raw, &asString) == nil && asString != "" {
		return asString
	}
	var ref struct {
		ModelID string `json:"model_id"`
	}
	_ = json.Unmarshal(raw, &ref)
	return ref.ModelID
}
