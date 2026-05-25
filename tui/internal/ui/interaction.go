package ui

import (
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

func (a *App) registerModalTabs(modal string, row int, tabs []menuTab) {
	col := 0
	for _, tab := range tabs {
		w := lipgloss.Width(tab.label) + 4
		a.registerModalContentHit(modal, "tab:"+tab.id, row, col, w, 1, tab.action)
		col += w + 2
	}
}
