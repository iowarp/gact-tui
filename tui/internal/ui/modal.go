package ui

// modal.go declares modalkit and the modal width-kind sizing helpers shared by all modals.

import "strings"

// modalkit is the shared modal-rendering scaffold. It holds no state of its
// own: every reusable modal primitive (frame, surface, header, buttons, tabs,
// lists, text-entry, action-menu) and the width/row layout helpers hang off
// this type and render using m.app's Theme/dimensions, registering hit targets
// via m.app. Domain-specific overlay views stay on their own components and
// compose these primitives through a.modals.
type modalkit struct {
	app *App
}

type modalWidthKind int

const (
	modalWidthStandard modalWidthKind = iota
	modalWidthWide
)

func (m *modalkit) modalWidthFor(kind modalWidthKind) int {
	w := 96
	minW := 20
	gutter := 8
	if kind == modalWidthWide {
		w = 128
		minW = 84
	}
	if m.app.width <= 0 {
		return w
	}
	if kind == modalWidthWide {
		wide := m.app.width * 88 / 100
		if wide < w {
			w = wide
		}
	}
	if w > m.app.width-gutter {
		w = m.app.width - gutter
	}
	if w < minW {
		if kind == modalWidthWide {
			return m.modalWidthFor(modalWidthStandard)
		}
		w = minW
	}
	return w
}

// modalWidth is the shared width (in display cells) for floating
// modal overlays. Keeping a single source of truth prevents the
// settings/catalog/detail/provider windows from changing size as the
// selected tab or drill-down content changes.
func (m *modalkit) modalWidth() int {
	return m.modalWidthFor(modalWidthStandard)
}

func modalInnerWidth(width int) int {
	inner := width - 4
	if inner < 1 {
		return 1
	}
	return inner
}

func modalInsetListWidth(width int) int {
	listW := modalInnerWidth(width) - 4
	if listW < 1 {
		return modalInnerWidth(width)
	}
	return listW
}

func modalTextAreaWidth(width int) int {
	return modalInnerWidth(width)
}

func modalBodyContentWidth(width int) int {
	bodyW := width - 6
	if bodyW < 1 {
		return 1
	}
	return bodyW
}

func modalScrollableBodyWidth(width int) int {
	return modalBodyContentWidth(width)
}

func modalScrollableContentWidth(width int) int {
	contentW := modalScrollableBodyWidth(width) - 2
	if contentW < 1 {
		return 1
	}
	return contentW
}

// detailModalWidth intentionally aliases the shared modal width so
// drill-down panes do not visually jump to a different chrome size.
func (m *modalkit) detailModalWidth() int {
	return m.modalWidth()
}

func (m *modalkit) wideModalWidth() int {
	return m.modalWidth()
}

func modalOverlayTop(screenH, modalH int) int {
	top := 3
	if screenH <= 0 {
		return 0
	}
	if modalH >= screenH {
		return 0
	}
	if top+modalH > screenH {
		top = screenH - modalH
	}
	if top < 0 {
		return 0
	}
	return top
}

func (m *modalkit) modalBodyRows(chromeRows int) int {
	rows := m.app.height - chromeRows
	if rows < 4 {
		return 4
	}
	return rows
}

func compactModalBodyRows(body string, maxRows int, minRows int) int {
	if maxRows < 1 {
		maxRows = 1
	}
	if minRows < 1 {
		minRows = 1
	}
	if minRows > maxRows {
		minRows = maxRows
	}
	rows := 1
	if body != "" {
		rows = strings.Count(body, "\n") + 1
	}
	return clampInt(rows, minRows, maxRows)
}

func padModalBody(body string, rows int) string {
	if rows <= 0 {
		return body
	}
	lines := strings.Split(body, "\n")
	for len(lines) < rows {
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n")
}
