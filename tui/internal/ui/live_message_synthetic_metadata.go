package ui

// live_message_synthetic_metadata.go normalizes synthetic message metadata (workflow state, reasoning log, error info).

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/presentation"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func normalizeMessageWorkflowState(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartID(*m, "synthetic_workflow_state") {
		return
	}
	state := valuefmt.MapValue(m.Metadata["workflow_state"])
	if len(state) == 0 {
		return
	}
	summary := presentation.WorkflowStateSummary(state)
	if summary == "" {
		return
	}
	metadata := map[string]any{
		"synthetic_from": "workflow_state_metadata",
		"workflow_state": state,
		"state_keys":     presentation.SortedWorkflowStateKeys(state),
		"output_summary": summary,
		"summary":        summary,
	}
	part := gact.Part{
		ID:       "synthetic_workflow_state",
		Type:     gact.PartTypeExpertHandoff,
		Text:     "workflow state: " + summary,
		Metadata: metadata,
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
