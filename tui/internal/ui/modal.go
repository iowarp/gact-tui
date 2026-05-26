package ui

// modalWidth is the shared width (in display cells) for floating
// modal overlays. Keeping a single source of truth prevents the
// settings/catalog/detail/provider windows from changing size as the
// selected tab or drill-down content changes.
func (a *App) modalWidth() int {
	w := 96
	if a.width <= 0 {
		return w
	}
	if w > a.width-8 {
		w = a.width - 8
	}
	if w < 20 {
		w = 20
	}
	return w
}

// detailModalWidth intentionally aliases the shared modal width so
// drill-down panes do not visually jump to a different chrome size.
func (a *App) detailModalWidth() int {
	return a.modalWidth()
}
