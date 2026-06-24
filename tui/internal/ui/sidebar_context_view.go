package ui

// sidebar_context_view.go renders the sidebar context-file rows and metadata.

import (
	"image/color"
	"strings"
	"time"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *sidebarComponent) renderContextFileRows(cf gact.ContextFile, width int, marker string, selected bool, index int) []string {
	t := c.app.Theme
	contentW := width - 6
	if contentW < 1 {
		contentW = 1
	}
	modeLabel, modeColor := contextModeLabelAndColor(cf.Mode, t)
	suffix := modeLabel
	if cf.Size > 0 {
		suffix += " · " + textutil.HumanBytes(cf.Size)
	}
	suffixStyle := lipgloss.NewStyle().Foreground(modeColor).Italic(true)
	pathStyle := t.HintLabel
	if selected {
		pathStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	suffixW := lipgloss.Width(suffix)
	pathBudget := contentW - lipgloss.Width(marker) - suffixW - 1
	if pathBudget < 6 && cf.Size > 0 {
		suffix = modeLabel
		suffixW = lipgloss.Width(suffix)
		pathBudget = contentW - lipgloss.Width(marker) - suffixW - 1
	}
	if pathBudget < 4 {
		pathBudget = 4
	}
	line := marker + pathStyle.Render(textutil.Truncate(cf.Path, pathBudget)) + " " + suffixStyle.Render(suffix)
	rows := []string{textutil.Truncate(line, contentW)}
	if c.contextFileRowCount(index) < 2 {
		return rows
	}
	meta := c.contextFileMeta(cf)
	if meta == "" {
		return rows
	}
	metaIndent := strings.Repeat(" ", maxInt(1, lipgloss.Width(marker)))
	metaBudget := contentW - lipgloss.Width(metaIndent)
	if metaBudget < 4 {
		metaBudget = 4
	}
	rows = append(rows, metaIndent+t.HintLabel.Italic(true).Render(textutil.Truncate(meta, metaBudget)))
	return rows
}

func (c *sidebarComponent) contextFileMeta(cf gact.ContextFile) string {
	parts := make([]string, 0, 4)
	if lang := strings.TrimSpace(cf.Language); lang != "" {
		parts = append(parts, lang)
	}
	if cf.Uploaded {
		parts = append(parts, "source: attachment")
	}
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		title := strings.TrimSpace(c.app.session.sessions[c.app.session.selected].Title)
		if title == "" {
			title = c.app.session.sessions[c.app.session.selected].ID
		}
		if title != "" {
			parts = append(parts, title)
		}
	}
	if modified := compactContextTimestamp(cf.LastModified); modified != "" {
		parts = append(parts, modified)
	} else if added := compactContextTimestamp(cf.AddedAt); added != "" {
		parts = append(parts, added)
	}
	return strings.Join(parts, " · ")
}

func compactContextTimestamp(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return raw
	}
	return t.UTC().Format("Jan 2 15:04")
}

func contextModeLabelAndColor(mode string, t Theme) (string, color.Color) {
	switch mode {
	case "edit":
		return "edit", t.Warning
	case "read":
		return "read", t.RoleUser
	case "pin":
		return "pin", t.Secondary
	case "":
		return "unknown", t.FgMuted
	default:
		return mode, t.FgMuted
	}
}
