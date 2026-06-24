package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func ptrFloat(f float64) *float64 { return &f }
func ptrInt(i int) *int           { return &i }

func TestOrderedContextCategoriesStableOrderDropsZeros(t *testing.T) {
	cats := map[string]int{
		"messages":     100,
		"system":       50,
		"tools":        0, // dropped
		"observations": 20,
		"zzz_future":   5, // unknown -> sorts after known
	}
	segs := orderedContextCategories(cats)
	got := make([]string, len(segs))
	for i, s := range segs {
		got[i] = s.Category
	}
	want := []string{"system", "messages", "observations", "zzz_future"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("order = %v, want %v", got, want)
	}
}

func TestRenderContextBarWidthAndColors(t *testing.T) {
	theme := DefaultTheme()
	segs := []contextBarSegment{
		{Category: "system", Tokens: 25},
		{Category: "messages", Tokens: 75},
	}
	bar := renderContextBar(theme, 20, segs, 100, nil)
	// The visible glyph count must equal the requested width.
	plain := ansi.Strip(bar)
	if got := len([]rune(plain)); got != 20 {
		t.Fatalf("bar rune width = %d, want 20\n%q", got, plain)
	}
	// 25% of 20 = 5 cells system, 75% = 15 cells messages, no empty.
	if !strings.Contains(plain, "█") {
		t.Fatalf("bar should contain filled blocks: %q", plain)
	}
}

func TestRenderContextBarTinyBucketStaysVisible(t *testing.T) {
	theme := DefaultTheme()
	// One token out of a huge window would round to 0 cells; must keep ≥1.
	segs := []contextBarSegment{{Category: "summary", Tokens: 1}}
	bar := renderContextBar(theme, 40, segs, 100000, nil)
	plain := ansi.Strip(bar)
	if !strings.Contains(plain, "█") {
		t.Fatalf("tiny bucket should still paint at least one block: %q", plain)
	}
}

func TestRenderContextBarAutocompactMarker(t *testing.T) {
	theme := DefaultTheme()
	segs := []contextBarSegment{{Category: "messages", Tokens: 100}}
	bar := renderContextBar(theme, 20, segs, 100, ptrFloat(0.85))
	plain := ansi.Strip(bar)
	if !strings.Contains(plain, "┃") {
		t.Fatalf("bar should draw the autocompact marker glyph: %q", plain)
	}
	// Marker at 85% of 20 = col 17 (count runes, not bytes — █ is multi-byte).
	col := -1
	for i, r := range []rune(plain) {
		if r == '┃' {
			col = i
			break
		}
	}
	if col != 17 {
		t.Fatalf("marker column = %d, want 17 (%q)", col, plain)
	}
}

func TestContextFullnessPctPrefersUsedPct(t *testing.T) {
	cs := client.ContextState{
		PctUsed: ptrFloat(0.40),
		UsedPct: ptrFloat(0.55),
	}
	pct, ok := contextFullnessPct(cs)
	if !ok || pct != 0.55 {
		t.Fatalf("fullness = %v, ok=%v, want 0.55", pct, ok)
	}
	// Falls back to pct_used when used_pct absent.
	cs.UsedPct = nil
	pct, ok = contextFullnessPct(cs)
	if !ok || pct != 0.40 {
		t.Fatalf("fallback fullness = %v, ok=%v, want 0.40", pct, ok)
	}
	// Neither present -> ok=false.
	cs.PctUsed = nil
	if _, ok := contextFullnessPct(cs); ok {
		t.Fatalf("expected ok=false when no fullness available")
	}
}

func TestContextAbsoluteTokensPrefersUsedTokens(t *testing.T) {
	cs := client.ContextState{LiveTokens: 1000, UsedTokens: ptrInt(1234)}
	if got := contextAbsoluteTokens(cs); got != 1234 {
		t.Fatalf("absolute = %d, want 1234", got)
	}
	cs.UsedTokens = nil
	if got := contextAbsoluteTokens(cs); got != 1000 {
		t.Fatalf("absolute fallback = %d, want 1000", got)
	}
}

func TestContextHeaderText(t *testing.T) {
	cs := client.ContextState{
		WindowTokens: 200000,
		LiveTokens:   50000,
		UsedTokens:   ptrInt(60000),
		UsedPct:      ptrFloat(0.30),
	}
	got := contextHeaderText(cs)
	if !strings.Contains(got, "60K") || !strings.Contains(got, "200K") || !strings.Contains(got, "30%") {
		t.Fatalf("header = %q, want used/window/pct present", got)
	}
}

func TestRenderContextLegendSwatchAndPercent(t *testing.T) {
	theme := DefaultTheme()
	segs := []contextBarSegment{
		{Category: "system", Tokens: 25},
		{Category: "messages", Tokens: 75},
	}
	rows := renderContextLegend(theme, segs, 100)
	if len(rows) != 2 {
		t.Fatalf("legend rows = %d, want 2", len(rows))
	}
	plain := ansi.Strip(rows[0])
	if !strings.Contains(plain, "system") || !strings.Contains(plain, "25%") {
		t.Fatalf("legend row 0 = %q, want name + percent", plain)
	}
	plain1 := ansi.Strip(rows[1])
	if !strings.Contains(plain1, "messages") || !strings.Contains(plain1, "75%") {
		t.Fatalf("legend row 1 = %q, want name + percent", plain1)
	}
}

func TestContextBarDenominatorWindowVsSum(t *testing.T) {
	cs := client.ContextState{WindowTokens: 1000}
	if got := contextBarDenominator(cs, 400); got != 1000 {
		t.Fatalf("denominator = %d, want window 1000", got)
	}
	// Window unknown -> use the sum.
	cs.WindowTokens = 0
	if got := contextBarDenominator(cs, 400); got != 400 {
		t.Fatalf("denominator = %d, want sum 400", got)
	}
}
