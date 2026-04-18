package main

import "testing"

func TestParseSeedSessions(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    []seedSessionStep
		wantErr bool
	}{
		{name: "empty", in: "", want: nil},
		{name: "whitespace only", in: "   ", want: nil},
		{name: "single", in: "ws_a=3", want: []seedSessionStep{{"ws_a", 3}}},
		{
			name: "multi",
			in:   "ws_a=2,ws_b=1",
			want: []seedSessionStep{{"ws_a", 2}, {"ws_b", 1}},
		},
		{
			name: "with spaces",
			in:   " ws_a = 5 , ws_b = 2 ",
			want: []seedSessionStep{{"ws_a", 5}, {"ws_b", 2}},
		},
		{
			name: "empty entry tolerated",
			in:   "ws_a=1,,ws_b=2",
			want: []seedSessionStep{{"ws_a", 1}, {"ws_b", 2}},
		},

		// Error cases — refuse to boot on bad input.
		{name: "no equals", in: "ws_a", wantErr: true},
		{name: "equals at start", in: "=3", wantErr: true},
		{name: "equals at end", in: "ws_a=", wantErr: true},
		{name: "empty ws id", in: " =3", wantErr: true},
		{name: "empty count", in: "ws_a= ", wantErr: true},
		{name: "non-numeric count", in: "ws_a=abc", wantErr: true},
		{name: "zero count", in: "ws_a=0", wantErr: true},
		{name: "negative count", in: "ws_a=-3", wantErr: true},
		{name: "partial list invalid", in: "ws_a=3,bad", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSeedSessions(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q; got %+v", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d (%+v)", len(got), len(tc.want), got)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("[%d] = %+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
}
