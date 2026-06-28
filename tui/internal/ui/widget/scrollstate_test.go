package widget

import "testing"

func TestScrollStateKeys(t *testing.T) {
	var s ScrollState
	if !s.HandleKey(tiKey("down"), 10) || s.Offset() != 1 {
		t.Fatalf("down -> %d", s.Offset())
	}
	s.HandleKey(tiKey("up"), 10)
	if s.Offset() != 0 {
		t.Fatalf("up -> %d", s.Offset())
	}
	// up at top is a guarded no-op (never negative)
	s.HandleKey(tiKey("up"), 10)
	if s.Offset() != 0 {
		t.Fatalf("up at top must stay 0, got %d", s.Offset())
	}
	s.SetOffset(5)
	s.HandleKey(tiKey("pgup"), 10) // 5 - 10 clamps to 0
	if s.Offset() != 0 {
		t.Fatalf("pgup clamp -> %d", s.Offset())
	}
	s.HandleKey(tiKey("pgdown"), 10)
	if s.Offset() != 10 {
		t.Fatalf("pgdown -> %d", s.Offset())
	}
	s.HandleKey(tiKey("end"), 10)
	if s.Offset() != ScrollToEnd {
		t.Fatalf("end -> %d, want sentinel", s.Offset())
	}
	s.HandleKey(tiKey("home"), 10)
	if s.Offset() != 0 {
		t.Fatalf("home -> %d", s.Offset())
	}
}

func TestScrollStateIgnoresOtherKeys(t *testing.T) {
	var s ScrollState
	s.SetOffset(3)
	if s.HandleKey(tiKey("enter"), 10) {
		t.Fatal("enter should not be a scroll key")
	}
	if s.Offset() != 3 {
		t.Fatalf("enter mutated offset: %d", s.Offset())
	}
}
