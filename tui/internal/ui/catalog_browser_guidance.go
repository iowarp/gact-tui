package ui

// catalog_browser_guidance.go builds the catalog-browser empty-state guidance rows and intro/context lines.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func catalogBrowserUsesGuidanceEmptyState(kind catalogBrowserKind, items []catalogItem) bool {
	switch kind {
	case catalogKindPrompts, catalogKindSkills:
		return catalogBrowserItemsAreEmptyState(items)
	default:
		return false
	}
}

func (c *catalogComponent) renderEmptyGuidanceRows(items []catalogItem, width int) []string {
	if len(items) == 0 {
		return nil
	}
	if width < 1 {
		width = 1
	}
	t := c.app.Theme
	rows := make([]string, 0, len(items)*3)
	for i, item := range items {
		title := strings.TrimSpace(item.title)
		if title == "" {
			continue
		}
		label := title
		if i > 0 {
			label = catalogEmptyGuidanceStepLabel(label)
		}
		line := "  " + lipgloss.NewStyle().Foreground(t.Fg).Bold(true).Render(label)
		if i == 0 {
			if status := catalogStatusTagLabel(item.statusTag); status != "" {
				line += "  " + lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render("["+status+"]")
			}
		}
		rows = append(rows, textutil.Truncate(line, width))
		guidance := valuefmt.CompactCatalogText(valuefmt.FirstNonEmpty(item.inlineDesc, item.desc))
		for _, wrapped := range textutil.WrapPlainRows(guidance, width-4, "") {
			if strings.TrimSpace(wrapped) == "" {
				continue
			}
			rows = append(rows, "    "+t.HintLabel.Italic(true).Render(wrapped))
		}
	}
	return rows
}

func catalogEmptyGuidanceStepLabel(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		return ""
	}
	lower := strings.ToLower(title)
	if strings.HasPrefix(lower, "then ") || strings.HasPrefix(lower, "next ") {
		return title
	}
	return "Next: " + title
}

func catalogBrowserIntro(kind catalogBrowserKind) string {
	switch kind {
	default:
		return ""
	}
}

func (c *catalogComponent) contextLine(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindPrompts, catalogKindSkills:
	default:
		return ""
	}
	workspace := valuefmt.FirstNonEmpty(c.app.chrome.headerWorkspaceLabel(), strings.TrimSpace(c.app.session.wsID), "default workspace")
	session := "no session selected"
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		s := c.app.session.sessions[c.app.session.selected]
		session = valuefmt.FirstNonEmpty(strings.TrimSpace(s.Title), strings.TrimSpace(s.ID), "selected session")
	}
	agent := "backend default agent"
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		meta := valuefmt.MapValue(c.app.session.sessions[c.app.session.selected].Metadata)
		agent = valuefmt.FirstNonEmpty(strings.TrimSpace(valuefmt.StringValue(meta["agent_ref"])), agent)
	}
	return "Context: workspace " + workspace + " · session " + session + " · agent " + agent
}
