// Package widget provides reusable, App-independent terminal UI interaction
// primitives — small value types that own a piece of input state (a text field,
// a list cursor, a scroll offset) and the keypress logic to drive it.
//
// Widgets carry no styling and no coupling to the App or Theme: the App
// composes them, feeds them key events, and renders their exposed state. This
// keeps shared interaction behavior in one extendable place instead of being
// re-implemented per overlay. Add new primitives here (selectable list, scroll
// state, …) as the UI needs them.
package widget

// clamp constrains v to the inclusive range [lo, hi].
func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// InsertTextAtCursor inserts text at a rune cursor within value and returns the
// updated value and the cursor advanced past the insertion.
func InsertTextAtCursor(value string, cursor int, text string) (string, int) {
	if text == "" {
		return value, clamp(cursor, 0, len([]rune(value)))
	}
	runes := []rune(value)
	cursor = clamp(cursor, 0, len(runes))
	insert := []rune(text)
	out := make([]rune, 0, len(runes)+len(insert))
	out = append(out, runes[:cursor]...)
	out = append(out, insert...)
	out = append(out, runes[cursor:]...)
	return string(out), cursor + len(insert)
}
