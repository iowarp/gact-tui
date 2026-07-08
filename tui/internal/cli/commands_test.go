package cli

import (
	"regexp"
	"strings"
	"testing"
)

// TestCommandTable_NamesUnique guards against two specs claiming the same
// dispatch token (name or alias) — a silent shadowing bug.
func TestCommandTable_NamesUnique(t *testing.T) {
	seen := map[string]string{}
	for i := range commandTable {
		c := &commandTable[i]
		for _, tok := range append([]string{c.Name}, c.Aliases...) {
			if prev, ok := seen[tok]; ok {
				t.Errorf("dispatch token %q claimed by both %q and %q", tok, prev, c.Name)
			}
			seen[tok] = c.Name
		}
	}
}

// TestCommandTable_Reachable confirms every name and alias resolves back to its
// own spec through lookupCommand, and that every spec has a Run handler.
func TestCommandTable_Reachable(t *testing.T) {
	for i := range commandTable {
		c := &commandTable[i]
		if c.Run == nil {
			t.Errorf("command %q has no Run handler", c.Name)
		}
		for _, tok := range append([]string{c.Name}, c.Aliases...) {
			got := lookupCommand(tok)
			if got == nil {
				t.Errorf("token %q not reachable via lookupCommand", tok)
				continue
			}
			if got.Name != c.Name {
				t.Errorf("token %q resolved to %q, want %q", tok, got.Name, c.Name)
			}
		}
	}
	if lookupCommand("definitely-not-a-command") != nil {
		t.Error("lookupCommand matched an unknown token")
	}
}

// usageHeaderCount counts how many command-listing rows in usage begin with
// "  gact <name>" (name followed by a space or end-of-token) — i.e. how many
// times a command heads its own line.
func usageHeaderCount(usage, name string) int {
	re := regexp.MustCompile(`(?m)^  gact ` + regexp.QuoteMeta(name) + `(?: |$)`)
	return len(re.FindAllString(usage, -1))
}

// TestUsage_EveryCommandListedExactlyOnce is the drift lock: each visible
// command appears exactly once in `gact --help`, and hidden commands (the
// --help flag) never appear. This makes the historical duplicate
// `gact list` / `gact send` entries impossible to reintroduce.
func TestUsage_EveryCommandListedExactlyOnce(t *testing.T) {
	usage := renderUsage()
	for i := range commandTable {
		c := &commandTable[i]
		got := usageHeaderCount(usage, c.Name)
		want := 1
		if c.Group == groupHidden {
			want = 0
		}
		if got != want {
			t.Errorf("command %q heads %d usage lines, want %d", c.Name, got, want)
		}
	}
}

// TestManual_CommandsFromTable checks that every command carrying a ManBody
// appears exactly once in both the text and roff manuals, and that a command
// without a ManBody is not rendered — so the man page stays generated from the
// table and cannot drift.
func TestManual_CommandsFromTable(t *testing.T) {
	text := manualText()
	roff := manualRoff()
	// Scope counting to the generated command sections (after the SYNOPSIS,
	// which legitimately repeats several command lines).
	textBody := text[strings.Index(text, "TOP COMMANDS"):]
	roffBody := roff[strings.Index(roff, ".SH TOP COMMANDS"):]
	for i := range commandTable {
		c := &commandTable[i]
		fullHead := "gact " + c.Name
		if c.Argspec != "" {
			fullHead += " " + c.Argspec
		}
		textN := strings.Count(textBody, "\n  "+fullHead+"\n")
		roffN := strings.Count(roffBody, "\n.B "+fullHead+"\n")
		if c.ManBody != "" {
			if textN != 1 {
				t.Errorf("command %q appears %d times in man text sections, want 1", c.Name, textN)
			}
			if roffN != 1 {
				t.Errorf("command %q appears %d times in man roff sections, want 1", c.Name, roffN)
			}
		}
	}
	// Required substrings other surfaces / tests depend on.
	for _, want := range []string{"GACT(1)", "TOP COMMANDS", "COMMON SESSION COMMANDS", "gact deploy <kind> <name>"} {
		if !strings.Contains(text, want) {
			t.Errorf("man text missing %q", want)
		}
	}
	for _, want := range []string{".TH GACT 1", ".SH NAME", ".B gact"} {
		if !strings.Contains(roff, want) {
			t.Errorf("man roff missing %q", want)
		}
	}
}
