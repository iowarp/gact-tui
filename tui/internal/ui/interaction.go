package ui

import (
	"fmt"
	"image/color"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type uiHitAction func(*App) tea.Cmd
type uiWheelAction func(*App, tea.MouseButton) tea.Cmd

type uiHitTarget struct {
	id          string
	rect        mouseRect
	action      uiHitAction
	wheelAction uiWheelAction
}

type uiHitRegistry struct {
	targets []uiHitTarget
}

func (r *uiHitRegistry) reset() {
	r.targets = r.targets[:0]
}

func (r *uiHitRegistry) add(target uiHitTarget) {
	if target.rect.w <= 0 || target.rect.h <= 0 || (target.action == nil && target.wheelAction == nil) {
		return
	}
	r.targets = append(r.targets, target)
}

func (r *uiHitRegistry) at(x, y int) (uiHitTarget, bool) {
	for i := len(r.targets) - 1; i >= 0; i-- {
		if r.targets[i].rect.contains(x, y) {
			return r.targets[i], true
		}
	}
	return uiHitTarget{}, false
}

func (a *App) beginHitFrame() {
	if a.hits == nil {
		a.hits = &uiHitRegistry{}
	}
	a.hits.reset()
}

func (a *App) activateHitAt(x, y int) (tea.Cmd, bool) {
	if a.hits == nil {
		return nil, false
	}
	for i := len(a.hits.targets) - 1; i >= 0; i-- {
		target := a.hits.targets[i]
		if target.action != nil && target.rect.contains(x, y) {
			return target.action(a), true
		}
	}
	return nil, false
}

func (a *App) activateWheelHitAt(x, y int, button tea.MouseButton) (tea.Cmd, bool) {
	if a.hits == nil {
		return nil, false
	}
	for i := len(a.hits.targets) - 1; i >= 0; i-- {
		target := a.hits.targets[i]
		if target.wheelAction != nil && target.rect.contains(x, y) {
			return target.wheelAction(a, button), true
		}
	}
	return nil, false
}

func (a *App) registerScreenHit(id string, rect mouseRect, action uiHitAction) {
	if a.hits == nil {
		return
	}
	a.hits.add(uiHitTarget{id: id, rect: rect, action: action})
}

func (a *App) registerScreenWheelHit(id string, rect mouseRect, action uiWheelAction) {
	if a.hits == nil {
		return
	}
	a.hits.add(uiHitTarget{id: id, rect: rect, wheelAction: action})
}

func (a *App) renderModalSurface(width int, border color.Color, background color.Color, body string) string {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(border).
		Background(background).
		Padding(1, 2).
		Width(width).
		Render(body)
}

func (a *App) renderDefaultModalSurface(width int, body string) string {
	return a.renderModalSurface(width, a.Theme.Primary, a.Theme.BgSubtle, body)
}

func (a *App) renderModalHeader(title string, innerW int, buttons []menuButton) (string, int) {
	return a.renderModalHeaderWithColor(title, innerW, buttons, a.Theme.Primary, -1)
}

func (a *App) renderModalHeaderWithColor(title string, innerW int, buttons []menuButton, titleColor color.Color, selectedButton int) (string, int) {
	if innerW < 1 {
		innerW = 1
	}
	buttonRow := a.renderModalButtons(buttons, selectedButton)
	buttonW := lipgloss.Width(buttonRow)
	buttonCol := innerW - buttonW
	titleBudget := buttonCol - 2
	if titleBudget < 1 {
		titleBudget = innerW
		buttonCol = innerW
	}
	titleText := truncate(title, titleBudget)
	renderedTitle := lipgloss.NewStyle().Bold(true).Foreground(titleColor).Render(titleText)
	gap := buttonCol - lipgloss.Width(renderedTitle)
	if gap < 1 {
		gap = 1
	}
	row := lipgloss.JoinHorizontal(lipgloss.Top,
		renderedTitle,
		strings.Repeat(" ", gap),
		buttonRow,
	)
	return row, buttonCol
}

func (a *App) registerModalContentHit(modal, id string, row, col, w, h int, action uiHitAction) {
	rect := overlayMouseRect(modal, a.width, a.height)
	a.registerScreenHit(id, mouseRect{
		x: rect.x + 3 + col,
		y: rect.y + 2 + row,
		w: w,
		h: h,
	}, action)
}

func (a *App) registerModalContentWheelHit(modal, id string, row, col, w, h int, action uiWheelAction) {
	rect := overlayMouseRect(modal, a.width, a.height)
	a.registerScreenWheelHit(id, mouseRect{
		x: rect.x + 3 + col,
		y: rect.y + 2 + row,
		w: w,
		h: h,
	}, action)
}

type menuTab struct {
	id     string
	label  string
	active bool
	action uiHitAction
}

type menuButton struct {
	id     string
	label  string
	action uiHitAction
}

func closeMenuButton(id string, close func(*App)) menuButton {
	return menuButton{
		id:    id,
		label: "close",
		action: func(app *App) tea.Cmd {
			close(app)
			return nil
		},
	}
}

type modalListItem struct {
	id             string
	title          string
	description    string
	status         string
	selected       bool
	selectedMarker string
	disabled       bool
	action         uiHitAction
}

type modalListOptions struct {
	width            int
	rowBudget        int
	descriptionLines int
}

type modalListHit struct {
	id     string
	row    int
	height int
	action uiHitAction
}

type modalCellHit struct {
	id     string
	row    int
	col    int
	width  int
	height int
	action uiHitAction
}

type modalListRender struct {
	rows          []string
	hits          []modalListHit
	renderedItems int
}

type scrollWindow struct {
	start  int
	end    int
	scroll int
	total  int
}

type modalBodyWindow struct {
	body   string
	window scrollWindow
}

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

type scrollableModalFrameOptions struct {
	frame       modalFrameOptions
	content     string
	pageSize    int
	scroll      int
	wheelID     string
	wheelAction uiWheelAction
	footerHint  string
	footerStyle *lipgloss.Style
}

type scrollableModalFrameRender struct {
	modalFrameRender
	window scrollWindow
}

func (a *App) renderModalFrame(opts modalFrameOptions) string {
	return a.renderModalFrameWithLayout(opts).modal
}

func (a *App) renderModalFrameWithLayout(opts modalFrameOptions) modalFrameRender {
	w := opts.width
	if w < 12 {
		w = 12
	}
	innerW := w - 4
	if innerW < 1 {
		innerW = 1
	}
	titleColor := a.Theme.Primary
	if opts.titleColor != nil {
		titleColor = opts.titleColor
	}
	buttonSelected := -1
	if opts.buttonSelection {
		buttonSelected = opts.buttonSelected
	}
	titleRow, buttonCol := a.renderModalHeaderWithColor(opts.title, innerW, opts.buttons, titleColor, buttonSelected)
	rows := []string{titleRow}
	tabRow := -1
	bodyRow := -1
	footerRow := -1
	if len(opts.tabs) > 0 {
		rows = append(rows, "")
		tabRow = len(rows)
		padding := opts.tabPadding
		spacing := opts.tabSpacing
		rows = append(rows, a.renderModalTabsWithLayout(opts.tabs, padding, spacing))
	}
	if opts.body != "" {
		rows = append(rows, "", opts.body)
		bodyRow = len(rows) - 1
	}
	if opts.footer != "" {
		rows = append(rows, "", opts.footer)
		footerRow = len(rows) - 1
	}

	border := a.Theme.Primary
	if opts.border != nil {
		border = opts.border
	}
	background := a.Theme.BgSubtle
	if opts.background != nil {
		background = opts.background
	}
	modal := a.renderModalSurface(w, border, background, lipgloss.JoinVertical(lipgloss.Left, rows...))
	if !opts.suppressButtonHits {
		a.registerModalButtons(modal, 0, buttonCol, opts.buttons)
	}
	if tabRow >= 0 && !opts.suppressTabHits {
		a.registerModalTabsWithLayout(modal, tabRow, opts.tabs, opts.tabPadding, opts.tabSpacing)
	}
	return modalFrameRender{modal: modal, bodyRow: bodyRow, footerRow: footerRow, buttonCol: buttonCol, tabRow: tabRow}
}

func (a *App) renderModalFrameWithSurfaceLayer(opts modalFrameOptions, surfaceID string) modalFrameRender {
	registerButtons := !opts.suppressButtonHits
	registerTabs := !opts.suppressTabHits
	buttons := opts.buttons
	tabs := opts.tabs
	tabPadding := opts.tabPadding
	tabSpacing := opts.tabSpacing
	opts.suppressButtonHits = true
	opts.suppressTabHits = true
	rendered := a.renderModalFrameWithLayout(opts)
	if surfaceID != "" {
		a.registerModalSurfaceAndBodyWheel(rendered, surfaceID, 0, nil)
	}
	if rendered.tabRow >= 0 && registerTabs {
		a.registerModalTabsWithLayout(rendered.modal, rendered.tabRow, tabs, tabPadding, tabSpacing)
	}
	if registerButtons {
		a.registerModalButtons(rendered.modal, 0, rendered.buttonCol, buttons)
	}
	return rendered
}

func (a *App) renderScrollableModalFrame(opts scrollableModalFrameOptions) scrollableModalFrameRender {
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
	frame.body = windowed.body
	if opts.footerHint != "" {
		footer := modalRangeHint(windowed.window, opts.footerHint)
		if opts.footerStyle != nil {
			footer = opts.footerStyle.Render(footer)
		}
		frame.footer = footer
	}
	rendered := a.renderModalFrameWithLayout(frame)
	if opts.wheelID != "" {
		bodyRows := maxInt(1, strings.Count(windowed.body, "\n")+1)
		a.registerModalSurfaceAndBodyWheel(rendered, opts.wheelID, bodyRows, opts.wheelAction)
	}
	if rendered.tabRow >= 0 && registerTabs {
		a.registerModalTabsWithLayout(rendered.modal, rendered.tabRow, tabs, tabPadding, tabSpacing)
	}
	if registerButtons {
		a.registerModalButtons(rendered.modal, 0, rendered.buttonCol, buttons)
	}
	return scrollableModalFrameRender{modalFrameRender: rendered, window: windowed.window}
}

func (a *App) registerModalSurfaceAndBodyWheel(rendered modalFrameRender, id string, bodyRows int, action uiWheelAction) {
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	a.registerScreenHit(id+":surface", rect, func(app *App) tea.Cmd { return nil })
	a.registerScreenWheelHit(id+":surface:wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd { return nil })
	if rendered.bodyRow >= 0 && bodyRows > 0 && action != nil {
		a.registerModalContentWheelHit(rendered.modal, id+":body:wheel", rendered.bodyRow, 0, maxInt(1, rect.w-6), bodyRows, action)
	}
}

func (a *App) registerModalSurfaceWheel(rendered modalFrameRender, id string) {
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	a.registerScreenWheelHit(id+":surface:wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd { return nil })
}

func (a *App) registerModalTabs(modal string, row int, tabs []menuTab) {
	a.registerModalTabsWithLayout(modal, row, tabs, 2, 2)
}

func (a *App) registerModalTabsWithLayout(modal string, row int, tabs []menuTab, horizontalPadding, spacing int) {
	col := 0
	for _, tab := range tabs {
		w := lipgloss.Width(tab.label) + horizontalPadding*2
		a.registerModalContentHit(modal, "tab:"+tab.id, row, col, w, 1, tab.action)
		col += w + spacing
	}
}

func (a *App) renderModalTabsWithLayout(tabs []menuTab, horizontalPadding, spacing int) string {
	cells := make([]string, 0, len(tabs))
	for _, tab := range tabs {
		style := lipgloss.NewStyle().
			Padding(0, horizontalPadding).
			Foreground(a.Theme.FgMuted)
		if tab.active {
			style = lipgloss.NewStyle().
				Padding(0, horizontalPadding).
				Foreground(a.Theme.Bg).
				Background(a.Theme.Primary).
				Bold(true)
		}
		cells = append(cells, style.Render(tab.label))
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(cells, strings.Repeat(" ", spacing)))
}

func (a *App) registerModalButtons(modal string, row int, startCol int, buttons []menuButton) {
	col := startCol
	for _, button := range buttons {
		w := lipgloss.Width(button.label) + 4
		a.registerModalContentHit(modal, "button:"+button.id, row, col, w, 1, button.action)
		col += w
	}
}

func (a *App) appendModalActionRow(rows []string, buttons []menuButton, selected int) ([]string, int) {
	actionRow := len(rows)
	return append(rows, a.renderModalButtons(buttons, selected)), actionRow
}

func (a *App) registerModalActionRow(modal string, row int, buttons []menuButton) {
	a.registerModalButtons(modal, row, 0, buttons)
}

func (a *App) renderModalButtons(buttons []menuButton, selected int) string {
	cells := make([]string, 0, len(buttons))
	for i, button := range buttons {
		style := lipgloss.NewStyle().Foreground(a.Theme.FgMuted).Padding(0, 2)
		if i == selected {
			style = lipgloss.NewStyle().
				Foreground(a.Theme.Bg).
				Background(a.Theme.Secondary).
				Bold(true).
				Padding(0, 2)
		}
		cells = append(cells, style.Render(button.label))
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, cells...)
}

func (a *App) renderModalList(items []modalListItem, opts modalListOptions) modalListRender {
	t := a.Theme
	width := opts.width
	if width < 1 {
		width = 1
	}
	rowBudget := opts.rowBudget
	if rowBudget < 1 {
		rowBudget = len(items) * 2
	}
	descriptionLines := opts.descriptionLines
	if descriptionLines < 0 {
		descriptionLines = 0
	}
	rows := make([]string, 0, rowBudget)
	hits := make([]modalListHit, 0, len(items))
	for _, item := range items {
		if len(rows) >= rowBudget {
			break
		}
		startRow := len(rows)
		marker := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
		if item.disabled {
			titleStyle = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true)
		}
		if item.selected {
			selectedMarker := item.selectedMarker
			if selectedMarker == "" {
				selectedMarker = "▌ "
			}
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render(selectedMarker)
			titleStyle = titleStyle.Foreground(t.Secondary)
		}
		line := marker + titleStyle.Render(item.title)
		if item.disabled {
			line += "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render("(disabled)")
		}
		if item.status != "" {
			statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
			if item.status == "connected" {
				statusStyle = lipgloss.NewStyle().Foreground(t.Success).Bold(true)
			}
			line += "  " + statusStyle.Render("["+item.status+"]")
		}
		row := truncate(line, width)
		if item.selected {
			row = lipgloss.NewStyle().Background(t.Bg).Width(width).Render(row)
		}
		rows = append(rows, row)

		if item.description != "" && descriptionLines > 0 {
			descRows := wrapPlainRows(item.description, width-2, "  ")
			if len(descRows) > descriptionLines {
				descRows = descRows[:descriptionLines]
				last := descRows[len(descRows)-1]
				descRows[len(descRows)-1] = truncate(last+" ...", width-2)
			}
			for _, desc := range descRows {
				if len(rows) >= rowBudget {
					break
				}
				descLine := "  " + t.HintLabel.Italic(true).Render(desc)
				if item.selected {
					descLine = lipgloss.NewStyle().Background(t.Bg).Width(width).Render(descLine)
				}
				rows = append(rows, descLine)
			}
		}
		if item.action != nil {
			hits = append(hits, modalListHit{
				id:     item.id,
				row:    startRow,
				height: len(rows) - startRow,
				action: item.action,
			})
		}
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

func (a *App) registerModalListHits(modal string, rowOffset int, col int, width int, hits []modalListHit) {
	for _, hit := range hits {
		a.registerModalContentHit(modal, hit.id, rowOffset+hit.row, col, width, hit.height, hit.action)
	}
}

func (a *App) registerModalListRegion(modal string, rowOffset int, col int, width int, list modalListRender, wheelID string, wheelAction uiWheelAction) {
	if len(list.rows) > 0 && wheelID != "" && wheelAction != nil {
		a.registerModalContentWheelHit(modal, wheelID, rowOffset, col, width, maxInt(1, len(list.rows)), wheelAction)
	}
	if len(list.hits) > 0 {
		a.registerModalListHits(modal, rowOffset, col, width, list.hits)
	}
}

func (a *App) registerModalWheelRegion(modal string, id string, row int, col int, width int, height int, action uiWheelAction) {
	if id == "" || action == nil || height <= 0 {
		return
	}
	a.registerModalContentWheelHit(modal, id, row, col, width, height, action)
}

func (a *App) registerModalCellHits(modal string, rowOffset int, hits []modalCellHit) {
	for _, hit := range hits {
		height := hit.height
		if height < 1 {
			height = 1
		}
		a.registerModalContentHit(modal, hit.id, rowOffset+hit.row, hit.col, hit.width, height, hit.action)
	}
}

func moveSelection(sel int, count int, delta int) int {
	if count <= 0 || delta == 0 {
		return sel
	}
	sel += delta
	if sel < 0 {
		return 0
	}
	if sel >= count {
		return count - 1
	}
	return sel
}

func moveScrollOffset(scroll int, delta int) int {
	scroll += delta
	if scroll < 0 {
		return 0
	}
	return scroll
}

func selectedItemWindow(total int, selected int, budget int) scrollWindow {
	if total < 0 {
		total = 0
	}
	if budget < 1 {
		budget = 1
	}
	if budget > total {
		budget = total
	}
	if total == 0 {
		return scrollWindow{total: total}
	}
	if selected < 0 {
		selected = 0
	}
	if selected >= total {
		selected = total - 1
	}
	start := selected - budget/2
	if start < 0 {
		start = 0
	}
	if start+budget > total {
		start = total - budget
	}
	return boundedScrollWindow(total, budget, start)
}

func (a *App) modalListItemBudget(fixedRows int, rowsPerItem int, maxItems int) int {
	if rowsPerItem < 1 {
		rowsPerItem = 1
	}
	if maxItems < 1 {
		maxItems = 1
	}
	availableRows := a.height - fixedRows - 6
	if availableRows < rowsPerItem {
		return 1
	}
	budget := availableRows / rowsPerItem
	if budget > maxItems {
		budget = maxItems
	}
	if budget < 1 {
		return 1
	}
	return budget
}

func boundedScrollWindow(total int, budget int, scroll int) scrollWindow {
	if total < 0 {
		total = 0
	}
	if budget < 1 {
		budget = 1
	}
	maxScroll := total - budget
	if maxScroll < 0 {
		maxScroll = 0
	}
	if scroll < 0 {
		scroll = 0
	}
	if scroll > maxScroll {
		scroll = maxScroll
	}
	end := scroll + budget
	if end > total {
		end = total
	}
	if end < scroll {
		end = scroll
	}
	return scrollWindow{start: scroll, end: end, scroll: scroll, total: total}
}

func windowModalBody(body string, budget int, scroll int) modalBodyWindow {
	lines := strings.Split(body, "\n")
	win := boundedScrollWindow(len(lines), budget, scroll)
	return modalBodyWindow{
		body:   strings.Join(lines[win.start:win.end], "\n"),
		window: win,
	}
}

func modalRangeHint(win scrollWindow, hint string) string {
	if win.total > win.end {
		return fmt.Sprintf("%d-%d/%d  %s", win.start+1, win.end, win.total, hint)
	}
	return hint
}
