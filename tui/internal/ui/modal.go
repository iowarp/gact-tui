package ui

import "strings"

type modalWidthKind int

const (
	modalWidthStandard modalWidthKind = iota
	modalWidthWide
)

func (a *App) modalWidthFor(kind modalWidthKind) int {
	w := 96
	minW := 20
	gutter := 8
	if kind == modalWidthWide {
		w = 128
		minW = 84
	}
	if a.width <= 0 {
		return w
	}
	if kind == modalWidthWide {
		wide := a.width * 88 / 100
		if wide < w {
			w = wide
		}
	}
	if w > a.width-gutter {
		w = a.width - gutter
	}
	if w < minW {
		if kind == modalWidthWide {
			return a.modalWidthFor(modalWidthStandard)
		}
		w = minW
	}
	return w
}

// modalWidth is the shared width (in display cells) for floating
// modal overlays. Keeping a single source of truth prevents the
// settings/catalog/detail/provider windows from changing size as the
// selected tab or drill-down content changes.
func (a *App) modalWidth() int {
	return a.modalWidthFor(modalWidthStandard)
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

// detailModalWidth intentionally aliases the shared modal width so
// drill-down panes do not visually jump to a different chrome size.
func (a *App) detailModalWidth() int {
	return a.modalWidth()
}

func (a *App) wideModalWidth() int {
	return a.modalWidth()
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

func (a *App) modalBodyRows(chromeRows int) int {
	rows := a.height - chromeRows
	if rows < 4 {
		return 4
	}
	return rows
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
