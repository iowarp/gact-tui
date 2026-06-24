package ui

// live_message_normalization.go normalizes message presentation (compaction summaries, partial-answer labels, visibility).

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func normalizeMessagePresentation(m *gact.Message) {
	normalizeMessageCompactionSummaries(m)
	normalizeMessageAdapterSections(m)
	normalizeMessageExpertHandoffs(m)
	normalizeMessageWorkflowState(m)
	normalizeMessageReasoningLog(m)
	normalizeMessageErrorInfo(m)
	normalizeMessagePartialAnswerLabels(m)
	normalizeMessageToolEvidence(m)
	normalizeMessageRuntimeProvenance(m)
}

func normalizeMessageCompactionSummaries(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartType(m, gact.PartTypeCompaction) {
		return
	}
	for i := range m.Parts {
		part := &m.Parts[i]
		if part.Type != gact.PartTypeText {
			continue
		}
		text := strings.TrimSpace(part.Text)
		if !isCompactSummaryPart(*part, text) {
			continue
		}
		part.Type = gact.PartTypeCompaction
		part.Summary = compactSummaryText(text)
		part.Text = ""
		if part.Metadata == nil {
			part.Metadata = map[string]any{}
		}
		part.Metadata["synthetic_from"] = "compact_summary_text"
		return
	}
}

func isCompactSummaryPart(part gact.Part, text string) bool {
	if strings.HasPrefix(strings.ToLower(text), "[compact summary]") {
		return true
	}
	if part.Metadata == nil {
		return false
	}
	return strings.TrimSpace(fmt.Sprint(part.Metadata["synthetic"])) == "compact_summary"
}

func compactSummaryText(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(strings.ToLower(text), "[compact summary]") {
		text = strings.TrimSpace(text[len("[compact summary]"):])
	}
	return text
}

func messageHasPartType(m *gact.Message, partType string) bool {
	for _, part := range m.Parts {
		if part.Type == partType {
			return true
		}
	}
	return false
}

func shouldRenderConversationMessage(m gact.Message) bool {
	if len(m.Parts) > 0 || isModelSwapMarker(m) || m.ErrorInfo != nil {
		return true
	}
	if len(normalizeToolEvidenceRows(m.Metadata["tools_called"])) > 0 {
		return true
	}
	if len(normalizeExpertHandoffRows(m.Metadata["expert_handoffs"])) > 0 {
		return true
	}
	if len(mapValue(m.Metadata["workflow_state"])) > 0 {
		return true
	}
	if rows, ok := m.Metadata["reasoning_log"].([]any); ok && len(rows) > 0 {
		return true
	}
	if hasRuntimeProvenance(m) {
		return true
	}
	return false
}

func normalizeMessagePartialAnswerLabels(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant {
		return
	}
	if m.StopReason != gact.StopReasonError && m.ErrorInfo == nil && !messageHasPartType(m, gact.PartTypeError) {
		return
	}
	seenError := false
	hasErrorPart := messageHasPartType(m, gact.PartTypeError)
	for i := range m.Parts {
		part := &m.Parts[i]
		if part.Type == gact.PartTypeError {
			seenError = true
			continue
		}
		if part.Type != gact.PartTypeText {
			continue
		}
		if hasErrorPart && !seenError {
			continue
		}
		if part.Metadata == nil {
			part.Metadata = map[string]any{}
		}
		part.Metadata["partial_after_error"] = true
	}
}
