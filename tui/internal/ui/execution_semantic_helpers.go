package ui

// execution_semantic_helpers.go holds small shared helpers for reading the
// backend's structural semantic-event payloads, used by the execution-timeline
// projection and detail views.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// firstNonNil returns the first non-nil value, or nil.
func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

// messageHasPartID reports whether the message already carries a part with the
// given id.
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

// semanticPreviewIsInlineRedaction reports whether an inline tool preview was
// redacted (covering the runtime's "input redacted" phrasing too).
func semanticPreviewIsInlineRedaction(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	normalized = strings.Trim(normalized, ". ")
	return normalized == "input redacted by runtime" || semanticPreviewIsRedacted(text)
}

// semanticToolPayload unwraps the nested "payload" envelope some semantic
// events carry, falling back to the event payload itself.
func semanticToolPayload(payload map[string]any) map[string]any {
	if nested := valuefmt.MapValue(payload["payload"]); len(nested) > 0 {
		return nested
	}
	return payload
}

// semanticPreviewIsRedacted reports whether a tool argument/result preview was
// redacted by the backend, so the UI can omit the noise instead of printing a
// "[redacted]" placeholder.
func semanticPreviewIsRedacted(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	normalized = strings.Trim(normalized, ". ")
	switch normalized {
	case "[redacted]", "redacted", "<redacted>", "(redacted)":
		return true
	default:
		return strings.Contains(normalized, "[redacted]")
	}
}
