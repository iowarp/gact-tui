package ui

// execution_reports.go builds expert-report and workflow-state execution previews and strips control sections.

import (
	"encoding/json"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"sort"
	"strings"
)

func executionAgentTextStructuredPreview(agent, text string) string {
	parsed, ok := parseLooseJSON(text)
	if !ok {
		return ""
	}
	obj := valuefmt.MapValue(parsed)
	if len(obj) == 0 {
		return ""
	}
	if !executionLooksLikeWorkflowControlJSON(obj) {
		return ""
	}
	if preview := executionWorkflowStatePreview(agent, obj); preview != "" {
		return preview
	}
	return executionStructuredMapPreview(agent, obj)
}

func executionLooksLikeWorkflowControlJSON(obj map[string]any) bool {
	for _, key := range []string{
		"workflow_state",
		"catalog",
		"acquisition",
		"resource_candidate",
		"station_catalog",
		"profile",
		"artifact",
		"plot",
	} {
		if _, ok := obj[key]; ok {
			return true
		}
	}
	return false
}

func executionExpertReportPreview(node executionTimelineNode) string {
	if text := executionWorkflowStatePreview(node.Agent, node.Structured); text != "" {
		return text
	}
	cleanText := stripExecutionControlSections(node.Text)
	if parsed, ok := parseLooseJSON(cleanText); ok {
		if text := executionWorkflowStatePreview(node.Agent, parsed); text != "" {
			return text
		}
		if obj := valuefmt.MapValue(parsed); len(obj) > 0 {
			return executionStructuredMapPreview(node.Agent, obj)
		}
	}
	return ""
}

func stripExecutionControlSections(text string) string {
	text = strings.TrimSpace(text)
	// Models occasionally leak an unpaired reasoning tag (e.g. a closing
	// </thinking> with no opener) into the thought text. Drop the bare tags so
	// they never reach the transcript.
	for _, tag := range []string{"<thinking>", "</thinking>", "<thought>", "</thought>"} {
		text = strings.ReplaceAll(text, tag, "")
		text = strings.ReplaceAll(text, strings.ToUpper(tag), "")
	}
	text = strings.TrimSpace(text)
	for _, marker := range []string{
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO merged nested typed workflow state:",
		"Retained typed workflow state:",
		"The workflow state is populated accordingly:",
	} {
		if idx := strings.Index(strings.ToLower(text), strings.ToLower(marker)); idx >= 0 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	return stripExecutionControlJSONFences(text)
}

func stripExecutionControlJSONFences(text string) string {
	for {
		start := strings.Index(text, "```")
		if start < 0 {
			return strings.TrimSpace(text)
		}
		afterStart := text[start+3:]
		lineEnd := strings.Index(afterStart, "\n")
		if lineEnd < 0 {
			return strings.TrimSpace(text)
		}
		info := strings.ToLower(strings.TrimSpace(afterStart[:lineEnd]))
		bodyStart := start + 3 + lineEnd + 1
		afterBody := text[bodyStart:]
		endRel := strings.Index(afterBody, "```")
		if endRel < 0 {
			return strings.TrimSpace(text)
		}
		body := afterBody[:endRel]
		end := bodyStart + endRel + 3
		remove := strings.Contains(info, "json") && executionFenceLooksLikeControlJSON(body)
		if !remove {
			next := text[end:]
			rest := stripExecutionControlJSONFences(next)
			return strings.TrimSpace(text[:end] + rest)
		}
		text = strings.TrimSpace(text[:start] + "\n" + text[end:])
	}
}

func executionFenceLooksLikeControlJSON(body string) bool {
	parsed, ok := parseLooseJSON(body)
	if !ok {
		return false
	}
	obj := valuefmt.MapValue(parsed)
	if len(obj) == 0 {
		return false
	}
	return executionLooksLikeWorkflowControlJSON(obj)
}

func executionWorkflowStatePreview(agent string, raw any) string {
	root := valuefmt.MapValue(raw)
	if len(root) == 0 {
		return ""
	}
	state := valuefmt.MapValue(root["workflow_state"])
	if len(state) == 0 {
		if structured := valuefmt.MapValue(root["structured"]); len(structured) > 0 {
			state = valuefmt.MapValue(structured["workflow_state"])
		}
	}
	if len(state) == 0 {
		return executionStructuredMapPreview(agent, root)
	}
	if executionLooksLikeWorkflowControlJSON(state) {
		return executionStructuredMapPreview(agent, state)
	}
	if agentMap := valuefmt.MapValue(state[agent]); len(agentMap) > 0 {
		return executionStructuredMapPreview(agent, agentMap)
	}
	for _, value := range state {
		if obj := valuefmt.MapValue(value); len(obj) > 0 {
			return executionStructuredMapPreview(agent, obj)
		}
	}
	return ""
}

func parseLooseJSON(raw any) (any, bool) {
	text := strings.TrimSpace(valuefmt.StringValue(raw))
	if text == "" {
		return nil, false
	}
	var parsed any
	if err := json.Unmarshal([]byte(text), &parsed); err == nil {
		return parsed, true
	}
	return nil, false
}

func sortedExecutionMapKeys(obj map[string]any) []string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
