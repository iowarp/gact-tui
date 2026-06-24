package ui

// execution_timeline_nodes.go builds individual execution timeline nodes from event payloads.

import (
	"strings"
)

func executionHandoffNodeFromPayload(
	payload map[string]any,
	fallbackQuestions map[string]string,
) executionTimelineNode {
	nested := executionPayloadBody(payload)
	parent := firstNonEmpty(
		stringValue(nested["parent_id"]),
		executionActorAgentID(payload),
	)
	agent := firstNonEmpty(
		stringValue(nested["delegate_to"]),
		stringValue(nested["agent_id"]),
		executionSubjectAgentID(payload),
	)
	question := stringValue(nested["question"])
	if semanticPreviewIsRedacted(question) {
		question = fallbackQuestions[handoffKey(parent, agent)]
	}
	return executionTimelineNode{
		Kind:        executionNodeHandoff,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Question:    question,
		Status:      firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"])),
		Summary:     firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["ui_summary"])),
	}
}

func executionReactStepNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := executionPayloadBody(payload)
	agent := executionExpertID(payload)
	return executionTimelineNode{
		Kind:        executionNodeReactStep,
		Agent:       agent,
		Depth:       timelineAgentDepth(agent),
		StepIndex:   timelineIntValue(nested["step_index"], -1),
		ToolName:    firstNonEmpty(stringValue(nested["tool_name"]), "step"),
		ToolArgs:    nested["tool_args"],
		Observation: nested["observation"],
		IsFinish:    boolValue(nested["is_finish"]),
		Thinking:    strings.TrimSpace(stringValue(nested["thought"])),
		Reasoning:   strings.TrimSpace(stringValue(nested["reasoning"])),
		Summary:     firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["ui_summary"])),
	}
}

func executionExpertExtractNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := executionPayloadBody(payload)
	agent := executionExpertID(payload)
	return executionTimelineNode{
		Kind:       executionNodeExpertReport,
		Agent:      agent,
		Depth:      timelineAgentDepth(agent),
		Text:       firstNonEmpty(stringValue(nested["output"]), stringValue(nested["result_summary"])),
		Reasoning:  strings.TrimSpace(stringValue(nested["reasoning"])),
		Summary:    firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["result_summary"])),
		Structured: nested["structured"],
	}
}

func executionDelegationReportNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := executionPayloadBody(payload)
	agent := firstNonEmpty(
		stringValue(nested["delegate_to"]),
		stringValue(nested["agent_id"]),
		executionActorAgentID(payload),
	)
	parent := firstNonEmpty(
		stringValue(nested["return_to"]),
		stringValue(nested["parent_id"]),
		executionSubjectAgentID(payload),
	)
	return executionTimelineNode{
		Kind:        executionNodeExpertReport,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Text: firstNonEmpty(
			stringValue(nested["output_summary"]),
			stringValue(nested["return_output_summary"]),
			stringValue(nested["local_output_summary"]),
			stringValue(payload["summary"]),
		),
		Status:  firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"])),
		Summary: firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["result_summary"])),
	}
}

func executionToolStartedNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := semanticToolPayload(payload)
	actorAgent := executionActorAgentID(payload)
	return executionTimelineNode{
		Kind:     executionNodeToolRun,
		Agent:    firstNonEmpty(actorAgent, stringValue(nested["agent_id"])),
		Depth:    timelineAgentDepth(actorAgent),
		ToolName: firstNonEmpty(stringValue(nested["tool_name"]), stringValue(nested["tool"]), stringValue(payload["tool_name"])),
		ToolArgs: firstNonNil(nested["args"], payload["args"]),
		CallID:   firstNonEmpty(stringValue(nested["call_id"]), stringValue(payload["call_id"])),
		Status:   "running",
	}
}

func executionToolCompletedNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := semanticToolPayload(payload)
	actorAgent := executionActorAgentID(payload)
	return executionTimelineNode{
		Kind:        executionNodeToolRun,
		Agent:       firstNonEmpty(actorAgent, stringValue(nested["agent_id"])),
		Depth:       timelineAgentDepth(actorAgent),
		ToolName:    firstNonEmpty(stringValue(nested["tool_name"]), stringValue(nested["tool"]), stringValue(payload["tool_name"])),
		Observation: firstNonNil(nested["result"], nested["output"], payload["result"], payload["output"]),
		CallID:      firstNonEmpty(stringValue(nested["call_id"]), stringValue(payload["call_id"])),
		Status:      firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"]), "completed"),
		Summary:     stringValue(payload["summary"]),
	}
}
