package ui

// detailViewModal: the scrollable detail/bulky-part overlay and its key handling.

import tea "charm.land/bubbletea/v2"

// detailViewModal is the floating detail overlay's state: the bulky part being
// shown, the scroll offset, and a wrap-cache scoped to this view. It owns its
// behaviour (the former *App detail-view methods now hang off the struct) and
// holds an app back-reference for shared services, wired in wireComponents().
type detailViewModal struct {
	app     *App
	visible bool
	ref     *bulkyPartRef
	scroll  int
	wrap    detailWrapCache
}

func (m *detailViewModal) reset() { *m = detailViewModal{app: m.app} }

func (m *detailViewModal) close() { m.reset() }

// open shows the modal on ref, resetting scroll and the wrap cache so the
// fresh content re-wraps on the next render. This is the single entry point
// for cross-component openers — they build a *bulkyPartRef and hand it over
// rather than poking visible/ref/scroll/wrap directly.
func (m *detailViewModal) open(ref *bulkyPartRef) {
	m.ref = ref
	m.visible = true
	m.scroll = 0
	m.wrap = detailWrapCache{}
}

func (c *clipboardComponent) copyDetailText() tea.Cmd {
	if c.app.detail.ref == nil {
		c.app.setHint("nothing to copy")
		return nil
	}
	c.app.setHint(copyTextToClipboard("detail", c.app.detail.ref.fullText))
	return nil
}

// handleKey drives the expand-detail modal controls.
func (m *detailViewModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if cmd, ok := m.handlePermissionInspectorKey(k); ok {
		return m.app, cmd
	}
	switch k.String() {
	case "esc", "ctrl+c", "ctrl+e":
		m.close()
		return m.app, nil
	case "y":
		return m.app, m.app.clipboard.copyDetailText()
	case "o":
		return m.app, m.openFileExternally()
	case "u":
		return m.app, m.app.fileViewer.uploadCurrentDetail()
	case "tab", "right", "l":
		if m.cycleFileMode(1) {
			return m.app, nil
		}
	case "shift+tab", "left", "h":
		if m.cycleFileMode(-1) {
			return m.app, nil
		}
	}
	if off, ok := applyScrollKey(m.scroll, m.pageSize(), k); ok {
		m.scroll = off
	}
	return m.app, nil
}

// pageSize reserves chrome, padding, hint, and footer gutter rows.
func (m *detailViewModal) pageSize() int {
	n := m.app.height - 26
	if n < 1 {
		n = 1
	}
	return n
}
