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

// YYYYYYYYY1: detailModalWidth is a wider variant used by the floating
// file-content detail view. User feedback: "when opening a file, the
// window can overflow, and it is not wide enough for most lines".
// The standard 72-col modal is fine for settings/help/palette (plain
// text + key tables) but cramps source code where 100+ columns is
// common.
//
// Target: 90% of terminal width, capped between 80 (minimum useful)
// and 160 (anything wider and the reader's eyes stop tracking).
// Falls back to modalWidth() on tiny terminals where 80 would exceed
// the screen.
func (a *App) detailModalWidth() int {
	w := a.width * 9 / 10
	if w > 160 {
		w = 160
	}
	if w < 80 {
		return a.modalWidth()
	}
	return w
}
