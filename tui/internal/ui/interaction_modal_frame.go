package ui

// interaction_modal_frame.go renders the modal frame/surface/header chrome shared by all modals.

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

type modalFrameOptions struct {
	width              int
	title              string
	titleColor         color.Color
	border             color.Color
	background         color.Color
	buttons            []menuButton
	buttonSelected     int
	buttonSelection    bool
	suppressButtonHits bool
	suppressTabHits    bool
	tabs               []menuTab
	tabPadding         int
	tabSpacing         int
	body               string
	footer             string
}

type modalFrameRender struct {
	modal     string
	bodyRow   int
	footerRow int
	buttonCol int
	tabRow    int
}

func (m *modalkit) renderModalSurface(width int, border color.Color, background color.Color, body string) string {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(border).
		Background(background).
		Padding(1, 2).
		Width(width).
		Render(body)
}

func (m *modalkit) renderDefaultModalSurface(width int, body string) string {
	return m.renderModalSurface(width, m.app.Theme.Primary, m.app.Theme.BgSubtle, body)
}

func (m *modalkit) renderModalHeader(title string, innerW int, buttons []menuButton) (string, int) {
	return m.renderModalHeaderWithColor(title, innerW, buttons, m.app.Theme.Primary, -1)
}

func (m *modalkit) renderModalHeaderWithColor(title string, innerW int, buttons []menuButton, titleColor color.Color, selectedButton int) (string, int) {
	if innerW < 1 {
		innerW = 1
	}
	headerBg := m.app.Theme.BgSubtle
	headerStyle := lipgloss.NewStyle().Background(headerBg)
	buttonRow := m.renderModalButtons(buttons, selectedButton)
	buttonW := lipgloss.Width(buttonRow)
	trailingPad := 0
	if buttonW > 0 && innerW > buttonW {
		trailingPad = 1
	}
	buttonCol := innerW - buttonW - trailingPad
	titleBudget := buttonCol - 2
	if titleBudget < 1 {
		titleBudget = innerW
		buttonCol = innerW
		trailingPad = 0
	}
	titleText := textutil.Truncate(title, titleBudget)
	renderedTitle := lipgloss.NewStyle().Bold(true).Foreground(titleColor).Background(headerBg).Render(titleText)
	gap := buttonCol - lipgloss.Width(renderedTitle)
	if gap < 1 {
		gap = 1
	}
	row := lipgloss.JoinHorizontal(lipgloss.Top,
		renderedTitle,
		headerStyle.Render(strings.Repeat(" ", gap)),
		buttonRow,
		headerStyle.Render(strings.Repeat(" ", trailingPad)),
	)
	return row, buttonCol
}

func (m *modalkit) renderModalFrame(opts modalFrameOptions) string {
	return m.renderModalFrameWithLayout(opts).modal
}

func (m *modalkit) renderModalFrameWithLayout(opts modalFrameOptions) modalFrameRender {
	w := opts.width
	if w < 12 {
		w = 12
	}
	innerW := modalBodyContentWidth(w)
	titleColor := m.app.Theme.Primary
	if opts.titleColor != nil {
		titleColor = opts.titleColor
	}
	buttonSelected := -1
	if opts.buttonSelection {
		buttonSelected = opts.buttonSelected
	}
	titleRow, buttonCol := m.renderModalHeaderWithColor(opts.title, innerW, opts.buttons, titleColor, buttonSelected)
	rows := []string{titleRow}
	tabRow := -1
	bodyRow := -1
	footerRow := -1
	if len(opts.tabs) > 0 {
		rows = append(rows, "")
		tabRow = len(rows)
		padding := opts.tabPadding
		spacing := opts.tabSpacing
		rows = append(rows, m.renderModalTabsWithLayout(opts.tabs, padding, spacing))
	}
	if opts.body != "" {
		rows = append(rows, "", opts.body)
		bodyRow = len(rows) - 1
	}
	if opts.footer != "" {
		rows = append(rows, "", opts.footer)
		footerRow = len(rows) - 1
	}

	border := m.app.Theme.Primary
	if opts.border != nil {
		border = opts.border
	}
	background := m.app.Theme.BgSubtle
	if opts.background != nil {
		background = opts.background
	}
	modal := m.renderModalSurface(w, border, background, lipgloss.JoinVertical(lipgloss.Left, rows...))
	if !opts.suppressButtonHits {
		m.app.interaction.registerModalButtons(modal, 0, buttonCol, opts.buttons)
	}
	if tabRow >= 0 && !opts.suppressTabHits {
		m.app.interaction.registerModalTabsWithLayout(modal, tabRow, opts.tabs, opts.tabPadding, opts.tabSpacing)
	}
	return modalFrameRender{modal: modal, bodyRow: bodyRow, footerRow: footerRow, buttonCol: buttonCol, tabRow: tabRow}
}

func (m *modalkit) renderModalFrameWithSurfaceLayer(opts modalFrameOptions, surfaceID string) modalFrameRender {
	registerButtons := !opts.suppressButtonHits
	registerTabs := !opts.suppressTabHits
	buttons := opts.buttons
	tabs := opts.tabs
	tabPadding := opts.tabPadding
	tabSpacing := opts.tabSpacing
	opts.suppressButtonHits = true
	opts.suppressTabHits = true
	rendered := m.renderModalFrameWithLayout(opts)
	if surfaceID != "" {
		m.app.interaction.registerModalSurfaceAndBodyWheel(rendered, surfaceID, 0, nil)
	}
	if rendered.tabRow >= 0 && registerTabs {
		m.app.interaction.registerModalTabsWithLayout(rendered.modal, rendered.tabRow, tabs, tabPadding, tabSpacing)
	}
	if registerButtons {
		m.app.interaction.registerModalButtons(rendered.modal, 0, rendered.buttonCol, buttons)
	}
	return rendered
}
