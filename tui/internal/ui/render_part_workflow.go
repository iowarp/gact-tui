package ui

// render_part_workflow.go renders routing-decision and expert-handoff workflow parts.

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (t Theme) renderRoutingDecisionPart(p gact.Part, wrapW int) string {
	if routingDecisionIsInternalCleanup(p) {
		return ""
	}
	glyph := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▸ ")
	parent := firstNonEmpty(
		stringValue(p.Metadata["parent_id"]),
		stringValue(p.Metadata["parent_agent"]),
		stringValue(p.Metadata["source_agent"]),
		"orchestrator",
	)
	headText := renderAgentName(t, firstNonEmpty(parent, "orchestrator")) + " selected " +
		renderAgentName(t, firstNonEmpty(p.SelectedAgent, "agent"))
	parts := []string{glyph + headText}
	if p.Heuristic {
		parts = append(parts, lipgloss.NewStyle().Foreground(t.FgMuted).Render("heuristic"))
	} else {
		parts = append(parts, lipgloss.NewStyle().Foreground(t.FgMuted).Render("LM-routed"))
	}
	if p.Confidence > 0 {
		parts = append(parts,
			lipgloss.NewStyle().Foreground(t.FgMuted).
				Render(fmt.Sprintf("confidence %.2f", p.Confidence)))
	}
	head := strings.Join(parts, lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  "))
	if p.Rationale == "" {
		return head
	}
	rationale := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render(indent(textutil.Wrap(p.Rationale, wrapW-2), "  "))
	return lipgloss.JoinVertical(lipgloss.Left, head, rationale)
}

func (t Theme) renderExpertHandoffPart(p gact.Part, wrapW int) string {
	agent := firstNonEmpty(
		stringValue(p.Metadata["agent_id"]),
		stringValue(p.Metadata["expert"]),
		"expert",
	)
	parent := firstNonEmpty(
		stringValue(p.Metadata["parent_id"]),
		stringValue(p.Metadata["parent"]),
	)
	stage := firstNonEmpty(
		stringValue(p.Metadata["stage"]),
		stringValue(p.Metadata["dispatch_target"]),
	)
	status := firstNonEmpty(stringValue(p.Metadata["status"]), "observed")
	failed := expertHandoffFailed(status, p.Metadata)
	routeColor := agentColor(t, agent)
	glyphText := "↳ "
	if failed {
		routeColor = t.Danger
		glyphText = "✗ "
	}
	depth := expertHandoffDepth(parent, agent, p.Metadata)
	prefix := strings.Repeat("  ", depth)
	wrapWForDepth := wrapW - lipgloss.Width(prefix)
	if wrapWForDepth < 20 {
		wrapWForDepth = 20
	}
	glyph := lipgloss.NewStyle().Foreground(routeColor).Bold(true).Render(glyphText)
	headText := renderAgentHandoffNarrative(t, parent, agent, stage, status, failed)
	if selected := stringValue(p.Metadata["selected_agent"]); !failed && strings.Contains(strings.ToLower(stage), "agent.invocation.completed") && selected != "" {
		headText = renderAgentName(t, agent) + " selected " + renderAgentName(t, selected)
	}
	head := prefix + glyph + headText
	var meta []string
	semanticEvent := p.Metadata != nil && p.Metadata["stream_source"] == "semantic_event"
	if failed {
		meta = append(meta, firstNonEmpty(status, "failed"))
	}
	if !semanticEvent {
		if stageLabel := expertHandoffStageLabel(stage); stageLabel != "" &&
			stageLabel != "delegating" && stageLabel != "returned" && stageLabel != "routed" {
			meta = append(meta, stageLabel)
		}
		if label := promotedEvidenceLabel(p); label != "" {
			meta = append(meta, label)
		}
	}
	if len(meta) > 0 {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
	}
	output := expertHandoffOutputSummary(p)
	if output == "" {
		return head
	}
	output = summarizeExpertHandoffOutput(output)
	renderedOutput := renderMarkdownOrWrap(output, t, wrapWForDepth-2)
	if looksLikeMarkdownBlock(output) {
		return lipgloss.JoinVertical(lipgloss.Left, head, indent(renderedOutput, prefix+"  "))
	}
	body := lipgloss.NewStyle().Foreground(t.Fg).
		Render(indent(renderedOutput, prefix+"  "))
	return lipgloss.JoinVertical(lipgloss.Left, head, body)
}
