package widget

import tea "charm.land/bubbletea/v2"

// ClampSelection constrains a selection index to [0, count-1], returning 0 when
// the list is empty.
func ClampSelection(sel, count int) int {
	if count <= 0 || sel < 0 {
		return 0
	}
	if sel >= count {
		return count - 1
	}
	return sel
}

// MoveSelection moves a selection index by delta within count, clamped to the
// ends (no wrap).
func MoveSelection(sel, count, delta int) int {
	if count <= 0 || delta == 0 {
		return ClampSelection(sel, count)
	}
	return ClampSelection(sel+delta, count)
}

// SelectableList is a single-selection cursor over a list: line movement,
// home/end, and page jumps, all clamped to the ends. It owns only the index —
// the items and rendering stay with the owner, which passes the current count
// on each call because lists are often filtered and the count varies.
type SelectableList struct {
	index int
}

func (l *SelectableList) Index() int       { return l.index }
func (l *SelectableList) Set(i, count int) { l.index = ClampSelection(i, count) }
func (l *SelectableList) Clamp(count int)  { l.index = ClampSelection(l.index, count) }
func (l *SelectableList) Reset()           { l.index = 0 }

// HandleKey applies a list-navigation keypress within count items and reports
// whether it consumed the key. pageSize is the page-jump distance; pass 1 for
// lists that treat pgup/pgdown as single steps.
func (l *SelectableList) HandleKey(k tea.KeyPressMsg, count, pageSize int) bool {
	switch k.String() {
	case "up", "k":
		l.index = MoveSelection(l.index, count, -1)
		return true
	case "down", "j":
		l.index = MoveSelection(l.index, count, 1)
		return true
	case "pgup", "ctrl+u":
		l.index = MoveSelection(l.index, count, -pageSize)
		return true
	case "pgdown", "ctrl+d":
		l.index = MoveSelection(l.index, count, pageSize)
		return true
	case "home", "g":
		l.index = ClampSelection(0, count)
		return true
	case "end", "G":
		l.index = ClampSelection(count-1, count)
		return true
	}
	return false
}
