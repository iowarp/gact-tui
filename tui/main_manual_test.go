package main

import (
	"strings"
	"testing"
)

func TestCLI_ManualTextAndRoff(t *testing.T) {
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, nil, "man")
	if code != 0 {
		t.Fatalf("man: exit %d stderr=%q", code, stderr)
	}
	for _, want := range []string{"GACT(1)", "TOP COMMANDS", "gact deploy <kind> <name>"} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("manual text missing %q:\n%s", want, stdout)
		}
	}

	stdout, stderr, code = runGact(t, bin, nil, "man", "--format", "roff")
	if code != 0 {
		t.Fatalf("man --format roff: exit %d stderr=%q", code, stderr)
	}
	for _, want := range []string{".TH GACT 1", ".SH NAME", ".B gact"} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("manual roff missing %q:\n%s", want, stdout)
		}
	}
}

func TestCLI_ManualRejectsUnknownFormat(t *testing.T) {
	bin := buildGact(t)

	_, stderr, code := runGact(t, bin, nil, "man", "--format", "html")
	if code != 2 {
		t.Fatalf("man --format html exit = %d, want 2; stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "unsupported format") {
		t.Fatalf("expected unsupported format error, got %q", stderr)
	}
}
