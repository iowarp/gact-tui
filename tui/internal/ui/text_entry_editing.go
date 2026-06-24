package ui

// text_entry_editing.go inserts text at a cursor position in an editable value.

import "github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"

// insertTextAtCursor delegates to the widget package so text insertion has a
// single source of truth. Kept as a thin App-level alias because the paste path
// and several insert* helpers call it directly.
func insertTextAtCursor(value string, cursor int, text string) (string, int) {
	return widget.InsertTextAtCursor(value, cursor, text)
}
