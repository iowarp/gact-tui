package widget

import tea "charm.land/bubbletea/v2"

// TextInput is a single-line rune editor: cursor motion (left/right/home/end,
// with ctrl+a/ctrl+e aliases), deletion (backspace/delete), and printable
// insertion. It is a plain value type with no styling — owners render its
// Value/Cursor however they like (e.g. through a cursor-drawing helper).
//
// HandleKey returns false for keys it does not own — enter, esc, tab, and other
// modal-level keys carry a multi-rune String() and no insertable text — so the
// owning overlay handles those itself.
type TextInput struct {
	value  string
	cursor int // rune index, always within [0, len([]rune(value))]
}

// NewTextInput returns a TextInput seeded with value and the cursor at its end.
func NewTextInput(value string) TextInput {
	return TextInput{value: value, cursor: len([]rune(value))}
}

func (t *TextInput) Value() string { return t.value }
func (t *TextInput) Cursor() int   { return t.cursor }
func (t *TextInput) Reset()        { t.value, t.cursor = "", 0 }

func (t *TextInput) SetValue(v string) {
	t.value = v
	t.cursor = clamp(t.cursor, 0, len([]rune(v)))
}

func (t *TextInput) SetCursor(c int) {
	t.cursor = clamp(c, 0, len([]rune(t.value)))
}

// Insert splices text in at the cursor and advances the cursor past it — the
// paste path, equivalent to typing the runes one by one.
func (t *TextInput) Insert(text string) {
	t.value, t.cursor = InsertTextAtCursor(t.value, t.cursor, text)
}

// HandleKey applies one editing keypress and reports whether it consumed the
// key. Control bytes are already filtered upstream by the bubbles/lipgloss key
// events, so a printable insertion is taken from the event Text, falling back
// to a single-rune String() for keys that carry no Text payload.
func (t *TextInput) HandleKey(k tea.KeyPressMsg) bool {
	switch k.String() {
	case "backspace":
		if t.cursor == 0 {
			return true
		}
		runes := []rune(t.value)
		runes = append(runes[:t.cursor-1], runes[t.cursor:]...)
		t.value = string(runes)
		t.cursor--
		return true
	case "delete":
		runes := []rune(t.value)
		if t.cursor >= len(runes) {
			return true
		}
		runes = append(runes[:t.cursor], runes[t.cursor+1:]...)
		t.value = string(runes)
		return true
	case "left":
		if t.cursor > 0 {
			t.cursor--
		}
		return true
	case "right":
		if t.cursor < len([]rune(t.value)) {
			t.cursor++
		}
		return true
	case "home", "ctrl+a":
		t.cursor = 0
		return true
	case "end", "ctrl+e":
		t.cursor = len([]rune(t.value))
		return true
	}
	text := k.Text
	if text == "" {
		if runes := []rune(k.String()); len(runes) == 1 {
			text = string(runes)
		}
	}
	if text != "" {
		t.value, t.cursor = InsertTextAtCursor(t.value, t.cursor, text)
		return true
	}
	return false
}
