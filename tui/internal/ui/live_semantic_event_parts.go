package ui

// live_semantic_event_parts.go converts semantic SSE events into conversation parts and dedup keys.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func semanticEventDuplicateKey(payload map[string]any, eventType string, part gact.Part) string {
	if part.Type != gact.PartTypeExpertHandoff {
		return ""
	}
	if !strings.HasPrefix(eventType, "blueprint.delegation.") && !strings.HasPrefix(eventType, "agent.invocation.") {
		return ""
	}
	refs := semanticWorkflowRefs(payload, eventType)
	summary := strings.TrimSpace(strings.Join(strings.Fields(part.Text), " "))
	if summary == "" {
		return ""
	}
	values := []string{
		eventType,
		refs.status,
		refs.stage,
		refs.parent,
		refs.agent,
		summary,
	}
	for i := range values {
		values[i] = strings.ToLower(strings.TrimSpace(values[i]))
	}
	return strings.Join(values, "\x1f")
}

func semanticEventPart(e client.SSEEvent, payload map[string]any, eventType string) (gact.Part, bool) {
	status := firstNonEmpty(stringValue(payload["status"]), "observed")
	summary := semanticUserSummary(payload, eventType)
	metadata := semanticWorkflowMetadata(payload, eventType)
	if strings.HasPrefix(eventType, "tool.call.") {
		return gact.Part{}, false
	}
	switch {
	case strings.HasPrefix(eventType, "hook.invocation.") && !semanticEventIsFailure(eventType, status):
		return gact.Part{}, false
	case strings.HasPrefix(eventType, "llm.request.") && !semanticEventIsFailure(eventType, status):
		return gact.Part{}, false
	case strings.HasPrefix(eventType, "turn.") && !semanticEventIsFailure(eventType, status):
		return gact.Part{}, false
	case eventType == "agent.invocation.started" && !semanticEventIsFailure(eventType, status):
		return hideTranscriptSemanticPart(gact.Part{
			Type:     gact.PartTypeExpertHandoff,
			Text:     summary,
			Metadata: metadata,
		}), true
	case eventType == "blueprint.delegation.started" && !semanticEventIsFailure(eventType, status):
		return hideTranscriptSemanticPart(gact.Part{
			Type:     gact.PartTypeExpertHandoff,
			Text:     summary,
			Metadata: metadata,
		}), true
	case eventType == "blueprint.delegation.parent_resumed":
		return gact.Part{}, false
	case eventType == "expert.lifecycle.started":
		return hideTranscriptSemanticPart(semanticExpertLifecyclePart(payload, metadata)), true
	case eventType == "react.step.completed":
		part, ok := semanticReactStepPart(payload, metadata)
		return part, ok
	case eventType == "expert.extract.completed":
		if semanticExtractOutputIsRedacted(payload) {
			return gact.Part{}, false
		}
		return semanticExpertExtractPart(payload, metadata), true
	case strings.HasPrefix(eventType, "blueprint.delegation."):
		return gact.Part{
			Type:     gact.PartTypeExpertHandoff,
			Text:     summary,
			Metadata: metadata,
		}, true
	case strings.HasPrefix(eventType, "agent.invocation."):
		return gact.Part{
			Type:     gact.PartTypeExpertHandoff,
			Text:     summary,
			Metadata: metadata,
		}, true
	case semanticEventIsFailure(eventType, status):
		return gact.Part{
			Type:        gact.PartTypeError,
			Code:        eventType,
			Message:     summary,
			Recoverable: true,
			Metadata:    metadata,
		}, true
	default:
		return gact.Part{}, false
	}
}

func hideTranscriptSemanticPart(part gact.Part) gact.Part {
	if part.Metadata == nil {
		part.Metadata = map[string]any{}
	}
	part.Metadata["transcript_hidden"] = true
	return part
}

func semanticExpertLifecyclePart(payload map[string]any, metadata map[string]any) gact.Part {
	nested := mapValue(payload["payload"])
	expert := firstNonEmpty(stringValue(nested["expert_id"]), stringValue(metadata["agent_id"]), "expert")
	metadata["agent_id"] = expert
	metadata["stage"] = "expert.lifecycle.started"
	metadata["expert_span_id"] = stringValue(nested["expert_span_id"])
	if input := firstNonEmpty(stringValue(nested["input"]), stringValue(nested["question"])); input != "" {
		if !semanticRedactedMarker(input) {
			metadata["input"] = input
		}
	}
	summary := firstNonEmpty(stringValue(payload["summary"]), "expert "+expert+" started")
	return gact.Part{
		Type:     gact.PartTypeExpertHandoff,
		Text:     summary,
		Metadata: metadata,
	}
}

func semanticReactStepPart(payload map[string]any, metadata map[string]any) (gact.Part, bool) {
	nested := mapValue(payload["payload"])
	thought := strings.TrimSpace(stringValue(nested["thought"]))
	if thought == "" {
		thought = strings.TrimSpace(firstNonEmpty(stringValue(nested["result_summary"]), stringValue(payload["summary"])))
	}
	if thought == "" {
		return gact.Part{}, false
	}
	expert := firstNonEmpty(stringValue(nested["expert_id"]), stringValue(metadata["agent_id"]), "expert")
	metadata["agent_id"] = expert
	metadata["stage"] = "react.step.completed"
	metadata["semantic_react_step"] = true
	metadata["expert_span_id"] = stringValue(nested["expert_span_id"])
	metadata["step_span_id"] = stringValue(nested["step_span_id"])
	if stepIndex, ok := firstNumericValue(nested, "step_index"); ok {
		metadata["step_index"] = stepIndex
	}
	if isFinish, ok := nested["is_finish"].(bool); ok {
		metadata["is_finish"] = isFinish
	}
	if toolName := stringValue(nested["tool_name"]); toolName != "" {
		metadata["tool_name"] = toolName
	}
	if args := firstNonNil(nested["tool_args"], nested["args"]); args != nil {
		metadata["tool_args"] = args
	}
	if observation := firstNonNil(nested["observation"], nested["result"]); observation != nil {
		metadata["observation"] = observation
	}
	if reasoning := strings.TrimSpace(stringValue(nested["reasoning"])); reasoning != "" && !semanticRedactedMarker(reasoning) {
		metadata["reasoning"] = reasoning
	}
	if resultSummary := firstNonEmpty(stringValue(nested["result_summary"]), stringValue(payload["summary"])); resultSummary != "" {
		metadata["output_summary"] = resultSummary
	}
	return gact.Part{
		Type:     gact.PartTypeThinking,
		Thinking: thought,
		Metadata: metadata,
	}, true
}

func semanticExpertExtractPart(payload map[string]any, metadata map[string]any) gact.Part {
	nested := mapValue(payload["payload"])
	expert := firstNonEmpty(stringValue(nested["expert_id"]), stringValue(metadata["agent_id"]), "expert")
	metadata["agent_id"] = expert
	metadata["stage"] = "expert.extract.completed"
	metadata["expert_span_id"] = stringValue(nested["expert_span_id"])
	if stepCount, ok := firstNumericValue(nested, "step_count"); ok {
		metadata["step_count"] = stepCount
	}
	if structured := mapValue(nested["structured"]); len(structured) > 0 {
		metadata["structured"] = structured
		if workflowState := mapValue(structured["workflow_state"]); len(workflowState) > 0 {
			metadata["workflow_state"] = workflowState
			metadata["workflow_summary"] = workflowStateSummary(workflowState)
		}
	}
	output := strings.TrimSpace(stringValue(nested["output"]))
	if output != "" && !semanticRedactedMarker(output) {
		metadata["output_summary"] = output
	} else if summary := semanticStructuredOutputSummary(nested, nested); summary != "" {
		metadata["output_summary"] = summary
	} else if summary := strings.TrimSpace(stringValue(payload["summary"])); summary != "" {
		metadata["output_summary"] = summary
	}
	return gact.Part{
		Type:     gact.PartTypeExpertHandoff,
		Text:     firstNonEmpty(stringValue(metadata["output_summary"]), stringValue(payload["summary"]), "expert "+expert+" completed"),
		Metadata: metadata,
	}
}

func semanticExtractOutputIsRedacted(payload map[string]any) bool {
	nested := mapValue(payload["payload"])
	output := strings.TrimSpace(stringValue(nested["output"]))
	return output == "" || semanticRedactedMarker(output)
}
