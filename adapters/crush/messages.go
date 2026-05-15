package crush

import (
	"encoding/json"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CrushMessage mirrors crush proto.Message — the slimmest subset we
// translate. Crush's wire shape wraps every part as `{type, data}`,
// so Parts is RawMessage and we walk it manually in MessageToGact.
type CrushMessage struct {
	ID        string          `json:"id"`
	SessionID string          `json:"session_id"`
	Role      string          `json:"role"`
	Parts     json.RawMessage `json:"parts"`
	Model     string          `json:"model,omitempty"`
	Provider  string          `json:"provider,omitempty"`
	CreatedAt int64           `json:"created_at,omitempty"`
	UpdatedAt int64           `json:"updated_at,omitempty"`
}

// crushPartWrapper is Crush's serialised part envelope.
type crushPartWrapper struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// MessageToGact translates a Crush message to a GACT message. The
// session_id falls back to the URL-supplied default because Crush's
// proto.Message always carries it explicitly, but a forward-incompat
// build could omit it (we'd rather render the message in the right
// session than drop it).
func MessageToGact(c CrushMessage, fallbackSessionID string) (gact.Message, error) {
	sid := c.SessionID
	if sid == "" {
		sid = fallbackSessionID
	}

	out := gact.Message{
		ID:        c.ID,
		SessionID: sid,
		Role:      c.Role,
		CreatedAt: secondsToTime(c.CreatedAt),
		UpdatedAt: secondsToTime(c.UpdatedAt),
	}
	if c.Model != "" {
		out.Model = &gact.ModelRef{ProviderID: c.Provider, ModelID: c.Model}
	}

	if len(c.Parts) == 0 || string(c.Parts) == "null" {
		return out, nil
	}

	var wrappers []crushPartWrapper
	if err := json.Unmarshal(c.Parts, &wrappers); err != nil {
		return out, err
	}

	for i, w := range wrappers {
		part, stop, err := translatePart(w, i)
		if err != nil {
			return out, err
		}
		// `finish` becomes the message's stop_reason rather than a
		// standalone part — GACT carries finish state on Message, not
		// in Parts. We still set it on the message and skip emitting a
		// part (Crush sends one finish per message).
		if stop != "" {
			out.StopReason = stop
		} else if part.Type != "" {
			out.Parts = append(out.Parts, part)
		}
	}
	return out, nil
}

// MessagesToGact bulk-translates a Crush message list. Errors on any
// single message bubble up — callers can decide whether to fall back to
// a partial list (the adapter currently 502s on any translation error,
// keeping the surface area honest).
func MessagesToGact(cs []CrushMessage, fallbackSessionID string) ([]gact.Message, error) {
	out := make([]gact.Message, 0, len(cs))
	for _, c := range cs {
		m, err := MessageToGact(c, fallbackSessionID)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// translatePart converts one Crush part wrapper to a GACT part. Returns
// (part, "", nil) for normal parts, ({}, finishReason, nil) for finish
// parts (which become Message.StopReason rather than a standalone part).
//
// Per SPEC §8.3: unknown Crush part types pass through with a synthetic
// `x_crush_<type>` GACT type so a strict client can still see them
// instead of having Crush features silently swallowed.
func translatePart(w crushPartWrapper, index int) (gact.Part, string, error) {
	id := "p_" + strconv.Itoa(index)
	switch w.Type {
	case "text":
		var d struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		return gact.Part{ID: id, Type: gact.PartTypeText, Text: d.Text}, "", nil

	case "reasoning":
		var d struct {
			Thinking  string `json:"thinking"`
			Signature string `json:"signature"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		return gact.Part{
			ID: id, Type: gact.PartTypeThinking,
			Thinking:  d.Thinking,
			Signature: d.Signature,
		}, "", nil

	case "tool_call":
		var d struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Input    string `json:"input"`
			Type     string `json:"type"`
			Finished bool   `json:"finished"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		// Crush's `input` is a JSON-encoded string; GACT expects a parsed
		// object. Best-effort parse — if it doesn't decode, stash the
		// raw string under metadata so the user still sees something.
		input, meta := parseToolInput(d.Input)
		if d.Finished {
			meta = ensureMetadata(meta)
			meta["x_crush_finished"] = true
		}
		if d.Type != "" {
			meta = ensureMetadata(meta)
			meta["x_crush_tool_type"] = d.Type
		}
		return gact.Part{
			ID: id, Type: gact.PartTypeToolCall,
			CallID: d.ID, ToolName: d.Name,
			Input: input, Metadata: meta,
		}, "", nil

	case "tool_result":
		var d struct {
			ToolCallID string `json:"tool_call_id"`
			Name       string `json:"name"`
			Content    string `json:"content"`
			Metadata   string `json:"metadata"`
			IsError    bool   `json:"is_error"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		var meta map[string]any
		if d.Metadata != "" {
			meta = map[string]any{"x_crush_metadata": d.Metadata}
		}
		if d.Name != "" {
			meta = ensureMetadata(meta)
			meta["x_crush_tool_name"] = d.Name
		}
		return gact.Part{
			ID: id, Type: gact.PartTypeToolResult,
			CallID:   d.ToolCallID,
			IsError:  d.IsError,
			Content:  []gact.Part{{Type: gact.PartTypeText, Text: d.Content}},
			Metadata: meta,
		}, "", nil

	case "finish":
		var d struct {
			Reason  string `json:"reason"`
			Time    int64  `json:"time"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		// Empty reason ⇒ unknown — keep stop_reason empty so the client
		// renders without a stop badge instead of a misleading "unknown".
		return gact.Part{}, d.Reason, nil

	case "image_url":
		var d struct {
			URL    string `json:"url"`
			Detail string `json:"detail"`
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		var meta map[string]any
		if d.Detail != "" {
			meta = map[string]any{"x_crush_detail": d.Detail}
		}
		return gact.Part{
			ID: id, Type: gact.PartTypeImage,
			Source:   map[string]any{"type": "url", "url": d.URL},
			Metadata: meta,
		}, "", nil

	case "binary":
		var d struct {
			Path     string `json:"Path"`
			MIMEType string `json:"MIMEType"`
			Data     []byte `json:"Data"` // base64-decoded by encoding/json
		}
		if err := json.Unmarshal(w.Data, &d); err != nil {
			return gact.Part{}, "", err
		}
		// Pick GACT type from MIME — image/* → image, everything else → document.
		typ := gact.PartTypeDocument
		if len(d.MIMEType) >= 6 && d.MIMEType[:6] == "image/" {
			typ = gact.PartTypeImage
		}
		return gact.Part{
			ID: id, Type: typ,
			MimeType: d.MIMEType,
			Path:     d.Path,
			Source: map[string]any{
				"type":      "base64",
				"mediaType": d.MIMEType,
				"data":      d.Data,
			},
		}, "", nil

	default:
		// Forward-compat: preserve unknown Crush types verbatim under
		// a namespaced GACT type so strict clients can introspect.
		return gact.Part{
			ID:   id,
			Type: "x_crush_" + w.Type,
			Metadata: map[string]any{
				"x_crush_raw": json.RawMessage(w.Data),
			},
		}, "", nil
	}
}

// parseToolInput decodes Crush's stringly-typed tool_call input. On
// failure (malformed or empty), returns an empty input + a metadata
// blob so the raw string is still visible to the operator.
func parseToolInput(raw string) (map[string]any, map[string]any) {
	if raw == "" {
		return nil, nil
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(raw), &input); err == nil {
		return input, nil
	}
	return nil, map[string]any{"x_crush_raw_input": raw}
}

func ensureMetadata(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
