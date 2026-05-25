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
