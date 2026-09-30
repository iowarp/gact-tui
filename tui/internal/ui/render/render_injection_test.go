package render

import (
	"image/color"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestInjectionLabelNamesKnownSourcesAndHumanizesTheRest(t *testing.T) {
	cases := map[string]string{
		"result_spilled": "Large result saved to a file",
		"earlier_turns":  "Earlier turns",
		"":               "Harness data",
	}
	for source, want := range cases {
		if got := InjectionLabel(source); got != want {
			t.Fatalf("InjectionLabel(%q) = %q, want %q", source, got, want)
		}
	}
}

func TestInjectionRowFitsTheWrapWidth(t *testing.T) {
	p := gact.Part{Type: gact.PartTypeInjection, Source: "memory_search", Text: "x"}
	out := ansi.Strip(InjectionRow(p, 30, color.White, color.White))
	for _, line := range strings.Split(out, "\n") {
		if w := ansi.StringWidth(line); w > 30 {
			t.Fatalf("line wider than the wrap width (%d > 30): %q", w, line)
		}
	}
}
