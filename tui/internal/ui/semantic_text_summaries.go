package ui

// semantic_text_summaries.go classifies and humanizes semantic event text/types.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func semanticSummaryIsPlumbing(summary, eventType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(strings.Join(strings.Fields(summary), " ")))
	normalized = strings.Trim(normalized, " .")
	if normalized == "" {
		return true
	}
	humanized := strings.ToLower(strings.TrimSpace(humanizeSemanticEventType(eventType)))
	humanized = strings.Trim(humanized, " .")
	switch normalized {
	case humanized,
		"started",
		"running",
		"completed",
		"failed",
		"delegation started",
		"delegation completed",
		"delegation failed",
		"invocation started",
		"invocation completed",
		"invocation failed",
		"agent invocation started",
		"agent invocation completed",
		"blueprint delegation started",
		"blueprint delegation completed",
		"delegate.started",
		"delegate.completed",
		"parent.resumed":
		return true
	}
	return strings.HasPrefix(normalized, "invoking ") ||
		strings.Contains(normalized, " returned a prediction") ||
		strings.Contains(normalized, " returned prediction") ||
		strings.Contains(normalized, " delegated sync work to ") ||
		strings.Contains(normalized, " returned a compact result to ") ||
		strings.Contains(normalized, " returned compact result to ") ||
		strings.Contains(normalized, "delegate.started") ||
		strings.Contains(normalized, "delegate.completed") ||
		strings.Contains(normalized, "parent.resumed")
}

func humanizeSemanticEventType(eventType string) string {
	text := strings.TrimSpace(eventType)
	text = strings.TrimPrefix(text, "blueprint.")
	text = strings.TrimPrefix(text, "agent.")
	text = strings.ReplaceAll(text, ".", " ")
	text = strings.ReplaceAll(text, "_", " ")
	return strings.TrimSpace(text)
}

func stripSemanticControlContracts(text string) string {
	text = stripSemanticControlMarkers(text)
	if text == "" {
		return ""
	}
	if looksLikeMarkdownBlock(text) {
		return truncateMarkdownBlock(text, 1200, 18)
	}
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	return textutil.Truncate(text, 320)
}

// stripSemanticControlMarkers cuts the text at the first DSPy control-contract
// marker WITHOUT the summarizing truncation of stripSemanticControlContracts.
// The unified transcript render uses it so assistant prose renders in full
// (web parity: text rows are markdown IN FULL; truncation is reserved for
// semantic-event summaries).
func stripSemanticControlMarkers(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	contractMarkers := []string{
		"NEXT_EXPERT:",
		"NEXT_ACTION:",
		"BLOCKER:",
		"DO_NOT_DELEGATE",
		"DO_NOT_FINALIZE",
		"continuation_contract=",
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"Retained typed workflow state:",
		"The workflow state is populated accordingly:",
		"The workflow state now records",
	}
	for _, marker := range contractMarkers {
		if idx := strings.Index(strings.ToUpper(text), strings.ToUpper(marker)); idx >= 0 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	return text
}
