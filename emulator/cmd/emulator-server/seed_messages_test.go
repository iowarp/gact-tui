package main

import "testing"

func TestParseSeedMessages(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    []seedMessageStep
		wantErr bool
	}{
		{name: "empty", in: "", want: nil},
		{name: "whitespace only", in: "   ", want: nil},
		{name: "single", in: "ses_a=3", want: []seedMessageStep{{"ses_a", 3}}},
		{
			name: "multi",
			in:   "ses_a=2,ses_b=5",
			want: []seedMessageStep{{"ses_a", 2}, {"ses_b", 5}},
		},
		{
			name: "with spaces",
			in:   " ses_a = 2 , ses_b = 1 ",
			want: []seedMessageStep{{"ses_a", 2}, {"ses_b", 1}},
		},
		{
			name: "empty entry tolerated",
			in:   "ses_a=1,,ses_b=2",
			want: []seedMessageStep{{"ses_a", 1}, {"ses_b", 2}},
		},

		// Error cases — refuse to boot on bad input.
		{name: "no equals", in: "ses_a", wantErr: true},
		{name: "equals at start", in: "=3", wantErr: true},
		{name: "equals at end", in: "ses_a=", wantErr: true},
		{name: "empty session id", in: " =3", wantErr: true},
		{name: "empty count", in: "ses_a= ", wantErr: true},
		{name: "non-numeric count", in: "ses_a=abc", wantErr: true},
		{name: "zero count", in: "ses_a=0", wantErr: true},
		{name: "negative count", in: "ses_a=-3", wantErr: true},
		{name: "partial list invalid", in: "ses_a=3,bad", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSeedMessages(tc.in)
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
