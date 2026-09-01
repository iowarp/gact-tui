package ui

// live_message_normalization.go normalizes message presentation (compaction summaries, partial-answer labels, visibility).
//
// These normalization stages are TRANSITIONAL prose/shape heuristics inventoried
// alongside the web client's filters in contract/SPEC.md Appendix ("Transitional
// client presentation filters (non-normative)"). Each carries a documented
// deletion condition: they exist only while the server still leaks presentation
// chrome onto the clean stream (clio #832). Deletion is a server-driven, auditable
// step — the workflow_state fabricator was retired for #233 web parity (the web
// reads workflow_state off real expert_handoff parts; the backend never emits it at
// message level). Do not weaken or delete the remaining stages piecemeal.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func normalizeMessagePresentation(m *gact.Message) {
	normalizeMessageCompactionSummaries(m)
	normalizeMessageAdapterSections(m)
	normalizeMessageExpertHandoffs(m)
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
	// workflow_state message-level aggregate no longer makes a part-less message
	// visible: its fabricator was deleted for #233 web parity (the web reads
	// workflow_state off real expert_handoff parts, and the backend never emits it
	// at message level). A message with real parts still renders via the parts
	// clause above.
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
