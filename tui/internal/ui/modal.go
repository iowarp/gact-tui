package ui

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

// detailModalWidth intentionally aliases the shared modal width so
// drill-down panes do not visually jump to a different chrome size.
func (a *App) detailModalWidth() int {
	return a.modalWidth()
}

func (a *App) wideModalWidth() int {
	return a.modalWidthFor(modalWidthWide)
}
