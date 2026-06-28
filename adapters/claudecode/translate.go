package claudecode

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// translateClaudeEvent maps one stream-json frame from `claude` into
// zero-or-more GACT v0.1 event envelopes. cwd enables file_diff
// sibling Parts for Edit/Write tool_use blocks (TTTTTTT5).
//
// Anthropic stream-json frames we care about:
//
//	{"type":"system","subtype":"init", "tools":[...], "mcp_servers":[...], ...}
//	{"type":"assistant","message":{"id","role","content":[blocks...],"model","usage",...}}
//	{"type":"user","message":{"role":"user","content":[blocks...]}}     // tool-result echoes
//	{"type":"result","subtype":"success|error","is_error":bool,"duration_ms",...}
//	{"type":"stream_event","event":{...}}                                // partials (ignored v1)
//
// Unrecognised frames return nil — forward-compat per SPEC §8.3.
func translateClaudeEvent(raw map[string]any, sessionID, cwd string) []gactEvent {
	t, _ := raw["type"].(string)
	switch t {
	case "system":
		// Init frame carries the SDK handshake. We only emit a
		// server.connected so the TUI sees the stream is live; the
		// catalog data (tools/mcp_servers/agents/slash_commands)
		// gets harvested by the caller into State.
		return []gactEvent{{
			Type:    "server.connected",
			Payload: map[string]any{"session_id": sessionID, "data": raw},
		}}
	case "assistant":
		msg, ok := raw["message"].(map[string]any)
		if !ok {
			return nil
		}
		return []gactEvent{{
			Type:    "message.created",
			Payload: claudeAssistantToGact(msg, sessionID, cwd),
		}}
	case "user":
		// Tool-result echoes from the CLI come through as
		// "user" frames with content blocks of type "tool_result".
		// Surface them as message.created so the TUI's tool_result
		// rendering path picks them up.
		msg, ok := raw["message"].(map[string]any)
		if !ok {
			return nil
		}
		return []gactEvent{{
			Type:    "message.created",
			Payload: claudeUserToGact(msg, sessionID),
		}}
	case "result":
		isErr, _ := raw["is_error"].(bool)
		status := "idle"
		if isErr {
			status = "error"
		}
		out := map[string]any{
			"session_id":  sessionID,
			"status":      status,
			"prev_status": "running",
		}
		if d, ok := raw["duration_ms"]; ok {
			out["duration_ms"] = d
		}
		if c, ok := raw["total_cost_usd"]; ok {
			out["total_cost_usd"] = c
		}
		if n, ok := raw["num_turns"]; ok {
			out["num_turns"] = n
		}
		return []gactEvent{{
			Type:    "session.status_changed",
			Payload: out,
		}}
	}
	return nil
}

// gactEvent is the internal envelope that the SSE writer wraps in
// the SPEC §7.2 {type, occurred_at, payload} shape.
type gactEvent struct {
	Type    string
	Payload map[string]any
}

// claudeAssistantToGact builds a GACT Message dict from claude's
// assistant frame. Parts are projected from content blocks; for
// every Edit/Write tool_use block, a sibling file_diff Part is
// appended so the TUI's a/r apply/reject keys light up.
//
// cwd, when non-empty, enables file_diff synthesis (TTTTTTT5).
func claudeAssistantToGact(msg map[string]any, sessionID, cwd string) map[string]any {
	id, _ := msg["id"].(string)
	if id == "" {
		id = "msg_" + newID(12)
	}
	model, _ := msg["model"].(string)
	stopReason, _ := msg["stop_reason"].(string)
	content, _ := msg["content"].([]any)
	parts := make([]map[string]any, 0, len(content))
	for _, c := range content {
		blk, ok := c.(map[string]any)
		if !ok {
			continue
		}
		p := blockToPart(blk)
		parts = append(parts, p)
		// Sibling file_diff for Edit/Write tool_use blocks.
		if cwd != "" && p["type"] == "tool_call" {
			toolName, _ := p["tool_name"].(string)
			input, _ := p["input"].(map[string]any)
			if diff := fileDiffForToolUse(toolName, input, cwd); diff != nil {
				parts = append(parts, diff)
			}
		}
	}
	usage, _ := msg["usage"].(map[string]any)
	if usage == nil {
		usage = map[string]any{}
	}
	return map[string]any{
		"id":          id,
		"session_id":  sessionID,
		"role":        "assistant",
		"parts":       parts,
		"model":       map[string]any{"provider_id": "anthropic", "model_id": model},
		"created_at":  nowISO(),
		"stop_reason": stopReason,
		"usage":       usage,
	}
}

func claudeUserToGact(msg map[string]any, sessionID string) map[string]any {
	role, _ := msg["role"].(string)
	if role == "" {
		role = "user"
	}
	content, _ := msg["content"].([]any)
	parts := make([]map[string]any, 0, len(content))
	for _, c := range content {
		if blk, ok := c.(map[string]any); ok {
			parts = append(parts, blockToPart(blk))
		} else if s, ok := c.(string); ok {
			parts = append(parts, map[string]any{
				"id": "part_" + newID(12), "type": "text", "text": s,
			})
		}
	}
	if len(parts) == 0 {
		// Some frames put the body as a string.
		if s, ok := msg["content"].(string); ok && s != "" {
			parts = append(parts, map[string]any{
				"id": "part_" + newID(12), "type": "text", "text": s,
			})
		}
	}
	return map[string]any{
		"id":         "msg_" + newID(12),
		"session_id": sessionID,
		"role":       role,
		"parts":      parts,
		"created_at": nowISO(),
	}
}

// blockToPart maps a single content block to a GACT Part dict.
// Shapes Anthropic's stream-json uses:
//
//	{"type":"text","text":"..."}
//	{"type":"thinking","thinking":"..."}
//	{"type":"tool_use","id":"toolu_xxx","name":"Bash","input":{...}}
//	{"type":"tool_result","tool_use_id":"toolu_xxx","content":<str|[blocks]>,"is_error":bool}
func blockToPart(b map[string]any) map[string]any {
	id := "part_" + newID(12)
	typ, _ := b["type"].(string)
	switch typ {
	case "text":
		txt, _ := b["text"].(string)
		return map[string]any{"id": id, "type": "text", "text": txt}
	case "thinking":
		txt, _ := b["thinking"].(string)
		return map[string]any{"id": id, "type": "thinking", "text": txt}
	case "tool_use":
		callID, _ := b["id"].(string)
		name, _ := b["name"].(string)
		input, _ := b["input"].(map[string]any)
		return map[string]any{
			"id":        id,
			"type":      "tool_call",
			"call_id":   callID,
			"tool_name": name,
			"input":     input,
		}
	case "tool_result":
		callID, _ := b["tool_use_id"].(string)
		isErr, _ := b["is_error"].(bool)
		var contentParts []map[string]any
		switch v := b["content"].(type) {
		case string:
			contentParts = []map[string]any{
				{"id": "part_" + newID(12), "type": "text", "text": v},
			}
		case []any:
			for _, item := range v {
				if m, ok := item.(map[string]any); ok {
					contentParts = append(contentParts, blockToPart(m))
				}
			}
		}
		if contentParts == nil {
			contentParts = []map[string]any{}
		}
		return map[string]any{
			"id":       id,
			"type":     "tool_result",
			"call_id":  callID,
			"content":  contentParts,
			"is_error": isErr,
		}
	}
	// Forward-compat: unknown variants surface as a placeholder so
	// the TUI doesn't drop the block silently.
	return map[string]any{
		"id":   id,
		"type": "text",
		"text": "[" + typ + "]",
	}
}

// nowISO returns an RFC3339 UTC timestamp matching SPEC §7.2's
// occurred_at format.
func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// newID returns a hex-encoded random id of the given length — used
// to synthesise part/message ids when the upstream omits them.
// Avoids pulling a uuid dep for this single use.
func newID(n int) string {
	buf := make([]byte, (n+1)/2)
	_, _ = rand.Read(buf)
	s := hex.EncodeToString(buf)
	if len(s) >= n {
		return s[:n]
	}
	return s
}
