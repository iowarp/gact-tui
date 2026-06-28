package ui

import "testing"

func TestSelectionAndScrollMovementClamp(t *testing.T) {
	selectionCases := []struct {
		name  string
		sel   int
		count int
		delta int
		want  int
	}{
		{name: "moves down", sel: 1, count: 4, delta: 1, want: 2},
		{name: "clamps first", sel: 0, count: 4, delta: -1, want: 0},
		{name: "clamps last", sel: 3, count: 4, delta: 1, want: 3},
		{name: "keeps empty", sel: 5, count: 0, delta: 1, want: 5},
		{name: "keeps neutral", sel: 2, count: 4, delta: 0, want: 2},
	}
	for _, tc := range selectionCases {
		if got := moveSelection(tc.sel, tc.count, tc.delta); got != tc.want {
			t.Fatalf("%s: moveSelection = %d, want %d", tc.name, got, tc.want)
		}
	}

	if got := moveScrollOffset(0, -1); got != 0 {
		t.Fatalf("moveScrollOffset should clamp at zero, got %d", got)
	}
	if got := moveScrollOffset(4, 1); got != 5 {
		t.Fatalf("moveScrollOffset should increment, got %d", got)
	}
}

func TestSelectedItemWindowKeepsSelectionVisible(t *testing.T) {
	tests := []struct {
		name      string
		total     int
		selected  int
		budget    int
		wantStart int
		wantEnd   int
	}{
		{name: "top", total: 20, selected: 0, budget: 8, wantStart: 0, wantEnd: 8},
		{name: "middle", total: 20, selected: 10, budget: 8, wantStart: 6, wantEnd: 14},
		{name: "bottom", total: 20, selected: 19, budget: 8, wantStart: 12, wantEnd: 20},
		{name: "short", total: 3, selected: 2, budget: 8, wantStart: 0, wantEnd: 3},
		{name: "empty", total: 0, selected: 2, budget: 8, wantStart: 0, wantEnd: 0},
	}
	for _, tc := range tests {
		got := selectedItemWindow(tc.total, tc.selected, tc.budget)
		if got.start != tc.wantStart || got.end != tc.wantEnd {
			t.Fatalf("%s: window = %+v, want start=%d end=%d", tc.name, got, tc.wantStart, tc.wantEnd)
		}
	}
}
