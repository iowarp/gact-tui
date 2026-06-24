package ui

// render_part_support.go renders supporting parts (agent question, retry, model label, provenance notes).

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func routingDecisionIsInternalCleanup(p gact.Part) bool {
	text := strings.ToLower(strings.Join(strings.Fields(firstNonEmpty(
		p.Rationale,
		stringValue(p.Metadata["route_reason"]),
		stringValue(p.Metadata["summary"]),
	)), " "))
	return strings.Contains(text, "removed retained evidence scaffolding") ||
		strings.Contains(text, "retained evidence scaffolding from final dynamic answer")
}

func (t Theme) renderAgentQuestionPart(p gact.Part, wrapW int) string {
	q := p.Question
	prompt := strings.TrimSpace(p.Text)
	if q != nil && strings.TrimSpace(q.Prompt) != "" {
		prompt = strings.TrimSpace(q.Prompt)
	}
	if prompt == "" {
		prompt = "Agent needs user input before continuing."
	}
	agent := ""
	category := ""
	expected := ""
	allowFreeform := false
	var choices []gact.AgentQuestionChoice
	if q != nil {
		agent = firstNonEmpty(q.AgentID, q.Source)
		category = q.Category
		expected = firstNonEmpty(q.ExpectedAnswerType, q.Kind)
		allowFreeform = q.AllowFreeform
		choices = q.Options
		if len(choices) == 0 {
			choices = q.Choices
		}
	}
	head := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).Render("? agent question")
	meta := make([]string, 0, 3)
	if agent != "" {
		meta = append(meta, agent)
	}
	if category != "" {
		meta = append(meta, category)
	}
	if expected != "" {
		meta = append(meta, expected)
	}
	if q != nil && strings.TrimSpace(q.Status) != "" && q.Status != "pending" {
		meta = append(meta, q.Status)
	}
	if len(meta) > 0 {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
	}
	rows := []string{head, lipgloss.NewStyle().Foreground(t.Fg).Render(indent(textutil.Wrap(prompt, wrapW-2), "  "))}
	if len(choices) > 0 {
		labels := make([]string, 0, len(choices))
		for _, choice := range choices {
			label := strings.TrimSpace(choice.Label)
			if label == "" {
				label = firstNonEmpty(choice.Value, choice.ID)
			}
			if label != "" {
				labels = append(labels, label)
			}
		}
		if len(labels) > 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("  choices: "+textutil.Truncate(strings.Join(labels, ", "), wrapW-11)))
		}
	}
	if allowFreeform {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("  free-form answer allowed"))
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func (t Theme) renderRetryAttemptPart(p gact.Part, wrapW int) string {
	attempt := p.RetryAttempt
	id := ""
	status := ""
	notes := strings.TrimSpace(p.Text)
	warning := ""
	model := ""
	if attempt != nil {
		id = attempt.ID
		status = attempt.Status
		if strings.TrimSpace(attempt.Notes) != "" {
			notes = strings.TrimSpace(attempt.Notes)
		}
		warning = strings.TrimSpace(attempt.Warning)
		if attempt.Model != nil {
			model = modelLabel(*attempt.Model)
		}
		if status == "" && attempt.AttemptMessageID != "" {
			status = "created"
		}
	}
	head := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("↻ retry attempt")
	meta := make([]string, 0, 3)
	if id != "" {
		meta = append(meta, shortID(id))
	}
	if status != "" {
		meta = append(meta, status)
	}
	if model != "" {
		meta = append(meta, model)
	}
	if len(meta) > 0 {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
	}
	rows := []string{head}
	if notes != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(textutil.Wrap(notes, wrapW-2), "  ")))
	}
	if warning != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render(indent(textutil.Wrap(warning, wrapW-2), "  ")))
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func modelLabel(m gact.ModelRef) string {
	if m.ProviderID != "" && m.ModelID != "" {
		return m.ProviderID + "/" + m.ModelID
	}
	if m.ModelID != "" {
		return m.ModelID
	}
	return m.ProviderID
}

func promotedEvidenceLabel(p gact.Part) string {
	if p.Metadata == nil {
		return ""
	}
	switch stringValue(p.Metadata["synthetic_from"]) {
	case "tools_called_metadata":
		return "trace metadata"
	case "expert_handoffs_metadata":
		return "handoff metadata"
	case "compact_summary_text":
		return "compact summary"
	default:
		return ""
	}
}

func withStreamProvenanceNote(t Theme, p gact.Part, rendered string) string {
	if rendered == "" || p.Metadata == nil {
		return rendered
	}
	source, _ := p.Metadata["stream_source"].(string)
	if source != "synthetic_posthoc" {
		return rendered
	}
	reason := ""
	if fallback, ok := p.Metadata["stream_fallback"].(map[string]any); ok {
		reason, _ = fallback["reason"].(string)
	}
	label := "post-hoc text"
	if reason != "" {
		label += ": " + reason
	}
	note := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(label)
	return lipgloss.JoinVertical(lipgloss.Left, note, rendered)
}

func summarizeAssistantInlineText(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if summary := summarizeEmbeddedWorkflowStateText(text); summary != "" && embeddedWorkflowStateDominates(text) {
		return summary
	}
	return shortenKnownPathsPreservingLines(text)
}

func shortenKnownPathsPreservingLines(text string) string {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = shortenKnownPaths(line)
	}
	return strings.Join(lines, "\n")
}
