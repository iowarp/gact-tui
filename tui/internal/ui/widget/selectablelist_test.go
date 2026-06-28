package widget

import "testing"

func TestClampAndMoveSelection(t *testing.T) {
	if ClampSelection(-1, 5) != 0 || ClampSelection(9, 5) != 4 || ClampSelection(2, 5) != 2 {
		t.Fatal("ClampSelection bounds")
	}
	if ClampSelection(0, 0) != 0 {
		t.Fatal("ClampSelection empty")
	}
	if MoveSelection(0, 5, -1) != 0 {
		t.Fatal("move up at top clamps")
	}
	if MoveSelection(4, 5, 1) != 4 {
		t.Fatal("move down at end clamps")
	}
	if MoveSelection(2, 5, 1) != 3 || MoveSelection(2, 5, -1) != 1 {
		t.Fatal("move within bounds")
	}
	if MoveSelection(3, 0, 1) != 0 {
		t.Fatal("move in empty list")
	}
}

func TestSelectableListKeys(t *testing.T) {
	var l SelectableList
	if !l.HandleKey(tiKey("down"), 5, 2) || l.Index() != 1 {
		t.Fatalf("down -> %d", l.Index())
	}
	l.HandleKey(tiKey("pgdown"), 5, 2) // 1 + 2 = 3
	if l.Index() != 3 {
		t.Fatalf("pgdown -> %d", l.Index())
	}
	l.HandleKey(tiKey("end"), 5, 2)
	if l.Index() != 4 {
		t.Fatalf("end -> %d", l.Index())
	}
	l.HandleKey(tiKey("up"), 5, 2)
	if l.Index() != 3 {
		t.Fatalf("up -> %d", l.Index())
	}
	l.HandleKey(tiKey("home"), 5, 2)
	if l.Index() != 0 {
		t.Fatalf("home -> %d", l.Index())
	}
	l.HandleKey(tiKey("up"), 5, 2) // clamps at 0
	if l.Index() != 0 {
		t.Fatalf("up at top -> %d", l.Index())
	}
	// Set + Clamp respect the (possibly shrunk) count.
	l.Set(10, 5)
	if l.Index() != 4 {
		t.Fatalf("Set clamp -> %d", l.Index())
	}
	l.Clamp(2)
	if l.Index() != 1 {
		t.Fatalf("Clamp to shrunk list -> %d", l.Index())
	}
	if l.HandleKey(tiKey("enter"), 5, 2) {
		t.Fatal("enter is not a nav key")
	}
}
