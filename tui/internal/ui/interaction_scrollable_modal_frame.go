package ui

// interaction_scrollable_modal_frame.go renders the scrollable modal frame and registers its rail/row hits.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type scrollableModalFrameOptions struct {
	frame       modalFrameOptions
	content     string
	pageSize    int
	scroll      int
	wheelID     string
	wheelAction uiWheelAction
	scrollTo    func(*App, int) tea.Cmd
	footerHint  string
	footerStyle *lipgloss.Style
}

type scrollableModalFrameRender struct {
	modalFrameRender
	window scrollWindow
}

func (m *modalkit) renderScrollableModalFrame(opts scrollableModalFrameOptions) scrollableModalFrameRender {
	windowed := windowModalBody(opts.content, opts.pageSize, opts.scroll)
	frame := opts.frame
	registerButtons := !frame.suppressButtonHits
	registerTabs := !frame.suppressTabHits
	buttons := frame.buttons
	tabs := frame.tabs
	tabPadding := frame.tabPadding
	tabSpacing := frame.tabSpacing
	frame.suppressButtonHits = true
	frame.suppressTabHits = true
	frame.body = m.renderScrollableModalBody(windowed.body, opts.pageSize, frame.width, windowed.window)
	if opts.footerHint != "" {
		footer := modalRangeHint(windowed.window, opts.footerHint)
		if opts.footerStyle != nil {
			footer = opts.footerStyle.Render(footer)
		}
		frame.footer = footer
	}
	rendered := m.renderModalFrameWithLayout(frame)
	if opts.wheelID != "" {
		bodyRows := maxInt(1, strings.Count(windowed.body, "\n")+1)
		m.app.interaction.registerModalSurfaceAndBodyWheel(rendered, opts.wheelID, bodyRows, opts.wheelAction)
		if opts.scrollTo != nil {
			m.app.interaction.registerScrollableModalRailHits(rendered, opts.wheelID, windowed.window, bodyRows, opts.scrollTo)
		}
	}
	if rendered.tabRow >= 0 && registerTabs {
		m.app.interaction.registerModalTabsWithLayout(rendered.modal, rendered.tabRow, tabs, tabPadding, tabSpacing)
	}
	if registerButtons {
		m.app.interaction.registerModalButtons(rendered.modal, 0, rendered.buttonCol, buttons)
	}
	return scrollableModalFrameRender{modalFrameRender: rendered, window: windowed.window}
}

func (c *interactionComponent) registerScrollableModalRailHits(rendered modalFrameRender, id string, win scrollWindow, bodyRows int, scrollTo func(*App, int) tea.Cmd) {
	if id == "" || scrollTo == nil || bodyRows <= 0 || rendered.bodyRow < 0 || win.total <= bodyRows || rendered.modal == "" {
		return
	}
	modalWidth := lipgloss.Width(rendered.modal)
	contentW := modalScrollableContentWidth(modalWidth)
	if modalWidth < 16 || contentW < 4 {
		return
	}
	maxScroll := win.total - maxInt(1, win.end-win.start)
	if maxScroll <= 0 {
		return
	}
	railCol := contentW + 1
	for row := 0; row < bodyRows; row++ {
		row := row
		targetScroll := row * maxScroll / maxInt(1, bodyRows-1)
		c.registerModalContentHit(rendered.modal, id+":rail:"+itoa2(row), rendered.bodyRow+row, railCol, 1, 1, func(app *App) tea.Cmd {
			return scrollTo(app, targetScroll)
		})
	}
}

func (c *interactionComponent) registerScrollableModalRowHits(rendered modalFrameRender, win scrollWindow, hits []modalRowHit) {
	if c.hits == nil || rendered.modal == "" || rendered.bodyRow < 0 || len(hits) == 0 {
		return
	}
	bodyWidth := modalScrollableBodyWidth(lipgloss.Width(rendered.modal))
	for _, hit := range hits {
		hit := hit
		if hit.action == nil || hit.height <= 0 {
			continue
		}
		start := maxInt(hit.start, win.start)
		end := minInt(hit.start+hit.height, win.end)
		if end <= start {
			continue
		}
		c.registerModalContentHit(rendered.modal, hit.id, rendered.bodyRow+(start-win.start), 0, bodyWidth, end-start, hit.action)
	}
}

func scrollableModalRowDetailFooter(base string, hits []modalRowHit) string {
	if len(hits) == 0 {
		return base
	}
	const detailHint = "Enter/click details"
	if strings.Contains(base, detailHint) {
		return base
	}
	if strings.TrimSpace(base) == "" {
		return detailHint
	}
	for _, marker := range []string{"  r ", "  Esc "} {
		if strings.Contains(base, marker) {
			return strings.Replace(base, marker, "  "+detailHint+marker, 1)
		}
	}
	return base + "  " + detailHint
}
