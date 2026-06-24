package ui

// render_part_tool_diff.go renders tool-call and file-diff parts with inline edit diffs.

import (
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (t Theme) renderToolCallPart(p gact.Part, wrapW int) string {
	workflowPrefix := toolPartWorkflowPrefix(p)
	toolWrapW := wrapW - lipgloss.Width(workflowPrefix)
	if toolWrapW < 20 {
		toolWrapW = 20
	}
	summary := toolCallSummary(p)
	toolName := toolDisplayName(p.ToolName)
	headText := toolName + "(" + summary + ")"
	if lipgloss.Width(headText) > toolWrapW {
		keep := toolWrapW - lipgloss.Width(toolName) - 3
		if keep < 4 {
			keep = 4
		}
		headText = toolName + "(" + textutil.Truncate(summary, keep) + "…)"
	}
	head := workflowPrefix + lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
		Render(headText)
	if status := toolCallStatusLabel(p); status != "" {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(status)
	}
	return head
}

func (t Theme) renderFileDiffPart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).
		Render("◇ diff " + p.Path)
	status := ""
	if p.Applied {
		status = lipgloss.NewStyle().Foreground(t.Success).Render(" (applied)")
	} else if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Render(" (rejected)")
	} else {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(" — apply · reject")
	}
	before := ""
	after := ""
	if p.Before != nil {
		before = *p.Before
	}
	if p.After != nil {
		after = *p.After
	}
	body := unifiedDiffView(p.Path, before, after, wrapW-2, t)
	return lipgloss.JoinVertical(lipgloss.Left, head+status, indent(body, "  "))
}

// renderEditDiffInline renders a file_diff part in absorbed mode: no separate
// diff header, with the body visually continuing under the tool call above it.
func (t Theme) renderEditDiffInline(p gact.Part, width int) string {
	wrapW := width - 2
	if wrapW < 10 {
		wrapW = 10
	}
	before, after := "", ""
	if p.Before != nil {
		before = *p.Before
	}
	if p.After != nil {
		after = *p.After
	}
	body := unifiedDiffView(p.Path, before, after, wrapW-2, t)
	status := ""
	if p.Applied {
		status = lipgloss.NewStyle().Foreground(t.Success).Render(" (applied)")
	} else if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Render(" (rejected)")
	} else {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(" — `a` apply · `r` reject")
	}
	head := lipgloss.NewStyle().Foreground(t.RoleTool).Render("⎿") + status
	return lipgloss.JoinVertical(lipgloss.Left, head, indent(body, "  "))
}
