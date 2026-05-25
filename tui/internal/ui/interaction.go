package ui

import (
	"image/color"

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
	id          string
	title       string
	description string
	status      string
	selected    bool
	disabled    bool
	action      uiHitAction
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

func (a *App) registerModalButtons(modal string, row int, startCol int, buttons []menuButton) {
	col := startCol
	for _, button := range buttons {
		w := lipgloss.Width(button.label) + 4
		a.registerModalContentHit(modal, "button:"+button.id, row, col, w, 1, button.action)
		col += w
	}
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
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
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
