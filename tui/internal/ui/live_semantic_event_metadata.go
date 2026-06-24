package ui

// live_semantic_event_metadata.go derives semantic-event workflow metadata, refs, and provider labels.

import "strings"

func semanticRedactedMarker(text string) bool {
	text = strings.TrimSpace(strings.ToLower(text))
	return strings.HasPrefix(text, "[redacted]")
}

func semanticEventIsFailure(eventType, status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "failed" ||
		status == "error" ||
		strings.Contains(eventType, ".failed") ||
		strings.Contains(eventType, ".degraded")
}

func semanticWorkflowMetadata(payload map[string]any, eventType string) map[string]any {
	nested := mapValue(payload["payload"])
	provider := mapValue(payload["provider"])
	refs := semanticWorkflowRefs(payload, eventType)
	userSummary := semanticUserSummary(payload, eventType)
	md := map[string]any{
		"agent_id":       refs.agent,
		"parent_id":      refs.parent,
		"status":         refs.status,
		"stage":          refs.stage,
		"summary":        userSummary,
		"output_summary": userSummary,
	}
	copySemanticTextField(md, "input", payload, nested)
	copySemanticTextField(md, "input_summary", payload, nested)
	copySemanticTextField(md, "output_summary", payload, nested)
	copySemanticTextField(md, "local_output_summary", payload, nested)
	copySemanticTextField(md, "return_output_summary", payload, nested)
	copySemanticTextField(md, "return_summary", payload, nested)
	copySemanticTextField(md, "result_summary", payload, nested)
	copySemanticTextField(md, "observation_summary", payload, nested)
	if duration, ok := floatValue(nested["duration_ms"]); ok {
		md["duration_ms"] = duration
	} else if duration, ok := floatValue(payload["duration_ms"]); ok {
		md["duration_ms"] = duration
	}
	if depth, ok := firstNumericValue(nested, "depth", "tier"); ok {
		md["depth"] = depth
	} else if depth, ok := firstNumericValue(payload, "depth", "tier"); ok {
		md["depth"] = depth
	}
	if selected := firstNonEmpty(
		stringValue(nested["selected_expert"]),
		stringValue(payload["selected_expert"]),
		stringValue(nested["selected_agent"]),
		stringValue(payload["selected_agent"]),
	); selected != "" {
		md["selected_agent"] = selected
	}
	if workflowState := mapValue(nested["workflow_state"]); len(workflowState) > 0 {
		md["workflow_state"] = workflowState
		md["workflow_summary"] = workflowStateSummary(workflowState)
	} else if workflowState := mapValue(payload["workflow_state"]); len(workflowState) > 0 {
		md["workflow_state"] = workflowState
		md["workflow_summary"] = workflowStateSummary(workflowState)
	}
	if failure := semanticFailureSummary(payload, eventType); failure != "" {
		md["error"] = failure
	}
	if fallback := semanticStreamFallbackSummary(payload); fallback != "" {
		md["stream_fallback"] = fallback
	}
	if providerLabel := semanticProviderLabel(provider); providerLabel != "" {
		md["provider"] = providerLabel
	}
	if apiBase := firstNonEmpty(stringValue(provider["api_base"]), stringValue(provider["base_url"])); apiBase != "" {
		md["api_base"] = apiBase
	}
	if refs.agent == "" {
		md["agent_id"] = firstNonEmpty(eventType, "workflow")
	}
	return md
}

func copySemanticTextField(dst map[string]any, key string, payload map[string]any, nested map[string]any) {
	text := firstNonEmpty(stringValue(nested[key]), stringValue(payload[key]))
	if strings.TrimSpace(text) == "" {
		return
	}
	if semanticRedactedMarker(text) {
		return
	}
	dst[key] = text
}

type semanticWorkflowRef struct {
	agent  string
	parent string
	stage  string
	status string
}

func semanticWorkflowRefs(payload map[string]any, eventType string) semanticWorkflowRef {
	nested := mapValue(payload["payload"])
	actor := mapValue(payload["actor"])
	subject := mapValue(payload["subject"])
	blueprint := mapValue(payload["blueprint"])
	stage := firstNonEmpty(
		stringValue(nested["stage"]),
		strings.TrimPrefix(eventType, "blueprint.delegation."),
		eventType,
	)
	status := firstNonEmpty(stringValue(payload["status"]), "observed")
	agent := firstNonEmpty(
		stringValue(nested["agent_id"]),
		stringValue(nested["child_expert"]),
		stringValue(blueprint["child_expert"]),
		workflowParticipantByRole(actor, "child"),
		workflowParticipantByRole(subject, "child"),
	)
	parent := firstNonEmpty(
		stringValue(nested["parent_id"]),
		stringValue(nested["parent_expert"]),
		stringValue(blueprint["parent_expert"]),
		workflowParticipantByRole(actor, "parent"),
		workflowParticipantByRole(subject, "parent"),
		stringValue(subject["parent_id"]),
	)
	if agent == "" {
		agent = firstNonEmpty(
			stringValue(actor["agent_id"]),
			stringValue(actor["agent"]),
			stringValue(actor["tool"]),
			stringValue(subject["agent_id"]),
			stringValue(subject["agent"]),
		)
	}
	if parent == agent {
		parent = ""
	}
	return semanticWorkflowRef{agent: agent, parent: parent, stage: stage, status: status}
}

func workflowParticipantByRole(values map[string]any, want string) string {
	role := strings.ToLower(strings.TrimSpace(stringValue(values["role"])))
	if !strings.Contains(role, want) {
		return ""
	}
	return firstNonEmpty(
		stringValue(values["agent_id"]),
		stringValue(values["agent"]),
		stringValue(values["tool"]),
	)
}

func semanticStructuredOutputSummary(payload map[string]any, nested map[string]any) string {
	if state := firstNonEmptyMap(mapValue(nested["workflow_state"]), mapValue(payload["workflow_state"])); len(state) > 0 {
		if summary := workflowStateSummary(state); summary != "" {
			return "state: " + summary
		}
	}
	for _, candidate := range []any{
		nested["result"],
		nested["output"],
		nested["evidence"],
		nested["artifact"],
		payload["result"],
		payload["output"],
		payload["evidence"],
		payload["artifact"],
	} {
		if summary := semanticStructuredValueSummary(candidate); summary != "" {
			return summary
		}
	}
	for _, key := range []string{"artifact_path", "output_path", "plot_path", "path", "file", "filepath"} {
		if value := firstNonEmpty(stringValue(nested[key]), stringValue(payload[key])); value != "" {
			return "artifact: " + shortenPathForInline(value)
		}
	}
	return ""
}

func semanticProviderLabel(provider map[string]any) string {
	providerID := firstNonEmpty(stringValue(provider["provider_id"]), stringValue(provider["provider"]))
	model := firstNonEmpty(stringValue(provider["model_id"]), stringValue(provider["model"]))
	switch {
	case providerID != "" && model != "":
		return providerID + " · " + model
	case providerID != "":
		return providerID
	default:
		return model
	}
}
