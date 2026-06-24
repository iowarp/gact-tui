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
	case catalogKindAgentDetail:
		out.actionButtons = c.app.agent.agentDetailActionButtons()
		if len(out.actionButtons) > 0 {
			out.actionRow = len(out.rows) + 1
			out.rows = append(out.rows,
				t.HintLabel.Render("Expert actions"),
				renderActionButtons(out.actionButtons),
				"",
				t.HintLabel.Render("Expert structure"),
			)
		}
	case catalogKindAgentBlueprints:
		out.rows = append(out.rows, t.HintLabel.Render("Blueprint library"))
	case catalogKindAgentBlueprintDetail:
		out.actionButtons = c.app.agent.agentBlueprintDetailActionButtons()
		if len(out.actionButtons) > 0 {
			out.actionRow = len(out.rows) + 1
			out.rows = append(out.rows,
				t.HintLabel.Render("Blueprint actions"),
				renderActionButtons(out.actionButtons),
			)
		}
		if status := activeAgentBlueprintDetailStatus(c.current.items); status != "" {
			out.rows = append(out.rows,
				t.HintLabel.Render("Blueprint status: ")+status,
			)
		}
		out.rows = append(out.rows,
			"",
			t.HintLabel.Render("Workflow"),
		)
	case catalogKindAgentBlueprintSources:
		out.actionButtons = c.app.agent.agentBlueprintSourceActionButtons()
		if len(out.actionButtons) > 0 {
			out.actionRow = len(out.rows) + 1
			out.rows = append(out.rows,
				t.HintLabel.Render(agentBlueprintSourceActionSectionTitle(c.current)),
				renderActionButtons(out.actionButtons),
				"",
				t.HintLabel.Render("Sources"),
			)
		}
	case catalogKindPromptDetail:
		out.actionButtons = c.app.catalog.promptDetailActionButtons()
		out.actionRow = len(out.rows) + 1
		out.rows = append(out.rows,
			t.HintLabel.Render("Management"),
			renderActionButtons(out.actionButtons),
			"",
			t.HintLabel.Render("Prompt and profiles"),
		)
	case catalogKindExpertPackDetail:
		out.actionButtons = c.app.catalog.expertPackDetailActionButtons()
		if len(out.actionButtons) > 0 {
			out.actionRow = len(out.rows) + 1
			out.rows = append(out.rows,
				t.HintLabel.Render("Pack actions"),
				renderActionButtons(out.actionButtons),
				"",
				t.HintLabel.Render("Workflow"),
			)
		}
	}
	return out
}
