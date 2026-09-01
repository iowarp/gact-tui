package ui

// execution_semantic_detail.go opens and formats the semantic-event detail for the selected execution turn.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *executionComponent) openSemanticDetailForSelection() bool {
	turnID := c.selectedTurnID()
	if turnID == "" {
		return false
	}
	sid := c.app.session.currentID()
	events := c.executionEventsBySession[sid]
	if len(events) == 0 {
		return false
	}
	var selected []executionTimelineEvent
	for _, event := range events {
		if strings.TrimSpace(event.TurnID) == turnID {
			selected = append(selected, event)
		}
	}
	if len(selected) == 0 {
		return false
	}
	c.app.detail.open(&bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    "semantic-detail",
		title:     "Execution detail",
		fullText:  executionSemanticDetailText(turnID, sid, selected),
	})
	return true
}

func executionSemanticDetailText(turnID string, sessionID string, events []executionTimelineEvent) string {
	counts := map[string]int{}
	agents := map[string]bool{}
	for _, event := range events {
		counts[event.Type]++
		if agent := executionEventAgent(event); agent != "" {
			agents[agent] = true
		}
	}
	var rows []string
	rows = appendDetailSection(rows, "Turn",
		detailField{"turn", turnID},
		detailField{"session", sessionID},
		detailField{"events", fmt.Sprintf("%d", len(events))},
		detailField{"agents", strings.Join(sortedExecutionBoolKeys(agents), "\n")},
	)
	var countRows []string
	for _, key := range sortedExecutionIntKeys(counts) {
		countRows = append(countRows, fmt.Sprintf("%s: %d", key, counts[key]))
	}
	rows = appendDetailSection(rows, "Event counts", detailField{"", strings.Join(countRows, "\n")})
	var timelineRows []string
	for _, event := range events {
		timelineRows = append(timelineRows, executionSemanticEventLine(event))
	}
	rows = appendDetailSection(rows, "Timeline", detailField{"", strings.Join(timelineRows, "\n")})
	return strings.Join(rows, "\n")
}

func executionSemanticEventLine(event executionTimelineEvent) string {
	parts := []string{fmt.Sprintf("%04d", event.Sequence), event.Type}
	if agent := executionEventAgent(event); agent != "" {
		parts = append(parts, agent)
	}
	switch event.Type {
	case "react.step.completed":
		payload := valuefmt.MapValue(event.Payload["payload"])
		if tool := valuefmt.StringValue(payload["tool_name"]); tool != "" {
			parts = append(parts, tool)
		}
	case "blueprint.delegation.started", "blueprint.delegation.completed":
		payload := valuefmt.MapValue(event.Payload["payload"])
		if child := valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["delegate_to"]), valuefmt.StringValue(payload["agent_id"])); child != "" {
			parts = append(parts, "→ "+child)
		}
	case "tool.call.started", "tool.call.completed":
		payload := semanticToolPayload(event.Payload)
		if tool := valuefmt.FirstNonEmpty(valuefmt.StringValue(payload["tool"]), valuefmt.StringValue(payload["tool_name"])); tool != "" {
			parts = append(parts, tool)
		}
	}
	if summary := strings.TrimSpace(valuefmt.StringValue(event.Payload["summary"])); summary != "" && !semanticPreviewIsRedacted(summary) {
		parts = append(parts, textutil.Truncate(strings.Join(strings.Fields(summary), " "), 120))
	}
	return strings.Join(parts, "  ")
}

func executionEventAgent(event executionTimelineEvent) string {
	payload := valuefmt.MapValue(event.Payload["payload"])
	return valuefmt.FirstNonEmpty(
		valuefmt.StringValue(payload["expert_id"]),
		valuefmt.StringValue(payload["parent_id"]),
		valuefmt.StringValue(valuefmt.MapValue(event.Payload["actor"])["agent_id"]),
	)
}

func (c *executionComponent) selectedTurnID() string {
	if c.app.conversation.bodySelMsgIdx < 0 || c.app.conversation.bodySelMsgIdx >= len(c.app.conversation.messages) {
		for i := len(c.app.conversation.messages) - 1; i >= 0; i-- {
			if c.app.conversation.messages[i].Role == gact.RoleUser {
				return c.app.conversation.messages[i].ID
			}
		}
		return ""
	}
	for i := c.app.conversation.bodySelMsgIdx; i >= 0; i-- {
		if c.app.conversation.messages[i].Role == gact.RoleUser {
			return c.app.conversation.messages[i].ID
		}
	}
	return ""
}

func sortedExecutionBoolKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedExecutionIntKeys(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
