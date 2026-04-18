package main

import "testing"

func TestParseSeedWorkspaces(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    []string // each entry is "name|path"
		wantErr bool
	}{
		{name: "empty", in: "", want: nil},
		{name: "whitespace only", in: "   ", want: nil},
		{name: "single", in: "alpha:/repos/a", want: []string{"alpha|/repos/a"}},
		{name: "multi", in: "alpha:/a,beta:/b", want: []string{"alpha|/a", "beta|/b"}},
		{name: "with spaces", in: " alpha : /a , beta : /b ", want: []string{"alpha|/a", "beta|/b"}},
		{name: "empty entry tolerated", in: "alpha:/a,,beta:/b", want: []string{"alpha|/a", "beta|/b"}},

		// Error cases — refuse to boot rather than silently skip.
		{name: "no colon", in: "alpha", wantErr: true},
		{name: "colon at start", in: ":/a", wantErr: true},
		{name: "colon at end", in: "alpha:", wantErr: true},
		{name: "empty name", in: " :/a", wantErr: true},
		{name: "empty path", in: "alpha: ", wantErr: true},
		{name: "valid then invalid fails whole list", in: "alpha:/a,bad", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSeedWorkspaces(tc.in)
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
			for i, entry := range tc.want {
				got[i].Metadata = nil // drop for easier equality
				name, path, _ := splitPipe(entry)
				if got[i].Name != name || got[i].RootPath != path {
					t.Errorf("entry %d = %+v, want %s:%s", i, got[i], name, path)
				}
			}
		})
	}
}

func splitPipe(s string) (string, string, bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '|' {
			return s[:i], s[i+1:], true
		}
	}
	return s, "", false
}
