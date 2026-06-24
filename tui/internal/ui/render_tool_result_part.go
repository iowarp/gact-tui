package ui

// render_tool_result_part.go renders a tool-result part.

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (t Theme) renderToolResultPart(p gact.Part, wrapW int) string {
	workflowPrefix := toolPartWorkflowPrefix(p)
	toolWrapW := wrapW - lipgloss.Width(workflowPrefix)
	if toolWrapW < 20 {
		toolWrapW = 20
	}
	glyph := "⎿"
	barColor := t.RoleTool
	if barColor == nil {
		barColor = t.Border
	}
	glyphStyle := lipgloss.NewStyle().Foreground(barColor)
	barStyle := lipgloss.NewStyle().Foreground(barColor)
	if p.IsError {
		glyphStyle = glyphStyle.Foreground(t.Danger)
		barStyle = barStyle.Foreground(t.Danger)
	}
	content := p.Content
	rawText := flattenToolResult(p)
	hasRawDetail := p.Metadata != nil && p.Metadata["raw_result"] != nil
	if !p.IsError {
		if summary := summarizeToolResultText(p.ToolName, rawText); summary != "" {
			if strings.TrimSpace(summary) != strings.TrimSpace(rawText) {
				hasRawDetail = true
			}
			content = []gact.Part{{
				Type: gact.PartTypeText,
				Text: summary,
			}}
		}
	}
	var text strings.Builder
	for i, c := range content {
		if i > 0 {
			text.WriteString("\n")
		}
		text.WriteString(t.renderPart(c, toolWrapW-2))
	}
	bodyStyle := lipgloss.NewStyle().Foreground(t.Fg)
	if p.IsError {
		bodyStyle = bodyStyle.Foreground(t.Danger)
	}

	raw := textutil.Wrap(text.String(), toolWrapW-3)
	threshold := t.CollapseThreshold
	if threshold <= 0 {
		threshold = toolResultPreviewLines
	}
	collapsed, hidden := collapseForPreview(raw, threshold)
	rendered := bodyStyle.Render(collapsed)
	errTag := ""
	if p.IsError {
		errTag = lipgloss.NewStyle().Foreground(t.Danger).Italic(true).
			Render(" (error)")
	}
	cont := " " + barStyle.Render("│") + " "
	body := indentWithGlyph(rendered, workflowPrefix+glyphStyle.Render(glyph)+errTag, workflowPrefix+cont)
	if hidden > 0 {
		body = body + "\n" + workflowPrefix + cont + t.renderToolDetailHint(fmt.Sprintf("%d more lines", hidden))
	} else if hasRawDetail {
		body = body + "\n" + workflowPrefix + cont + t.renderToolDetailHint("raw")
	}
	return body
}
