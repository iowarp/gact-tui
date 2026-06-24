package ui

// clipboard_transcript_model.go builds copyable text for transcript blocks, parts, and semantic content.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func messageTranscriptText(msgs []gact.Message, msgIdx int) (string, bool) {
	if msgIdx < 0 || msgIdx >= len(msgs) {
		return "", false
	}
	m := msgs[msgIdx]
	var b strings.Builder
	for _, p := range m.Parts {
		var chunk string
		if p.Type == gact.PartTypeToolCall {
			chunk = toolCallCopyText(p)
		} else {
			chunk, _ = semanticPartCopyText(msgs, msgIdx, p)
		}
		if chunk == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(chunk)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

func selectedConversationBlockText(msgs []gact.Message, msgIdx int, addrIdx int) (string, bool) {
	if msgIdx < 0 || msgIdx >= len(msgs) {
		return "", false
	}
	m := msgs[msgIdx]
	addr := addressablePartsOf(m)
	if addrIdx < 0 || addrIdx >= len(addr) {
		return "", false
	}
	partIdx := addr[addrIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return "", false
	}
	return conversationPartCopyText(msgs, msgIdx, m.Parts[partIdx])
}

func conversationPartCopyText(msgs []gact.Message, msgIdx int, p gact.Part) (string, bool) {
	if text, ok := semanticPartCopyText(msgs, msgIdx, p); ok {
		return text, true
	}
	return "", false
}

func semanticPartCopyText(msgs []gact.Message, msgIdx int, p gact.Part) (string, bool) {
	switch p.Type {
	case gact.PartTypeText:
		return cleanCopiedSemanticText(p.Text), strings.TrimSpace(p.Text) != ""
	case gact.PartTypeThinking:
		if strings.TrimSpace(p.Thinking) == "" {
			return "", false
		}
		return cleanCopiedSemanticText("<thinking>\n" + p.Thinking + "\n</thinking>"), true
	case gact.PartTypeExpertHandoff:
		text := expertHandoffCopyText(p)
		return text, strings.TrimSpace(text) != ""
	case gact.PartTypeToolCall:
		if p.CallID != "" {
			if result, ok := matchingToolResultForCall(msgs, msgIdx, p.CallID); ok {
				if text := toolResultCopyText(result); text != "" {
					return text, true
				}
			}
		}
		text := toolCallCopyText(p)
		return text, strings.TrimSpace(text) != ""
	case gact.PartTypeToolResult:
		if text := toolResultCopyText(p); text != "" {
			return text, true
		}
	case gact.PartTypeFileDiff:
		before, after := "", ""
		if p.Before != nil {
			before = *p.Before
		}
		if p.After != nil {
			after = *p.After
		}
		return "--- before ---\n" + before + "\n\n+++ after +++\n" + after, true
	case gact.PartTypeError:
		text := "Error: " + firstNonEmpty(p.Code, "error")
		if strings.TrimSpace(p.Message) != "" {
			text += "\n" + strings.TrimSpace(p.Message)
		}
		return cleanCopiedSemanticText(text), true
	default:
		text := strings.TrimSpace(partDetailText(p))
		return cleanCopiedSemanticText(text), text != ""
	}
	return "", false
}

func expertHandoffCopyText(p gact.Part) string {
	md := p.Metadata
	agent := firstNonEmpty(stringValue(md["agent_id"]), stringValue(md["expert"]), "expert")
	parent := firstNonEmpty(stringValue(md["parent_id"]), stringValue(md["parent"]))
	stage := firstNonEmpty(stringValue(md["stage"]), stringValue(md["dispatch_target"]))
	status := firstNonEmpty(stringValue(md["status"]), "observed")
	head := plainExpertHandoffNarrative(parent, agent, stage, status)
	if selected := stringValue(md["selected_agent"]); selected != "" && strings.Contains(strings.ToLower(stage), "agent.invocation.completed") {
		head = agent + " selected " + selected
	}
	meta := []string{}
	if status != "" {
		meta = append(meta, status)
	}
	if stageLabel := expertHandoffStageLabel(stage); stageLabel != "" {
		meta = append(meta, stageLabel)
	}
	if duration, ok := floatValue(md["duration_ms"]); ok && duration > 0 {
		meta = append(meta, fmt.Sprintf("%.0fms", duration))
	}
	if len(meta) > 0 {
		head += " - " + strings.Join(meta, " - ")
	}
	output := summarizeExpertHandoffOutput(expertHandoffOutputSummary(p))
	if strings.TrimSpace(output) == "" {
		return cleanCopiedSemanticText(head)
	}
	return cleanCopiedSemanticText(head + "\n" + output)
}

func plainExpertHandoffNarrative(parent, agent, stage, status string) string {
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	switch {
	case status == "failed" || status == "failure" || status == "error":
		if parent != "" && agent != "" {
			return agent + " failed while returning to " + parent
		}
		return agent + " failed"
	case strings.Contains(stage, "started"):
		if parent != "" && agent != "" {
			return parent + " handed work to " + agent
		}
		return agent + " started"
	case strings.Contains(stage, "completed"):
		if parent != "" && agent != "" {
			return agent + " returned evidence to " + parent
		}
		return agent + " returned evidence"
	case strings.Contains(stage, "parent.resumed") || strings.Contains(stage, "parent_resumed"):
		if parent != "" && agent != "" {
			return parent + " resumed after " + agent
		}
		return agent + " resumed"
	default:
		if parent != "" && agent != "" {
			return parent + " -> " + agent
		}
		return agent
	}
}

func toolCallCopyText(p gact.Part) string {
	name := toolDisplayName(p.ToolName)
	summary := toolCallSummary(p)
	rows := []string{"Tool call: " + name}
	if strings.TrimSpace(p.ToolName) != "" && strings.TrimSpace(p.ToolName) != name {
		rows = append(rows, "tool: "+strings.TrimSpace(p.ToolName))
	}
	if strings.TrimSpace(summary) == "" {
		return cleanCopiedSemanticText(strings.Join(rows, "\n"))
	}
	rows = append(rows, "Args: "+summary)
	return cleanCopiedSemanticText(strings.Join(rows, "\n"))
}

func toolResultCopyText(p gact.Part) string {
	raw := strings.TrimSpace(flattenToolResult(p))
	if raw == "" {
		return ""
	}
	if summary := summarizeToolResultText(p.ToolName, raw); summary != "" {
		raw = summary
	}
	return cleanCopiedSemanticText(raw)
}

func cleanCopiedSemanticText(text string) string {
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "\u202f", " ")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func matchingToolResultForCall(msgs []gact.Message, msgIdx int, callID string) (gact.Part, bool) {
	if callID == "" || msgIdx < 0 || msgIdx >= len(msgs) {
		return gact.Part{}, false
	}
	for _, p := range msgs[msgIdx].Parts {
		if p.Type == gact.PartTypeToolResult && p.CallID == callID {
			return p, true
		}
	}
	for i := msgIdx + 1; i < len(msgs); i++ {
		m := msgs[i]
		if m.Role != gact.RoleTool {
			break
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolResult && p.CallID == callID {
				return p, true
			}
		}
	}
	return gact.Part{}, false
}
