package ui

// execution_timeline_nodes.go builds individual execution timeline nodes from event payloads.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func executionHandoffNodeFromPayload(
	payload map[string]any,
	fallbackQuestions map[string]string,
) executionTimelineNode {
	nested := executionPayloadBody(payload)
	parent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(nested["parent_id"]),
		executionActorAgentID(payload),
	)
	agent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(nested["delegate_to"]),
		valuefmt.StringValue(nested["agent_id"]),
		executionSubjectAgentID(payload),
	)
	question := valuefmt.StringValue(nested["question"])
	if semanticPreviewIsRedacted(question) {
		question = fallbackQuestions[handoffKey(parent, agent)]
	}
	return executionTimelineNode{
		Kind:        executionNodeHandoff,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Question:    question,
		Status:      valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["status"]), valuefmt.StringValue(payload["status"])),
		Summary:     valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["summary"]), valuefmt.StringValue(nested["ui_summary"])),
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
		ToolName:    valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["tool_name"]), "step"),
		ToolArgs:    nested["tool_args"],
		Observation: nested["observation"],
		IsFinish:    boolValue(nested["is_finish"]),
		Thinking:    strings.TrimSpace(valuefmt.StringValue(nested["thought"])),
		Reasoning:   strings.TrimSpace(valuefmt.StringValue(nested["reasoning"])),
		Summary:     valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["summary"]), valuefmt.StringValue(nested["ui_summary"])),
	}
}

func executionExpertExtractNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := executionPayloadBody(payload)
	agent := executionExpertID(payload)
	return executionTimelineNode{
		Kind:       executionNodeExpertReport,
		Agent:      agent,
		Depth:      timelineAgentDepth(agent),
		Text:       valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["output"]), valuefmt.StringValue(nested["result_summary"])),
		Reasoning:  strings.TrimSpace(valuefmt.StringValue(nested["reasoning"])),
		Summary:    valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["summary"]), valuefmt.StringValue(nested["result_summary"])),
		Structured: nested["structured"],
	}
}

func executionDelegationReportNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := executionPayloadBody(payload)
	agent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(nested["delegate_to"]),
		valuefmt.StringValue(nested["agent_id"]),
		executionActorAgentID(payload),
	)
	parent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(nested["return_to"]),
		valuefmt.StringValue(nested["parent_id"]),
		executionSubjectAgentID(payload),
	)
	return executionTimelineNode{
		Kind:        executionNodeExpertReport,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Text: valuefmt.FirstNonEmpty(
			valuefmt.StringValue(nested["output_summary"]),
			valuefmt.StringValue(nested["return_output_summary"]),
			valuefmt.StringValue(nested["local_output_summary"]),
			valuefmt.StringValue(payload["summary"]),
		),
		Status:  valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["status"]), valuefmt.StringValue(payload["status"])),
		Summary: valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["summary"]), valuefmt.StringValue(nested["result_summary"])),
	}
}

func executionToolStartedNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := semanticToolPayload(payload)
	actorAgent := executionActorAgentID(payload)
	return executionTimelineNode{
		Kind:     executionNodeToolRun,
		Agent:    valuefmt.FirstNonEmpty(actorAgent, valuefmt.StringValue(nested["agent_id"])),
		Depth:    timelineAgentDepth(actorAgent),
		ToolName: valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["tool_name"]), valuefmt.StringValue(nested["tool"]), valuefmt.StringValue(payload["tool_name"])),
		ToolArgs: firstNonNil(nested["args"], payload["args"]),
		CallID:   valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["call_id"]), valuefmt.StringValue(payload["call_id"])),
		Status:   "running",
	}
}

func executionToolCompletedNodeFromPayload(payload map[string]any) executionTimelineNode {
	nested := semanticToolPayload(payload)
	actorAgent := executionActorAgentID(payload)
	return executionTimelineNode{
		Kind:        executionNodeToolRun,
		Agent:       valuefmt.FirstNonEmpty(actorAgent, valuefmt.StringValue(nested["agent_id"])),
		Depth:       timelineAgentDepth(actorAgent),
		ToolName:    valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["tool_name"]), valuefmt.StringValue(nested["tool"]), valuefmt.StringValue(payload["tool_name"])),
		Observation: firstNonNil(nested["result"], nested["output"], payload["result"], payload["output"]),
		CallID:      valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["call_id"]), valuefmt.StringValue(payload["call_id"])),
		Status:      valuefmt.FirstNonEmpty(valuefmt.StringValue(nested["status"]), valuefmt.StringValue(payload["status"]), "completed"),
		Summary:     valuefmt.StringValue(payload["summary"]),
	}
}
