package ui

// interactionComponent: mouse hit-test registration and routing.

import tea "charm.land/bubbletea/v2"

type uiHitAction func(*App) tea.Cmd
type uiWheelAction func(*App, tea.MouseButton) tea.Cmd

type uiHitTarget struct {
	id              string
	rect            mouseRect
	action          uiHitAction
	secondaryAction uiHitAction
	wheelAction     uiWheelAction
}

type uiHitRegistry struct {
	targets []uiHitTarget
}

func (r *uiHitRegistry) reset() {
	r.targets = r.targets[:0]
}

func (r *uiHitRegistry) add(target uiHitTarget) {
	if target.rect.w <= 0 || target.rect.h <= 0 ||
		(target.action == nil && target.secondaryAction == nil && target.wheelAction == nil) {
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

// interactionComponent owns the per-frame hit-target registry — the
// clickable/scrollable zone map that View rebuilds each frame and that the
// mouse Update paths consult. It holds the registry plus the base-overlay split
// marker, and exposes the register*/activate*/lookup behaviour. App embeds it as
// a.interaction; the top-level mouse-event routing in Update stays on App but
// delegates here. The back-reference (app) is wired centrally in
// wireComponents.
type interactionComponent struct {
	app *App

	// hits is rebuilt during View and maps rendered terminal cells back to
	// semantic UI actions. Mouse Update paths consult it first.
	hits *uiHitRegistry

	// baseHitTargetCount records how many targets belonged to the base
	// (non-overlay) frame, so overlay-only activation paths can skip past
	// the base targets.
	baseHitTargetCount int
}

func (c *interactionComponent) beginHitFrame() {
	if c.hits == nil {
		c.hits = &uiHitRegistry{}
	}
	c.hits.reset()
	c.baseHitTargetCount = 0
}

func (c *interactionComponent) activateHitAt(x, y int, button tea.MouseButton) (tea.Cmd, bool) {
	return c.activateHitAtFrom(x, y, button, 0)
}

func (c *interactionComponent) activateOverlayHitAt(x, y int, button tea.MouseButton) (tea.Cmd, bool) {
	return c.activateHitAtFrom(x, y, button, c.baseHitTargetCount)
}

func (c *interactionComponent) activateHitAtFrom(x, y int, button tea.MouseButton, start int) (tea.Cmd, bool) {
	if c.hits == nil {
		return nil, false
	}
	if start < 0 {
		start = 0
	}
	if start > len(c.hits.targets) {
		start = len(c.hits.targets)
	}
	for i := len(c.hits.targets) - 1; i >= 0; i-- {
		if i < start {
			break
		}
		target := c.hits.targets[i]
		if !target.rect.contains(x, y) {
			continue
		}
		switch button {
		case tea.MouseLeft:
			if target.action != nil {
				return target.action(c.app), true
			}
		case tea.MouseRight:
			if target.secondaryAction != nil {
				return target.secondaryAction(c.app), true
			}
		}
	}
	return nil, false
}

func (c *interactionComponent) activateWheelHitAt(x, y int, button tea.MouseButton) (tea.Cmd, bool) {
	return c.activateWheelHitAtFrom(x, y, button, 0)
}

func (c *interactionComponent) activateOverlayWheelHitAt(x, y int, button tea.MouseButton) (tea.Cmd, bool) {
	return c.activateWheelHitAtFrom(x, y, button, c.baseHitTargetCount)
}

func (c *interactionComponent) activateWheelHitAtFrom(x, y int, button tea.MouseButton, start int) (tea.Cmd, bool) {
	if c.hits == nil {
		return nil, false
	}
	if start < 0 {
		start = 0
	}
	if start > len(c.hits.targets) {
		start = len(c.hits.targets)
	}
	for i := len(c.hits.targets) - 1; i >= 0; i-- {
		if i < start {
			break
		}
		target := c.hits.targets[i]
		if target.wheelAction != nil && target.rect.contains(x, y) {
			return target.wheelAction(c.app, button), true
		}
	}
	return nil, false
}

func (c *interactionComponent) registerScreenHit(id string, rect mouseRect, action uiHitAction) {
	if c.hits == nil {
		return
	}
	c.hits.add(uiHitTarget{id: id, rect: rect, action: action})
}

func (c *interactionComponent) registerScreenHitActions(id string, rect mouseRect, action uiHitAction, secondaryAction uiHitAction) {
	if c.hits == nil {
		return
	}
	c.hits.add(uiHitTarget{id: id, rect: rect, action: action, secondaryAction: secondaryAction})
}

func (c *interactionComponent) registerScreenWheelHit(id string, rect mouseRect, action uiWheelAction) {
	if c.hits == nil {
		return
	}
	c.hits.add(uiHitTarget{id: id, rect: rect, wheelAction: action})
}

func (c *interactionComponent) registerModalContentHit(modal, id string, row, col, w, h int, action uiHitAction) {
	rect := overlayMouseRect(modal, c.app.width, c.app.height)
	c.registerScreenHit(id, mouseRect{
		x: rect.x + 3 + col,
		y: rect.y + 2 + row,
		w: w,
		h: h,
	}, action)
}

func (c *interactionComponent) registerModalContentWheelHit(modal, id string, row, col, w, h int, action uiWheelAction) {
	rect := overlayMouseRect(modal, c.app.width, c.app.height)
	c.registerScreenWheelHit(id, mouseRect{
		x: rect.x + 3 + col,
		y: rect.y + 2 + row,
		w: w,
		h: h,
	}, action)
}
