package ui

// live_event_helpers.go provides SSE payload/part metadata helpers shared by live-event handling.

import (
	"fmt"
	"hash/fnv"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func semanticEventPartID(e client.SSEEvent, eventType, turnID string) string {
	if e.ID != "" {
		return "semantic_event_" + stableIDFragment(e.ID)
	}
	if pl := eventPayload(e); valuefmt.StringValue(pl["event_id"]) != "" {
		return "semantic_event_" + stableIDFragment(valuefmt.StringValue(pl["event_id"]))
	}
	return "semantic_event_" + stableIDFragment(eventType+"_"+turnID+"_"+valuefmt.StringValue(e.Payload["occurred_at"]))
}

func promoteMessagePartEventMetadata(part *gact.Part, pl map[string]any) {
	if part == nil {
		return
	}
	for _, key := range []string{"turn_id", "stream_source"} {
		if value := strings.TrimSpace(valuefmt.StringValue(pl[key])); value != "" {
			if part.Metadata == nil {
				part.Metadata = map[string]any{}
			}
			part.Metadata[key] = value
		}
	}
}

func eventPayload(e client.SSEEvent) map[string]any {
	if pl, ok := e.Payload["payload"].(map[string]any); ok && len(pl) > 0 {
		return pl
	}
	return e.Payload
}

func optionalBoolValue(v any) (bool, bool) {
	switch b := v.(type) {
	case bool:
		return b, true
	case string:
		b = strings.TrimSpace(strings.ToLower(b))
		switch b {
		case "true", "ok", "success", "completed", "complete", "done":
			return true, true
		case "false", "error", "failed", "failure":
			return false, true
		}
		return false, false
	default:
		return false, false
	}
}

func stableIDFragment(s string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return fmt.Sprintf("%08x", h.Sum32())
}
