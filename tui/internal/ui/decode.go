package ui

// decode.go decodes raw map data into typed gact.Message and gact.Part values.

import (
	"encoding/json"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// decodeMessage round-trips a generic map[string]any (from SSE payloads)
// into a typed gact.Message. Slow but tolerant; we own the schema so this
// is fine for an interactive TUI.
func decodeMessage(raw map[string]any) gact.Message {
	out := gact.Message{}
	b, err := json.Marshal(raw)
	if err != nil {
		return out
	}
	_ = json.Unmarshal(b, &out)
	return out
}

// decodePart is the same pattern for a single Part.
func decodePart(raw map[string]any) gact.Part {
	out := gact.Part{}
	b, err := json.Marshal(raw)
	if err != nil {
		return out
	}
	_ = json.Unmarshal(b, &out)
	return out
}
