package ui

import (
	"image/color"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type uiHitAction func(*App) tea.Cmd

type uiHitTarget struct {
	id     string
	rect   mouseRect
	action uiHitAction
}

type uiHitRegistry struct {
	targets []uiHitTarget
}

func (r *uiHitRegistry) reset() {
	r.targets = r.targets[:0]
}

func (r *uiHitRegistry) add(target uiHitTarget) {
	if target.rect.w <= 0 || target.rect.h <= 0 || target.action == nil {
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
	target, ok := a.hits.at(x, y)
	if !ok {
		return nil, false
	}
	return target.action(a), true
}

func (a *App) registerScreenHit(id string, rect mouseRect, action uiHitAction) {
	if a.hits == nil {
		return
	}
	a.hits.add(uiHitTarget{id: id, rect: rect, action: action})
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
	if innerW < 1 {
		innerW = 1
	}
	buttonRow := a.renderModalButtons(buttons, 0)
	buttonW := lipgloss.Width(buttonRow)
	buttonCol := innerW - buttonW
	titleBudget := buttonCol - 2
	if titleBudget < 1 {
		titleBudget = innerW
		buttonCol = innerW
	}
	titleText := truncate(title, titleBudget)
	renderedTitle := lipgloss.NewStyle().Bold(true).Foreground(a.Theme.Primary).Render(titleText)
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
