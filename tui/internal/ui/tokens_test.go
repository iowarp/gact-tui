package ui

import "testing"

func TestHumanTokens(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{0, "0"},
		{1, "1"},
		{942, "942"},
		{999, "999"},
		{1000, "1.0K"},
		{1500, "1.5K"},
		{9999, "10.0K"}, // rounding edge: 9999/1000 = 9.999 → "10.0K"
		{10000, "10K"},  // past the 10× threshold, drop the decimal
		{15000, "15K"},
		{99500, "99K"}, // integer division floors
		{100000, "100K"},
		{150000, "150K"},
		{999999, "999K"},
		{1000000, "1.0M"},
		{1500000, "1.5M"},
		{10000000, "10M"},
	}
	for _, tc := range cases {
		if got := humanTokens(tc.in); got != tc.want {
			t.Errorf("humanTokens(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
