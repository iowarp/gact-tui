package plugins

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// helper: drop a manifest at dir/<name>/plugin.json with the given
// JSON body. Returns the manifest path so tests can reference it.
func writeManifest(t *testing.T, root, name, body string) string {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	p := filepath.Join(dir, "plugin.json")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	return p
}

func TestLoad_MissingDirReturnsEmpty(t *testing.T) {
	out, err := Load(filepath.Join(t.TempDir(), "nope"))
	if err != nil {
		t.Fatalf("missing dir should be silent, got %v", err)
	}
	if len(out) != 0 {
		t.Errorf("expected 0 plugins, got %d", len(out))
	}
}

func TestLoad_HappyPath(t *testing.T) {
	root := t.TempDir()
	writeManifest(t, root, "git-pr", `{
		"name": "git-pr",
		"version": "0.1",
		"description": "Open PRs from the TUI",
		"commands": [
			{"id": "/pr", "title": "Open PR", "command": "/usr/bin/echo"},
			{"id": "/pr-list", "title": "List PRs", "command": "/usr/bin/echo", "args": ["list"]}
		]
	}`)
	writeManifest(t, root, "another", `{
		"name": "another",
		"commands": [{"id": "/foo", "command": "/bin/true"}]
	}`)

	plugins, err := Load(root)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(plugins) != 2 {
		t.Fatalf("expected 2 plugins, got %d", len(plugins))
	}
	// Sorted by name: "another" then "git-pr".
	if plugins[0].Name != "another" || plugins[1].Name != "git-pr" {
		t.Errorf("unsorted: %q %q", plugins[0].Name, plugins[1].Name)
	}
	if len(plugins[1].Commands) != 2 {
		t.Errorf("git-pr should have 2 commands, got %d", len(plugins[1].Commands))
	}
	if plugins[1].SourceDir == "" {
		t.Errorf("SourceDir should be populated")
	}
}

func TestLoadVerbose_BadManifestReportsError(t *testing.T) {
	root := t.TempDir()
	writeManifest(t, root, "bad-json", `{not valid json`)
	writeManifest(t, root, "no-name", `{"commands":[{"id":"/x","command":"/bin/true"}]}`)
	writeManifest(t, root, "ok", `{"name":"ok","commands":[{"id":"/y","command":"/bin/true"}]}`)

	plugins, errs, err := LoadVerbose(root)
	if err != nil {
		t.Fatalf("LoadVerbose: %v", err)
	}
	if len(plugins) != 1 {
		t.Errorf("expected 1 valid plugin (ok), got %d", len(plugins))
	}
	if len(errs) != 2 {
		t.Errorf("expected 2 per-manifest errors, got %d (%v)", len(errs), errs)
	}
}

func TestLoad_SkipsBadCommandsKeepsGoodOnes(t *testing.T) {
	root := t.TempDir()
	writeManifest(t, root, "mixed", `{
		"name": "mixed",
		"commands": [
			{"id": "no-slash", "command": "/bin/true"},
			{"id": "/no-cmd"},
			{"id": "/good", "command": "/bin/true"}
		]
	}`)
	plugins, errs, err := LoadVerbose(root)
	if err != nil {
		t.Fatalf("LoadVerbose: %v", err)
	}
	if len(plugins) != 1 {
		t.Fatalf("expected 1 plugin, got %d", len(plugins))
	}
	if len(plugins[0].Commands) != 1 || plugins[0].Commands[0].ID != "/good" {
		t.Errorf("expected only /good to survive, got %+v", plugins[0].Commands)
	}
	// Should have flagged both bad commands.
	if len(errs) != 2 {
		t.Errorf("expected 2 per-command errors, got %d", len(errs))
	}
	for _, e := range errs {
		if !strings.Contains(e, "no-slash") && !strings.Contains(e, "/no-cmd") {
			t.Errorf("unexpected error: %q", e)
		}
	}
}
