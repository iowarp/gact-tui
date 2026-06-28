package ui

// presentation_workflow_state_parse.go parses embedded workflow-state JSON out of free text.

import (
	"encoding/json"
	"strings"
)

func summarizeEmbeddedWorkflowStateText(text string) string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" {
		return ""
	}
	labels := []string{
		"Retained typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO typed workflow state:",
		"workflow state:",
	}
	for _, label := range labels {
		idx := indexFold(text, label)
		if idx < 0 {
			continue
		}
		before := strings.TrimSpace(text[:idx])
		raw := strings.TrimSpace(text[idx+len(label):])
		state, ok := parseWorkflowStateJSON(raw)
		if !ok {
			continue
		}
		summary := workflowStateSummary(state)
		if summary == "" {
			continue
		}
		stateSummary := workflowStateBlockFromSummary(summary)
		if before == "" {
			return stateSummary
		}
		return strings.TrimRight(before, ".") + "\n" + stateSummary
	}
	return ""
}

func parseWorkflowStateJSON(text string) (map[string]any, bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, false
	}
	start := strings.IndexByte(text, '{')
	if start < 0 {
		return nil, false
	}
	end := matchingJSONObjectEnd(text[start:])
	if end < 0 {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(text[start:start+end]), &payload); err != nil {
		return nil, false
	}
	if state := mapValue(payload["workflow_state"]); len(state) > 0 {
		return state, true
	}
	return payload, len(payload) > 0
}

func matchingJSONObjectEnd(text string) int {
	depth := 0
	inString := false
	escaped := false
	for i, r := range text {
		if inString {
			switch {
			case escaped:
				escaped = false
			case r == '\\':
				escaped = true
			case r == '"':
				inString = false
			}
			continue
		}
		switch r {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i + 1
			}
		}
	}
	return -1
}

func indexFold(text, needle string) int {
	return strings.Index(strings.ToLower(text), strings.ToLower(needle))
}
