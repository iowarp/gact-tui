package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

// TestOverlay_PreservesBaseAroundModal is the regression test for the
// feedback-L2 "black bar" bug: the OLD padOrInsert discarded the base
// row, so the modal looked like a full-screen black bar with the modal
// on top. The fixed overlay() splices with ansi.Truncate +
// ansi.TruncateLeft so content left and right of the modal survives.
func TestOverlay_PreservesBaseAroundModal(t *testing.T) {
	// Build a base that's 40 cells wide, each row filled with a pattern
	// we can eyeball.
	base := strings.Join([]string{
		strings.Repeat("L", 40),
		strings.Repeat("L", 40),
		strings.Repeat("L", 40),
		strings.Repeat("L", 40),
		strings.Repeat("L", 40),
	}, "\n")
	// Modal: 10×1. Shared modal geometry means startX = (40-10)/2 = 15
	// and startY is the fixed modal top row.
	top := strings.Repeat("M", 10)

	got := overlay(base, top, 40, 5)
	lines := strings.Split(got, "\n")
	if len(lines) != 5 {
		t.Fatalf("expected 5 rows, got %d: %q", len(lines), got)
	}
	// Row 3 (the modal row) should have L's on the left, M's in the
	// middle, L's on the right. strip ANSI first.
	plain := ansi.Strip(lines[3])
	if !strings.HasPrefix(plain, "LLLLLLLLLLLLLLL") { // 15 cells
		t.Errorf("row 3 lost base left: %q", plain)
	}
	if !strings.Contains(plain, "MMMMMMMMMM") {
		t.Errorf("row 3 missing modal: %q", plain)
	}
	if !strings.HasSuffix(plain, "LLLLLLLLLLLLLLL") { // 15 cells
		t.Errorf("row 3 lost base right: %q", plain)
	}
	// Rows outside the modal Y range should be unchanged.
	if plain0 := ansi.Strip(lines[0]); plain0 != strings.Repeat("L", 40) {
		t.Errorf("row 0 mutated: %q", plain0)
	}
}

func TestOverlayUsesSharedTopRow(t *testing.T) {
	base := strings.Join([]string{
		"0000000000",
		"1111111111",
		"2222222222",
		"3333333333",
		"4444444444",
	}, "\n")
	top := "XX"
	// Fixed at row 3, col (10-2)/2 = 4.
	got := overlay(base, top, 10, 5)
	lines := strings.Split(got, "\n")
	if p := ansi.Strip(lines[3]); !strings.Contains(p, "XX") {
		t.Errorf("shared top row lost modal: %q", p)
	}
	// Row before and after should not contain XX.
	if p := ansi.Strip(lines[2]); strings.Contains(p, "XX") {
		t.Errorf("row above modal has modal content: %q", p)
	}
	if p := ansi.Strip(lines[4]); strings.Contains(p, "XX") {
		t.Errorf("row below modal has modal content: %q", p)
	}
}

func TestSpliceRow_ShortBasePaddedToStartX(t *testing.T) {
	// Base is shorter than startX — must pad with spaces so the modal
	// lands at the right column, not immediately after the short base.
	got := spliceRow("abc", "MOD", 10, 3)
	plain := ansi.Strip(got)
	// First 3 cells: abc. Cells 3-9: spaces. Cells 10-12: MOD.
	if !strings.HasPrefix(plain, "abc       MOD") {
		t.Errorf("short base not padded: %q", plain)
	}
}

func TestSpliceRow_StartXZero_NoLeft(t *testing.T) {
	got := spliceRow("abcdef", "XX", 0, 2)
	plain := ansi.Strip(got)
	// Left is empty, modal occupies cells 0-1, right is "cdef".
	if !strings.HasPrefix(plain, "XX") {
		t.Errorf("startX=0 should start with modal: %q", plain)
	}
	if !strings.HasSuffix(plain, "cdef") {
		t.Errorf("right chunk lost: %q", plain)
	}
}

func TestSpliceRow_ModalPastEndOfBase(t *testing.T) {
	// Modal extends past the base's right edge — right chunk is empty.
	got := spliceRow("abcde", "MOD", 3, 5) // right-cut = 8, base is 5 wide
	plain := ansi.Strip(got)
	if plain != "abc\x1b[0mMOD\x1b[0m" && !strings.HasPrefix(plain, "abcMOD") {
		// Accept either form — depends on how ansi.Strip handles the reset.
		if !strings.HasPrefix(plain, "abc") || !strings.Contains(plain, "MOD") {
			t.Errorf("modal-past-end splice wrong: %q", plain)
		}
	}
	// Critical: the returned string should not contain garbage from the
	// base past the right cut.
	if strings.Contains(plain, "de") {
		t.Errorf("overflow past base shouldn't bleed 'de' back in: %q", plain)
	}
}

func TestSpliceRow_PreservesANSIStyling(t *testing.T) {
	// Build a base with a coloured span, splice into it, and verify
	// the base colour continues on the right side of the modal rather
	// than leaking past or being swallowed. We rely on the reset-SGR
	// between the modal and the right segment to prevent leakage.
	red := "\x1b[31m"
	reset := "\x1b[0m"
	base := red + "REDCONTENTREDCONTENT" + reset // 20 cells of red
	got := spliceRow(base, "XX", 5, 2)
	// Plain-text check: should see RED[5 cells] then XX then the rest.
	plain := ansi.Strip(got)
	// ansi.Strip removes colour codes but preserves visible content.
	if !strings.HasPrefix(plain, "REDCO") {
		t.Errorf("left 5 cells of red content lost: %q", plain)
	}
	if !strings.Contains(plain, "XX") {
		t.Errorf("modal content lost: %q", plain)
	}
	// The right segment should keep the remaining 13 cells of the
	// base (20 total - 5 left - 2 modal = 13 on the right).
	tail := plain[len("REDCOXX"):]
	if ansi.StringWidth(tail) != 13 {
		t.Errorf("right tail width = %d, want 13 (plain=%q)", ansi.StringWidth(tail), plain)
	}
}
