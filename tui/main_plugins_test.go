package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCLI_Plugins covers MMM8: drop a manifest into a temp plugins
// dir, list it, verify the rendered output and JSON shape.
func TestCLI_Plugins(t *testing.T) {
	bin := buildGact(t) // doesn't talk to a backend

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "git-pr"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	manifest := `{
		"name": "git-pr",
		"version": "0.1",
		"description": "Open PRs from the shell",
		"commands": [
			{"id": "/pr", "title": "Open PR", "command": "/bin/true"}
		]
	}`
	if err := os.WriteFile(filepath.Join(dir, "git-pr", "plugin.json"),
		[]byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	stdout, _, code := runGact(t, bin, nil, "plugins", "list", "--dir", dir)
	if code != 0 {
		t.Fatalf("plugins list: exit %d", code)
	}
	for _, want := range []string{"git-pr", "0.1", "/pr", "Open PR"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in text output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, nil, "plugins", "list", "--dir", dir, "--format", "json")
	if code != 0 {
		t.Fatalf("plugins list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"name": "git-pr"`) ||
		!strings.Contains(stdout, `"id": "/pr"`) {
		t.Errorf("expected JSON with name+id: %q", stdout)
	}

	// `plugins dir` prints the resolved root.
	stdout, _, code = runGact(t, bin, nil, "plugins", "dir", "--dir", dir)
	if code != 0 || strings.TrimSpace(stdout) != dir {
		t.Errorf("plugins dir: code=%d out=%q want %q", code, strings.TrimSpace(stdout), dir)
	}
}
