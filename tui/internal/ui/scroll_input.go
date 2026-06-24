package ui

// scroll_input.go applies scroll keys (page/line/home/end) to a scroll offset.

import (
	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

// applyScrollKey edits a raw int scroll offset with the shared widget.ScrollState
// rules and returns the new offset plus whether the key was a scroll key. It is
// the bridge for overlays that still hold their scroll offset as a plain int
// field (detail view, doctor, metrics, help); they match their own keys first,
// then delegate the rest here. Once those overlays move onto the modal stack
// they embed a widget.ScrollState directly.
func applyScrollKey(offset, pageSize int, k tea.KeyPressMsg) (int, bool) {
	s := widget.ScrollState{}
	s.SetOffset(offset)
	ok := s.HandleKey(k, pageSize)
	return s.Offset(), ok
}
