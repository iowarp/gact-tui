package cli

import (
	"strings"
	"testing"
)

// TestCLI_Completion checks that each shell mode prints a script
// with at least the canonical "completion" entry, plus assertions
// for the `detached` + `resume` subcommands so future additions
// don't silently drop off the completion list.
func TestCLI_Completion(t *testing.T) {
	bin := buildGact(t)
	for _, shell := range []string{"bash", "zsh", "fish"} {
		stdout, _, code := runGact(t, bin, nil, "completion", shell)
		if code != 0 {
			t.Errorf("completion %s: exit %d", shell, code)
		}
		if !strings.Contains(stdout, "gact") {
			t.Errorf("completion %s: missing 'gact' in script: %q", shell, stdout[:120])
		}
		for _, subcmd := range []string{"detached", "resume", "dashboard", "log"} {
			if !strings.Contains(stdout, subcmd) {
				t.Errorf("completion %s: missing subcommand %q", shell, subcmd)
			}
		}
	}
	// Unknown shell -> exit 2.
	_, _, code := runGact(t, bin, nil, "completion", "powershell")
	if code != 2 {
		t.Errorf("unknown shell should exit 2, got %d", code)
	}
}

func TestCLI_HelpFlag(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, nil, "--help")
	if code != 0 {
		t.Errorf("exit %d", code)
	}
	if !strings.Contains(stdout, "gact export") {
		t.Errorf("help missing export usage: %s", stdout)
	}
}
