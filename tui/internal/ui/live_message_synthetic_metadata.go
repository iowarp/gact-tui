package ui

// live_message_synthetic_metadata.go normalizes synthetic message metadata
// (reasoning log, error info).
//
// It used to also fabricate an expert_handoff part from message-level
// metadata.workflow_state. That was removed for #233 web parity: the web reads
// workflow_state off the real expert_handoff parts on the wire
// (WorkflowStateModel.workflowStateFromPart) — and so does the TUI already
// (render_handoff_workflow_state.go / execution_reports.go). The clio backend
// never assigns workflow_state at the message level (it only reaches a Message
// nested inside expert_handoffs[] rows, which always carry a real expert_handoff
// Part), so the message-level synthesizer was pure client divergence and a no-op
// on the real stream.
//
// reasoning_log is DELIBERATELY kept: the backend (turn_finalize.py, default-on
// CLIO_CAPTURE_REASONING) emits assistant metadata.reasoning_log for
// reasoning-capable models with NO backing thinking/reasoning part
// (streaming.py deliberately does not route reasoning tokens into a part), so this
// compact marker is the only surface for that content. Per contract/SPEC.md
// Appendix A its deletion condition ("server emits reasoning as reasoning parts")
// is not yet met — retire it only once the server emits real reasoning parts.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func normalizeMessageReasoningLog(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartID(*m, "synthetic_reasoning_log") {
		return
	}
	rows, ok := m.Metadata["reasoning_log"].([]any)
	if !ok || len(rows) == 0 {
		return
	}
	totalChars := 0
	models := []string{}
	for _, raw := range rows {
		row := valuefmt.MapValue(raw)
		if len(row) == 0 {
			continue
		}
		if n, ok := intValue(row["reasoning_chars"]); ok {
			totalChars += n
		} else {
			totalChars += len(valuefmt.StringValue(row["reasoning"]))
		}
		if model := valuefmt.StringValue(row["model"]); model != "" && !stringInSlice(models, model) {
			models = append(models, model)
		}
	}
	if totalChars == 0 && len(models) == 0 {
		return
	}
	summary := fmt.Sprintf("reasoning captured: %d entr%s", len(rows), map[bool]string{true: "y", false: "ies"}[len(rows) == 1])
	if totalChars > 0 {
		summary += fmt.Sprintf(" · %d chars", totalChars)
	}
	if len(models) > 0 {
		summary += " · " + strings.Join(models, ", ")
	}
	part := gact.Part{
		ID:       "synthetic_reasoning_log",
		Type:     gact.PartTypeThinking,
		Thinking: summary,
		Metadata: map[string]any{
			"synthetic_from":    "reasoning_log_metadata",
			"reasoning_entries": len(rows),
			"reasoning_chars":   totalChars,
			"models":            models,
			"note":              "full reasoning_log is kept on message metadata; the transcript shows this compact marker only",
		},
	}
	insertAt := len(m.Parts)
	for i, existing := range m.Parts {
		if existing.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+1)
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, part)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}

func intValue(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case json.Number:
		n, err := v.Int64()
		return int(n), err == nil
	default:
		return 0, false
	}
}

func normalizeMessageErrorInfo(m *gact.Message) {
	if m == nil || m.ErrorInfo == nil || messageHasPartType(m, gact.PartTypeError) {
		return
	}
	metadata := map[string]any{
		"synthetic_from": "message_error_info",
	}
	if len(m.ErrorInfo.Details) > 0 {
		metadata["details"] = m.ErrorInfo.Details
	}
	if m.ErrorInfo.RetryAfterS != nil {
		metadata["retry_after_s"] = *m.ErrorInfo.RetryAfterS
	}
	part := gact.Part{
		ID:          "synthetic_message_error_info",
		Type:        gact.PartTypeError,
		Code:        m.ErrorInfo.Error,
		Message:     m.ErrorInfo.Message,
		Recoverable: m.ErrorInfo.Recoverable,
		Metadata:    metadata,
	}
	insertAt := len(m.Parts)
	for i, existing := range m.Parts {
		if existing.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+1)
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, part)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}
