package cli

import (
	"flag"
	"reflect"
	"testing"
)

// TestDeriveKnownFlags_ExcludesBoolFlags locks the contract between
// deriveKnownFlags and reorderFlagsFirst: only value-taking flags may be
// in the known map, because reorderFlagsFirst consumes the token after
// every known flag as its value. Bool flags must be excluded so they
// take the pass-through-alone branch, as the hand-maintained known maps
// this helper replaced always did.
func TestDeriveKnownFlags_ExcludesBoolFlags(t *testing.T) {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	fs.String("backend", "", "")
	fs.String("o", "", "")
	fs.Bool("all", false, "")

	known := deriveKnownFlags(fs)
	want := map[string]bool{
		"-backend": true, "--backend": true,
		"-o": true, "--o": true,
	}
	if !reflect.DeepEqual(known, want) {
		t.Fatalf("deriveKnownFlags = %v, want %v", known, want)
	}
}

// TestNewCmdCtx_BoolFlagDoesNotConsumePositional is the regression test
// for the C2a flag-pairing bug: with --all wrongly in the known map,
// `export SID --all -o dir` reordered to [--all -o SID dir] and parsed
// o="SID", args=["dir"] — silently exporting into a directory named
// after the session id with exit 0. The old hand map excluded --all, so
// the correct parse is o="dir", args=["SID"].
func TestNewCmdCtx_BoolFlagDoesNotConsumePositional(t *testing.T) {
	var out string
	var all bool
	cc, rest, code := newCmdCtx("export", []string{"SID", "--all", "-o", "dir"},
		withFlags(func(fs *flag.FlagSet) {
			fs.StringVar(&out, "o", "", "")
			fs.BoolVar(&all, "all", false, "")
		}))
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if cc.client == nil {
		t.Fatalf("client not constructed")
	}
	if out != "dir" {
		t.Errorf("-o = %q, want %q", out, "dir")
	}
	if !all {
		t.Errorf("--all = false, want true")
	}
	if !reflect.DeepEqual(rest, []string{"SID"}) {
		t.Errorf("positionals = %v, want [SID]", rest)
	}
}
