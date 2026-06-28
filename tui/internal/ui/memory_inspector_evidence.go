package ui

// memory_inspector_evidence.go derives transcript/compaction memory evidence and budget/usage text.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func memoryInspectorSearchQuery(messages []gact.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if msg.Role != gact.RoleUser && msg.Role != gact.RoleAssistant {
			continue
		}
		for _, part := range msg.Parts {
			text := strings.TrimSpace(part.Text)
			if text == "" {
				text = strings.TrimSpace(part.Summary)
			}
			terms := memorySearchQueryTerms(text)
			if len(terms) >= 2 {
				return strings.Join(terms[:min(3, len(terms))], " ")
			}
		}
	}
	return ""
}

func memorySearchQueryTerms(text string) []string {
	stop := map[string]bool{
		"about": true, "after": true, "again": true, "answer": true, "because": true,
		"before": true, "could": true, "from": true, "have": true, "into": true,
		"should": true, "that": true, "their": true, "there": true, "this": true,
		"with": true, "would": true,
	}
	fields := strings.Fields(strings.ToLower(text))
	out := make([]string, 0, 4)
	seen := map[string]bool{}
	for _, field := range fields {
		field = strings.Trim(field, ".,:;!?()[]{}\"'")
		if len(field) < 4 || stop[field] || seen[field] {
			continue
		}
		seen[field] = true
		out = append(out, field)
		if len(out) >= 4 {
			break
		}
	}
	return out
}

type compactionEvidence struct {
	count int
	lines int
}

type transcriptEvidenceSummary struct {
	messages         int
	addressableParts int
	toolCalls        int
	toolResults      int
	toolErrors       int
	compactions      int
}

func transcriptMemoryEvidenceFromPart(part gact.Part, out *transcriptEvidenceSummary) {
	switch part.Type {
	case gact.PartTypeToolCall:
		out.toolCalls++
	case gact.PartTypeToolResult:
		out.toolResults++
		if part.IsError {
			out.toolErrors++
		}
	case gact.PartTypeCompaction:
		out.compactions++
	default:
		if text := strings.TrimSpace(part.Text); isCompactSummaryPart(part, text) {
			out.compactions++
		}
	}
	for _, child := range part.Content {
		transcriptMemoryEvidenceFromPart(child, out)
	}
}

func transcriptMemoryEvidence(messages []gact.Message) transcriptEvidenceSummary {
	var out transcriptEvidenceSummary
	for _, msg := range messages {
		out.messages++
		out.addressableParts += len(addressablePartsOf(msg))
		for _, part := range msg.Parts {
			transcriptMemoryEvidenceFromPart(part, &out)
		}
	}
	return out
}

func compactionEvidenceFromMessages(messages []gact.Message) compactionEvidence {
	var out compactionEvidence
	for _, msg := range messages {
		if msg.Role != gact.RoleAssistant {
			continue
		}
		for _, part := range msg.Parts {
			summary := strings.TrimSpace(part.Summary)
			if part.Type != gact.PartTypeCompaction {
				text := strings.TrimSpace(part.Text)
				if !isCompactSummaryPart(part, text) {
					continue
				}
				summary = compactSummaryText(text)
			}
			out.count++
			out.lines += lineCount(summary)
		}
	}
	return out
}

func memoryBudgetText(v *int) string {
	if v == nil {
		return "unbounded"
	}
	return fmt.Sprintf("%d", *v)
}

func memoryUsageText(tokens int, budget *int) string {
	if budget == nil || *budget <= 0 {
		return fmt.Sprintf("%d tokens retained / unbounded", tokens)
	}
	pct := float64(tokens) / float64(*budget) * 100
	return fmt.Sprintf("%d / %d tokens (%.1f%%)", tokens, *budget, pct)
}

func memoryRemainingText(tokens int, budget *int) string {
	if budget == nil {
		return "unbounded"
	}
	remaining := *budget - tokens
	if remaining < 0 {
		return fmt.Sprintf("0 tokens (%d over budget)", -remaining)
	}
	return fmt.Sprintf("%d tokens", remaining)
}

func memoryPressureText(tokens int, budget *int) string {
	if budget == nil || *budget <= 0 {
		return "unbounded"
	}
	ratio := float64(tokens) / float64(*budget)
	switch {
	case ratio >= 1:
		return fmt.Sprintf("over budget (%.1f%%)", ratio*100)
	case ratio >= 0.85:
		return fmt.Sprintf("high (%.1f%%)", ratio*100)
	case ratio >= 0.60:
		return fmt.Sprintf("moderate (%.1f%%)", ratio*100)
	default:
		return fmt.Sprintf("low (%.1f%%)", ratio*100)
	}
}

func memoryCompactionText(metadata map[string]any) string {
	if len(metadata) == 0 {
		return "not reported for this session"
	}
	for _, key := range []string{"compaction_state", "compaction", "compact_state", "context_compaction"} {
		if value, ok := metadata[key]; ok && value != nil {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" {
				return text
			}
		}
	}
	return "not reported for this session"
}
