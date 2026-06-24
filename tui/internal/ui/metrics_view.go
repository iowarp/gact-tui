package ui

// metrics_view.go renders the metrics modal.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// view renders the modal.
func (c *metricsComponent) view() string {
	t := c.app.Theme
	w := c.app.modals.modalWidth()

	buttons := []menuButton{
		{
			id:    "metrics:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				return app.metrics.openLoad()
			},
		},
		closeMenuButton("metrics:close", func(app *App) { app.metrics.open = false }),
	}

	rows := []string{}
	rowHits := []modalRowHit{}
	switch {
	case c.err != nil:
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Danger).Render("Error: "+c.err.Error()))
	case c.loading:
		rows = append(rows, t.HintLabel.Render("loading…"))
	default:
		m := c.data
		rows = appendDetailSection(rows, "Operator snapshot",
			detailField{"sessions", fmt.Sprintf("%d total · %d active", m.Sessions.Total, m.Sessions.Active)},
			detailField{"messages", fmt.Sprintf("%d total", m.Messages.Total)},
			detailField{"tokens", fmt.Sprintf("%d input · %d output", m.Tokens.InputTotal, m.Tokens.OutputTotal)},
			detailField{"cost", fmt.Sprintf("$%.4f", m.Cost.TotalUSD)},
			detailField{"slowest TUI surface", c.slowestTUIInteractionText()},
			detailField{"slowest operation", metricsSlowestRouteText(m.Latencies)},
		)
		rows = appendDetailSection(rows, "Activity",
			detailField{"uptime", fmt.Sprintf("%ds", m.UptimeS)},
			detailField{"sessions", metricsSessionActivityText(m.Sessions)},
			detailField{"messages", metricsMessageActivityText(m.Messages)},
		)

		rows = appendDetailSection(rows, "Token use",
			detailField{"input/output", fmt.Sprintf("%d input · %d output", m.Tokens.InputTotal, m.Tokens.OutputTotal)},
			detailField{"cache", fmt.Sprintf("%d read · %d write", m.Tokens.CacheReadTotal, m.Tokens.CacheWriteTotal)},
		)

		costFields := []detailField{
			{"all providers", fmt.Sprintf("$%.4f", m.Cost.TotalUSD)},
		}
		costSectionStart := len(rows)
		for _, name := range sortedFloatKeys(m.Cost.ByProvider) {
			provider := name
			amount := m.Cost.ByProvider[name]
			rowHits = append(rowHits, modalRowHit{
				id:     "metrics:cost:" + provider,
				start:  metricsFieldRowStart(costSectionStart) + 1 + len(costFields) - 1,
				height: 1,
				action: func(app *App) tea.Cmd {
					app.metrics.openCostDetail(provider, amount)
					return nil
				},
			})
			costFields = append(costFields, detailField{name, fmt.Sprintf("$%.4f", m.Cost.ByProvider[name])})
		}
		rows = appendDetailSection(rows, "Spend by provider", costFields...)

		if summaries := c.tuiInteractionSummaries(0); len(summaries) > 0 {
			sections := tuiInteractionLatencySections(summaries)
			sectionFields := make([]detailField, 0, len(sections))
			sectionStart := len(rows)
			for i, section := range sections {
				st := section
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:tui-section-latency:" + st.Surface,
					start:  metricsFieldRowStart(sectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.metrics.openTUILatencySectionDetail(st)
						return nil
					},
				})
				sectionFields = append(sectionFields, detailField{
					textutil.Truncate(tuiInteractionSectionDisplayTitle(st), 32),
					tuiInteractionSectionOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "TUI latency by section", sectionFields...)

			detailSummaries := summaries
			if len(detailSummaries) > 6 {
				detailSummaries = detailSummaries[:6]
			}
			tuiFields := make([]detailField, 0, len(detailSummaries))
			tuiSectionStart := len(rows)
			for i, summary := range detailSummaries {
				st := summary
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:tui-latency:" + st.Key,
					start:  metricsFieldRowStart(tuiSectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.metrics.openTUILatencyDetail(st)
						return nil
					},
				})
				tuiFields = append(tuiFields, detailField{
					textutil.Truncate(tuiInteractionDisplayTitle(st), 32),
					tuiInteractionOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "TUI interaction details", tuiFields...)
		}

		// Latencies — show top 6 routes by p95 so the modal stays compact.
		// Backends running an older contract might omit this field; render
		// nothing in that case rather than an empty section.
		if len(m.Latencies) > 0 {
			latencyFields := make([]detailField, 0, 6)
			latencySectionStart := len(rows)
			for i, pat := range topLatencyRoutes(m.Latencies, 6) {
				route := pat
				st := m.Latencies[pat]
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:latency:" + route,
					start:  metricsFieldRowStart(latencySectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.metrics.openLatencyDetail(route, st)
						return nil
					},
				})
				latencyFields = append(latencyFields, detailField{
					textutil.Truncate(metricsOperationLabel(pat), 32),
					metricsLatencyOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "Latency watchlist", latencyFields...)
		}
	}

	footerHint := scrollableModalRowDetailFooter("Up/Down scroll  r refresh  Esc close", rowHits)
	content := lipgloss.JoinVertical(lipgloss.Left, rows...)
	pageSize := compactModalBodyRows(content, c.bodyPageSize(), 8)
	hintStyle := t.HintLabel
	rendered := c.app.modals.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Operations Metrics",
			buttons: buttons,
		},
		content:     content,
		pageSize:    pageSize,
		scroll:      c.scrollPos(),
		wheelID:     "metrics",
		footerHint:  footerHint,
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.metrics.scroll = moveScrollOffsetByWheel(app.metrics.scroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.metrics.scroll = scroll
			return nil
		},
	})
	c.scroll = rendered.window.scroll
	c.app.interaction.registerScrollableModalRowHits(rendered.modalFrameRender, rendered.window, rowHits)
	return rendered.modal
}
