package ui

// render_part_text.go renders text/assistant/thinking parts.

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/presentation"
)

func (t Theme) renderAssistantTextPart(p gact.Part, width int) string {
	body := withStreamProvenanceNote(t, p, renderMarkdownOrWrap(summarizeAssistantInlineText(p.Text), t, width-2))
	if !partMetadataBool(p, "partial_after_error") {
		return body
	}
	note := lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("! partial answer after surfaced error")
	return lipgloss.JoinVertical(lipgloss.Left, note, body)
}

func (t Theme) renderTextPart(p gact.Part, wrapW int) string {
	text := p.Text
	if summary := presentation.SummarizeEmbeddedWorkflowStateText(text); summary != "" && embeddedWorkflowStateDominates(text) {
		text = summary
	}
	return withStreamProvenanceNote(t, p, renderMarkdownOrWrap(text, t, wrapW))
}

func (t Theme) renderThinkingPart(p gact.Part, wrapW int) string {
	if p.Metadata != nil && p.Metadata["semantic_react_step"] == true {
		return t.renderSemanticReactThought(p, wrapW)
	}
	label := "thinking"
	lines := strings.Count(strings.TrimSpace(p.Thinking), "\n") + 1
	if strings.TrimSpace(p.Thinking) == "" {
		lines = 0
	}
	if lines > 0 {
		label = fmt.Sprintf("thinking available · %d line%s", lines, pluralS(lines))
	}
	prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("⎿ " + label + " · ")
	keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	return prefix + keyStyle.Render("Ctrl+E")
}

func partMetadataBool(p gact.Part, key string) bool {
	if p.Metadata == nil {
		return false
	}
	v, ok := p.Metadata[key].(bool)
	return ok && v
}
