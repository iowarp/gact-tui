package ui

// execution_supplements.go derives supplemental execution nodes from assistant messages and de-duplicates them.
//
// executionPlaceholderAssistantText (below) is a TRANSITIONAL prose heuristic
// inventoried in contract/SPEC.md Appendix ("Transitional client presentation
// filters (non-normative)") next to the web client's equivalents. It exists only
// while the server still emits placeholder answer text (clio #832); its deletion
// condition is recorded there.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *executionComponent) assistantSupplementNodesByTurn() map[string][]executionTimelineNode {
	out := map[string][]executionTimelineNode{}
	currentTurnID := ""
	for _, msg := range c.app.conversation.messages {
		switch msg.Role {
		case gact.RoleUser:
			currentTurnID = messageTurnID(msg)
		case gact.RoleAssistant:
			turnID := firstNonEmpty(messageTurnID(msg), currentTurnID)
			if turnID == "" {
				continue
			}
			nodes := executionAssistantSupplementNodes(msg)
			if len(nodes) > 0 {
				out[turnID] = append(out[turnID], nodes...)
			}
		}
	}
	return out
}

func executionAssistantSupplementNodes(msg gact.Message) []executionTimelineNode {
	var nodes []executionTimelineNode
	for _, part := range msg.Parts {
		switch part.Type {
		case gact.PartTypeText:
			text := strings.TrimSpace(stripSemanticControlContracts(part.Text))
			if text != "" && executionSupplementCarriesArtifact(text) {
				nodes = append(nodes, executionTimelineNode{
					Kind:  executionNodeAssistantText,
					Agent: "main",
					Depth: 0,
					Text:  text,
				})
			}
		case gact.PartTypeExpertHandoff:
			node := executionExpertHandoffSupplementNode(part)
			if !executionNodeIsEmpty(node) {
				nodes = append(nodes, node)
			}
		case gact.PartTypeImage:
			if text := executionImagePartPreview(part); text != "" {
				nodes = append(nodes, executionTimelineNode{
					Kind:  executionNodeExpertReport,
					Agent: "artifact",
					Depth: 1,
					Text:  text,
				})
			}
		}
	}
	return nodes
}

func executionExpertHandoffSupplementNode(part gact.Part) executionTimelineNode {
	agent := firstNonEmpty(
		stringValue(part.Metadata["agent_id"]),
		stringValue(part.Metadata["delegate_to"]),
		"expert",
	)
	parent := firstNonEmpty(stringValue(part.Metadata["parent_id"]), stringValue(part.Metadata["parent"]))
	text := strings.TrimSpace(part.Text)
	node := executionTimelineNode{
		Kind:        executionNodeExpertReport,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineAgentDepth(agent),
		Text:        text,
		Structured: firstNonNil(
			part.Metadata["structured"],
			executionRetainedWorkflowStateFromText(text),
			part.Metadata["workflow_state"],
		),
	}
	preview := executionExpertReportPreview(node)
	if preview == "" {
		preview = strings.TrimSpace(stripSemanticControlContracts(text))
	}
	if executionPlaceholderAssistantText(preview) {
		return executionTimelineNode{}
	}
	if !executionSupplementCarriesArtifact(preview) {
		return executionTimelineNode{}
	}
	node.Text = preview
	return node
}

func executionImagePartPreview(part gact.Part) string {
	title := firstNonEmpty(part.Title, stringValue(part.Metadata["title"]), "image artifact")
	path := firstNonEmpty(part.URI, stringValue(part.Metadata["path"]), stringValue(part.Metadata["artifact_path"]))
	if path == "" {
		return title
	}
	return title + "\n" + shortenPathForInline(path) + "\nCtrl+E full image"
}

func executionSupplementCarriesArtifact(text string) bool {
	lower := strings.ToLower(text)
	for _, needle := range []string{".png", ".jpg", ".jpeg", ".gif", ".svg", "plot", "artifact", "full image"} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

func executionRetainedWorkflowStateFromText(text string) any {
	for _, marker := range []string{
		"Retained typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO merged nested typed workflow state:",
		"CLIO typed workflow state:",
	} {
		idx := strings.LastIndex(strings.ToLower(text), strings.ToLower(marker))
		if idx < 0 {
			continue
		}
		tail := text[idx+len(marker):]
		brace := strings.Index(tail, "{")
		if brace < 0 {
			continue
		}
		if parsed, ok := parseLooseJSON(tail[brace:]); ok {
			return parsed
		}
	}
	return nil
}

func executionDedupSupplementNodes(existing, supplements []executionTimelineNode) []executionTimelineNode {
	if len(supplements) == 0 {
		return nil
	}
	var haystack strings.Builder
	for _, node := range existing {
		haystack.WriteString(" ")
		haystack.WriteString(executionNodeComparableText(node))
	}
	existingText := normalizeExecutionComparable(haystack.String())
	var out []executionTimelineNode
	for _, node := range supplements {
		text := normalizeExecutionComparable(executionNodeComparableText(node))
		if text == "" {
			continue
		}
		if strings.Contains(existingText, text) {
			continue
		}
		out = append(out, node)
		existingText += " " + text
	}
	return out
}

func executionNodeComparableText(node executionTimelineNode) string {
	return firstNonEmpty(node.Text, node.Summary, node.Question, node.Thinking)
}

func normalizeExecutionComparable(text string) string {
	return strings.ToLower(strings.Join(strings.Fields(stripSemanticControlContracts(text)), " "))
}

func normalizeExecutionLooseComparable(text string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(stripSemanticControlContracts(text)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out.WriteRune(r)
		}
	}
	return out.String()
}

func executionTextQualityScore(text string) int {
	score := len(strings.TrimSpace(text))
	for _, r := range text {
		if r == ' ' || r == '\n' || r == '\t' {
			score += 2
		}
	}
	return score
}

func executionPlaceholderAssistantText(text string) bool {
	normalized := strings.ToLower(strings.Join(strings.Fields(stripSemanticControlContracts(text)), " "))
	if normalized == "" {
		return false
	}
	if strings.Contains(normalized, "no answer yet") {
		return true
	}
	return strings.Contains(normalized, "awaiting geospatial resolution") ||
		strings.Contains(normalized, "awaiting data acquisition") ||
		strings.Contains(normalized, "awaiting synthesis")
}
