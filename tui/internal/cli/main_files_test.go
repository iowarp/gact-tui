package cli

import (
	"strings"
	"testing"
)

// TestCLI_FilesList covers workspace file listing in TSV and JSON.
func TestCLI_FilesList(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default")
	if code != 0 {
		t.Fatalf("files list: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in workspace listing: %q", stdout)
	}
	if !strings.HasPrefix(stdout, "file\t") && !strings.HasPrefix(stdout, "dir\t") {
		t.Errorf("expected TSV with type as first column: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--format", "json")
	if code != 0 {
		t.Fatalf("files list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"path"`) || !strings.Contains(stdout, `"main.go"`) {
		t.Errorf("expected JSON entries with main.go: %q", stdout)
	}
}

// TestCLI_FilesListGlob covers --glob filtering for workspace file listings.
func TestCLI_FilesListGlob(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	allOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default")
	if code != 0 {
		t.Fatalf("files list (baseline): exit %d", code)
	}
	allRows := strings.Count(strings.TrimSpace(allOut), "\n") + 1

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "*.go")
	if code != 0 {
		t.Fatalf("files list --glob *.go: exit %d", code)
	}
	if strings.Contains(stdout, "README.md") || strings.Contains(stdout, "go.mod") {
		t.Errorf("non-.go entries leaked through *.go filter: %q", stdout)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in *.go filter: %q", stdout)
	}
	goRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if goRows >= allRows {
		t.Errorf("*.go filter (got %d) should be narrower than baseline (got %d)", goRows, allRows)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "main.go")
	if code != 0 {
		t.Fatalf("files list --glob main.go: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in exact glob: %q", stdout)
	}
	if strings.Contains(stdout, "README.md") || strings.Contains(stdout, "go.mod") {
		t.Errorf("non-main.go entries leaked: %q", stdout)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "[bad"); code != 2 {
		t.Errorf("files list --glob '[bad': want exit 2, got %d", code)
	}
}

// TestCLI_FilesRead covers reading main.go from the seeded workspace.
func TestCLI_FilesRead(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "read", "ws_default", "main.go")
	if code != 0 {
		t.Fatalf("files read: exit %d", code)
	}
	if !strings.Contains(stdout, "package main") {
		t.Errorf("expected file body to contain 'package main': %q", stdout)
	}
}
