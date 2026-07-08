package ui

// execution_timeline_helpers.go provides execution-timeline value/depth/key helpers shared by the projector.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strconv"
	"strings"
)

func executionReactStepSpanIDs(events []executionTimelineEvent) map[string]bool {
	out := map[string]bool{}
	for _, event := range events {
		if event.Type != "react.step.completed" {
			continue
		}
		nested := valuefmt.MapValue(event.Payload["payload"])
		if span := strings.TrimSpace(valuefmt.StringValue(nested["step_span_id"])); span != "" {
			out[span] = true
		}
		if span := strings.TrimSpace(valuefmt.StringValue(event.Payload["parent_span_id"])); span != "" {
			out[span] = true
		}
	}
	return out
}

func suffixPrefixOverlap(left, right string) int {
	maxLen := min(len(left), len(right))
	for n := maxLen; n > 0; n-- {
		if strings.HasSuffix(left, right[:n]) {
			return n
		}
	}
	return 0
}

func timelineIntValue(value any, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case jsonNumber:
		if i, err := strconv.Atoi(string(v)); err == nil {
			return i
		}
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return i
		}
	}
	return fallback
}

type jsonNumber string

func boolValue(value any) bool {
	v, _ := optionalBoolValue(value)
	return v
}

func handoffKey(parent, agent string) string {
	return strings.TrimSpace(parent) + "->" + strings.TrimSpace(agent)
}

func timelineDepth(parent, agent string) int {
	parent = strings.TrimSpace(parent)
	agent = strings.TrimSpace(agent)
	if parent == "" || parent == "main" {
		if agent == "main" || agent == "" {
			return 0
		}
		return 1
	}
	return timelineAgentDepth(parent) + 1
}

func timelineAgentDepth(agent string) int {
	switch strings.TrimSpace(agent) {
	case "", "main":
		return 0
	case "data", "geospatial", "analysis", "visualization", "synthesis":
		return 1
	default:
		return 2
	}
}

func executionPayloadBody(payload map[string]any) map[string]any {
	return valuefmt.MapValue(payload["payload"])
}

func executionActorAgentID(payload map[string]any) string {
	return strings.TrimSpace(valuefmt.StringValue(valuefmt.MapValue(payload["actor"])["agent_id"]))
}

func executionSubjectAgentID(payload map[string]any) string {
	return strings.TrimSpace(valuefmt.StringValue(valuefmt.MapValue(payload["subject"])["agent_id"]))
}

func executionExpertID(payload map[string]any) string {
	nested := executionPayloadBody(payload)
	return strings.TrimSpace(valuefmt.FirstNonEmpty(
		valuefmt.StringValue(nested["expert_id"]),
		executionActorAgentID(payload),
	))
}

func executionToolEventSuppressedByReactSteps(reactStepSpans map[string]bool, payload map[string]any) bool {
	// Once CLIO emits react.step.completed, each step already carries the
	// tool call and observation. Standalone tool.call.* events are retained
	// for older streams only, so mixed streams do not double-render tools.
	return len(reactStepSpans) > 0
}
