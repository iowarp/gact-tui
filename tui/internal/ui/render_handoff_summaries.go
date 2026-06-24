package ui

// render_handoff_summaries.go summarizes expert-handoff input/output text and scores candidate summaries.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func summarizeExpertHandoffOutput(output string) string {
	output = strings.TrimSpace(output)
	if output == "" {
		return ""
	}
	if containsFormattedWorkflowStateSummary(output) {
		return truncateMarkdownBlock(output, 1200, 18)
	}
	if stripped := stripEmbeddedWorkflowStateBlock(output); stripped != "" && stripped != output {
		output = stripped
	}
	compact := strings.TrimSpace(strings.Join(strings.Fields(output), " "))
	if summary := summarizeEmbeddedWorkflowStateText(compact); summary != "" {
		return summary
	}
	if summary := summarizeEmbeddedStructuredHandoffText(compact); summary != "" {
		return summary
	}
	if summary := summarizeStructuredHandoffOutput(compact); summary != "" {
		return summary
	}
	output = expandInlineMarkdownTables(output)
	if looksLikeMarkdownBlock(output) {
		return truncateMarkdownBlock(output, 1200, 18)
	}
	output = compact
	if (strings.Contains(output, "member=") || strings.Contains(output, ".SAC")) && strings.Contains(output, " - ") {
		output = strings.SplitN(output, " - ", 2)[0]
	}
	output = shortenKnownPaths(output)
	segments := splitSummarySegments(output)
	if len(segments) == 0 {
		return textutil.Truncate(output, 260)
	}
	limit := min(len(segments), 3)
	return textutil.Truncate(strings.Join(segments[:limit], "\n"), 320)
}

func expertHandoffOutputSummary(p gact.Part) string {
	if expertHandoffStarted(stringValue(p.Metadata["stage"]), stringValue(p.Metadata["status"])) {
		startOutputs := []string{
			summarizeExpertHandoffInput(stringValue(p.Metadata["input_summary"])),
			summarizeExpertHandoffInput(stringValue(p.Metadata["input"])),
		}
		return bestExpertHandoffSummary(startOutputs)
	}
	if local := summarizeExpertHandoffOutput(stringValue(p.Metadata["local_output_summary"])); local != "" &&
		!strings.Contains(strings.ToLower(local), "state:") {
		return attachWorkflowStateSummary(local, p)
	}
	outputs := []string{
		stringValue(p.Metadata["return_output_summary"]),
		stringValue(p.Metadata["result_summary"]),
		stringValue(p.Metadata["observation_summary"]),
		stringValue(p.Metadata["output_summary"]),
		stringValue(p.Metadata["summary"]),
		expertHandoffErrorSummary(p.Metadata["error"]),
		p.Text,
	}
	output := bestExpertHandoffSummary(outputs)
	return attachWorkflowStateSummary(output, p)
}

func summarizeExpertHandoffInput(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}
	for _, marker := range []string{
		"Parent evidence available for this delegated task:",
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"Retained typed workflow state:",
	} {
		if idx := indexFold(input, marker); idx > 0 {
			input = strings.TrimSpace(input[:idx])
		}
	}
	return input
}

func bestExpertHandoffSummary(candidates []string) string {
	best := ""
	bestScore := 0
	haveBest := false
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		summary := summarizeExpertHandoffOutput(candidate)
		if summary == "" {
			continue
		}
		score := expertHandoffSummaryScore(candidate, summary)
		if !haveBest || score > bestScore {
			best = summary
			bestScore = score
			haveBest = true
		}
	}
	return best
}

func expertHandoffSummaryScore(raw string, summary string) int {
	rawLower := strings.ToLower(raw)
	lower := strings.ToLower(summary)
	score := 0
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(summary)) {
		score += 6
	}
	for _, token := range []string{
		"artifact", "plot", "staged", "selected station", "candidate", "resolved region",
		"dataset", "resource", "blocker", "fallback", "rows", "columns", "confidence",
		"center", "radius", "station",
	} {
		if strings.Contains(lower, token) {
			score += 3
		}
	}
	if strings.Contains(lower, "state:") {
		score -= 3
	}
	if strings.Contains(rawLower, "workflow_state") {
		score -= 4
	}
	if strings.Contains(rawLower, "local_output_summary") {
		score -= 2
	}
	if len(summary) < 500 {
		score += 2
	}
	if len(summary) > 1200 {
		score -= 3
	}
	return score
}

func summarizeStructuredHandoffOutput(output string) string {
	if !strings.HasPrefix(output, "{") && !strings.HasPrefix(output, "[") {
		return ""
	}
	var payload any
	if err := json.Unmarshal([]byte(output), &payload); err != nil {
		return ""
	}
	obj, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	return summarizeStructuredHandoffObjectStatus(obj)
}

func splitSummarySegments(output string) []string {
	var segments []string
	for _, raw := range strings.Split(output, " - ") {
		text := strings.TrimSpace(raw)
		if text == "" {
			continue
		}
		if (strings.Contains(text, "member=") || strings.Contains(text, ".SAC")) && len(segments) > 0 {
			continue
		}
		if strings.Contains(text, ": ") && len(text) > 120 {
			parts := strings.Split(text, ". ")
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if part != "" {
					segments = append(segments, part)
				}
				if len(segments) >= 3 {
					return segments
				}
			}
			continue
		}
		segments = append(segments, text)
		if len(segments) >= 3 {
			break
		}
	}
	return segments
}

func expertHandoffErrorSummary(raw any) string {
	switch errValue := raw.(type) {
	case nil:
		return ""
	case map[string]any:
		if summary := summarizeErrorResult(errValue); summary != "" {
			return summary
		}
		if nested, ok := errValue["error"].(map[string]any); ok {
			return summarizeErrorResult(map[string]any{"error": nested})
		}
		return compactJSON(errValue)
	case string:
		text := strings.TrimSpace(errValue)
		if text == "" {
			return ""
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(text), &payload); err == nil {
			if summary := summarizeErrorResult(payload); summary != "" {
				return summary
			}
		}
		return shortenKnownPaths(text)
	default:
		return shortenKnownPaths(fmt.Sprint(errValue))
	}
}
