package ui

// modalWidth is the shared width (in display cells) for every
// floating modal overlay. Keeping a single source of truth means the
// box width DOESN'T shift between tab content changes (user called
// that out explicitly in feedback L2 — the settings modal gets
// narrower on the "Agent" tab vs the "Model" tab today).
//
// 72 is wide enough for every existing modal's contents without
// wrapping at standard 80-col terminals, while still leaving ≥4
// cells of base content visible on each side (so the floating-window
// illusion is preserved).
//
// The a.width-8 clamp keeps small-terminal layouts from overflowing;
// at a narrow terminal we give up 4 cells of margin and let the modal
// take what's left.
func (a *App) modalWidth() int {
	w := 72
	if w > a.width-8 {
		w = a.width - 8
	}
	if w < 20 {
		w = 20
	}
	return w
}
