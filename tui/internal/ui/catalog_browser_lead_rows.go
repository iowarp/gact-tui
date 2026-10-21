package ui

// catalog_browser_lead_rows.go builds the leading (header/context) rows rendered above the catalog list.

import (
	"strings"

	"charm.land/lipgloss/v2"
)

type catalogBrowserLeadRows struct {
	rows          []string
	actionRow     int
	actionCol     int
	actionButtons []menuButton
}

func (c *catalogComponent) leadRows(listW int) catalogBrowserLeadRows {
	t := c.app.Theme
	out := catalogBrowserLeadRows{
		rows:      make([]string, 0, catalogBrowserBodyRows),
		actionRow: -1,
	}
	if c.current.loading && len(c.current.items) == 0 {
		out.rows = append(out.rows, t.HintLabel.Italic(true).Render("loading…"))
	}
	if c.current.errText != "" {
		out.rows = append(out.rows, lipgloss.NewStyle().Foreground(t.Danger).
			Render("error: "+c.current.errText))
	}
	if intro := catalogBrowserIntro(c.current.kind); intro != "" {
		out.rows = append(out.rows, t.HintLabel.Render(intro), "")
	}
	if context := c.contextLine(c.current.kind); context != "" {
		out.rows = append(out.rows, t.HintLabel.Render(context), "")
	}
	if status := strings.TrimSpace(c.app.transientHint); status != "" {
		out.rows = append(out.rows, t.HintLabel.Render("Status: "+status), "")
	}
	renderActionButtons := func(buttons []menuButton) string {
		row, col := c.app.modals.renderCenteredModalButtons(listW, buttons, -1)
		out.actionCol = col
		return row
	}
	switch c.current.kind {
	case catalogKindAgents:
		out.rows = append(out.rows, t.HintLabel.Render("Expert hierarchy"))
	case catalogKindMcpDetail:
		out.rows = append(out.rows, t.HintLabel.Render("Connection capabilities"))
	case catalogKindPromptDetail:
		out.actionButtons = c.app.catalog.promptDetailActionButtons()
		out.actionRow = len(out.rows) + 1
		out.rows = append(out.rows,
			t.HintLabel.Render("Management"),
			renderActionButtons(out.actionButtons),
			"",
			t.HintLabel.Render("Prompt and profiles"),
		)
	}
	return out
}
