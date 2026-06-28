package widget

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func tiKey(s string) tea.KeyPressMsg {
	switch s {
	case "backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}
	case "delete":
		return tea.KeyPressMsg{Code: tea.KeyDelete}
	case "left":
		return tea.KeyPressMsg{Code: tea.KeyLeft}
	case "right":
		return tea.KeyPressMsg{Code: tea.KeyRight}
	case "up":
		return tea.KeyPressMsg{Code: tea.KeyUp}
	case "down":
		return tea.KeyPressMsg{Code: tea.KeyDown}
	case "pgup":
		return tea.KeyPressMsg{Code: tea.KeyPgUp}
	case "pgdown":
		return tea.KeyPressMsg{Code: tea.KeyPgDown}
	case "home":
		return tea.KeyPressMsg{Code: tea.KeyHome}
	case "end":
		return tea.KeyPressMsg{Code: tea.KeyEnd}
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	default: // a printable rune
		return tea.KeyPressMsg{Code: rune(s[0]), Text: s}
	}
}

func TestTextInputEditing(t *testing.T) {
	ti := NewTextInput("")
	if ti.Value() != "" || ti.Cursor() != 0 {
		t.Fatalf("new empty input = %q/%d", ti.Value(), ti.Cursor())
	}
	for _, s := range []string{"a", "b", "c"} {
		if !ti.HandleKey(tiKey(s)) {
			t.Fatalf("printable %q not consumed", s)
		}
	}
	if ti.Value() != "abc" || ti.Cursor() != 3 {
		t.Fatalf("after typing abc: %q/%d", ti.Value(), ti.Cursor())
	}

	ti.HandleKey(tiKey("home"))
	if ti.Cursor() != 0 {
		t.Fatalf("home cursor=%d", ti.Cursor())
	}
	ti.HandleKey(tiKey("right"))
	ti.HandleKey(tiKey("X")) // insert in the middle
	if ti.Value() != "aXbc" || ti.Cursor() != 2 {
		t.Fatalf("mid-insert: %q/%d", ti.Value(), ti.Cursor())
	}
	ti.HandleKey(tiKey("backspace"))
	if ti.Value() != "abc" || ti.Cursor() != 1 {
		t.Fatalf("backspace: %q/%d", ti.Value(), ti.Cursor())
	}
	ti.HandleKey(tiKey("delete")) // removes 'b'
	if ti.Value() != "ac" || ti.Cursor() != 1 {
		t.Fatalf("delete: %q/%d", ti.Value(), ti.Cursor())
	}
	ti.HandleKey(tiKey("end"))
	if ti.Cursor() != 2 {
		t.Fatalf("end cursor=%d", ti.Cursor())
	}
}

func TestTextInputCursorClampsAndNoOps(t *testing.T) {
	ti := NewTextInput("hi")
	ti.HandleKey(tiKey("home"))
	ti.HandleKey(tiKey("left")) // already at 0
	if ti.Cursor() != 0 {
		t.Fatalf("left at col 0 = %d", ti.Cursor())
	}
	ti.HandleKey(tiKey("backspace")) // no-op at 0
	if ti.Value() != "hi" {
		t.Fatalf("backspace at col 0 changed value: %q", ti.Value())
	}
	ti.HandleKey(tiKey("end"))
	ti.HandleKey(tiKey("right")) // already at end
	if ti.Cursor() != 2 {
		t.Fatalf("right at end = %d", ti.Cursor())
	}
	ti.HandleKey(tiKey("delete")) // no-op at end
	if ti.Value() != "hi" {
		t.Fatalf("delete at end changed value: %q", ti.Value())
	}
}

func TestTextInputMultibyte(t *testing.T) {
	ti := NewTextInput("héllo") // 'é' is two bytes, one rune
	if ti.Cursor() != 5 {
		t.Fatalf("cursor should be rune count 5, got %d", ti.Cursor())
	}
	ti.HandleKey(tiKey("home"))
	ti.HandleKey(tiKey("right"))
	ti.HandleKey(tiKey("delete")) // removes 'é', not a stray byte
	if ti.Value() != "hllo" {
		t.Fatalf("multibyte delete: %q", ti.Value())
	}
}

func TestTextInputIgnoresModalKeys(t *testing.T) {
	ti := NewTextInput("abc")
	if ti.HandleKey(tiKey("enter")) {
		t.Fatal("enter should not be consumed by TextInput")
	}
	if ti.Value() != "abc" || ti.Cursor() != 3 {
		t.Fatalf("enter mutated input: %q/%d", ti.Value(), ti.Cursor())
	}
}

func TestInsertTextAtCursor(t *testing.T) {
	v, c := InsertTextAtCursor("abc", 1, "XY")
	if v != "aXYbc" || c != 3 {
		t.Fatalf("insert: %q/%d", v, c)
	}
	v, c = InsertTextAtCursor("abc", 99, "Z") // cursor clamps
	if v != "abcZ" || c != 4 {
		t.Fatalf("clamped insert: %q/%d", v, c)
	}
}
