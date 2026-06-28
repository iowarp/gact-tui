package widget

import tea "charm.land/bubbletea/v2"

// ScrollToEnd is the sentinel offset meaning "last page". It is large enough to
// exceed any real content height; the renderer's clamp (e.g. boundedScrollWindow)
// resolves it to the true maximum at draw time, so callers never need the
// content height at key-press time.
const ScrollToEnd = 1 << 30

// ScrollState is a vertical scroll offset with line/page/home/end key handling.
// The offset is kept >= 0; the upper bound is enforced by the renderer's clamp,
// so End parks at ScrollToEnd. It unifies a half-dozen overlay scroll switches
// (detail view, doctor, metrics, help, …) that each hand-rolled the same
// arithmetic with minor drift (some guarded the top, some did not).
type ScrollState struct {
	offset int
}

func (s *ScrollState) Offset() int { return s.offset }
func (s *ScrollState) Reset()      { s.offset = 0 }

func (s *ScrollState) SetOffset(v int) {
	if v < 0 {
		v = 0
	}
	s.offset = v
}

// HandleKey applies a scroll keypress, using pageSize for page jumps, and
// reports whether it consumed the key. Non-scroll keys return false; an owner
// that also binds e.g. up/down for selection should match those itself before
// delegating here.
func (s *ScrollState) HandleKey(k tea.KeyPressMsg, pageSize int) bool {
	switch k.String() {
	case "up", "k":
		if s.offset > 0 {
			s.offset--
		}
		return true
	case "down", "j":
		s.offset++
		return true
	case "pgup", "ctrl+u":
		s.offset -= pageSize
		if s.offset < 0 {
			s.offset = 0
		}
		return true
	case "pgdown", "ctrl+d":
		s.offset += pageSize
		return true
	case "home", "g":
		s.offset = 0
		return true
	case "end", "G":
		s.offset = ScrollToEnd
		return true
	}
	return false
}
