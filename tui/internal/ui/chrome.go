package ui

// chromeComponent owns the persistent application frame: the header and footer
// rendering, the header/footer mouse hit-test registration, and pane-focus
// navigation. It holds no buffers of its own — every value it paints comes from
// shared App state — so it is a stateless component carrying only a back-
// reference to the root App for those shared services. Wired in wireComponents().
type chromeComponent struct {
	app *App
}

func (c *chromeComponent) openWorkspaceSwitch() {
	c.app.workspace.switchOpen = true
	c.app.workspace.switchSel = 0
	for i, w := range c.app.session.workspaces {
		if w.ID == c.app.session.wsID {
			c.app.workspace.switchSel = i
			break
		}
	}
}

// screenSurfaceRect is the full-screen mouse rectangle, clamped to a minimum
// 1x1 so hit-testing never produces a zero-area region.
func (c *chromeComponent) screenSurfaceRect() mouseRect {
	w := c.app.width
	h := c.app.height
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	return mouseRect{x: 0, y: 0, w: w, h: h}
}

func (c *chromeComponent) focusNextPane() {
	c.focusPane(1)
}

func (c *chromeComponent) focusPane(delta int) {
	order := []FocusZone{FocusSidebar, FocusBody}
	if len(c.app.sidebar.rightModules()) > 0 {
		order = append(order, FocusRightSidebar)
	}
	order = append(order, FocusInput)
	pos := 0
	for i, zone := range order {
		if zone == c.app.focus {
			pos = i
			break
		}
	}
	pos = (pos + delta) % len(order)
	if pos < 0 {
		pos += len(order)
	}
	c.app.focus = order[pos]
	c.app.conversation.maybeInitCursor()
}
