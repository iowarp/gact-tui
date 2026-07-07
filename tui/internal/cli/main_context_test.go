package cli

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestCLI_ContextListFilters covers --mode and --glob filters on
// `gact context list`.
func TestCLI_ContextListFilters(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "context-filters-target")
	for _, item := range []struct{ path, mode string }{
		{"/tmp/alpha.go", "read"},
		{"/tmp/bravo.md", "pin"},
		{"/tmp/charlie.go", "edit"},
	} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, item.path, "--mode", item.mode); code != 0 {
			t.Fatalf("context add %s: exit %d", item.path, code)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "pin")
	if code != 0 {
		t.Fatalf("--mode pin: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/bravo.md") || strings.Contains(stdout, "/tmp/alpha.go") || strings.Contains(stdout, "/tmp/charlie.go") {
		t.Errorf("--mode pin filtering wrong: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--glob", "*.go")
	if code != 0 {
		t.Fatalf("--glob *.go: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/alpha.go") || !strings.Contains(stdout, "/tmp/charlie.go") {
		t.Errorf("expected both .go files in --glob: %q", stdout)
	}
	if strings.Contains(stdout, "/tmp/bravo.md") {
		t.Errorf("bravo.md should be filtered out: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "edit", "--glob", "*.go")
	if code != 0 {
		t.Fatalf("combined: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/charlie.go") || strings.Contains(stdout, "/tmp/alpha.go") || strings.Contains(stdout, "/tmp/bravo.md") {
		t.Errorf("combined filter wrong: %q", stdout)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "nope"); code != 2 {
		t.Errorf("--mode nope: want exit 2, got %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--glob", "[bad"); code != 2 {
		t.Errorf("--glob [bad: want exit 2, got %d", code)
	}
}

func TestCLI_ContextListJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "context-json-target")
	for _, item := range []struct{ path, mode string }{
		{"/tmp/alpha.go", "read"},
		{"/tmp/bravo.md", "pin"},
	} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, item.path, "--mode", item.mode); code != 0 {
			t.Fatalf("context add %s: exit %d", item.path, code)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--format", "json")
	if code != 0 {
		t.Fatalf("context list --format json: exit %d", code)
	}
	var files []struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
	}
	if err := json.Unmarshal([]byte(stdout), &files); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d: %+v", len(files), files)
	}
	got := map[string]string{files[0].Path: files[0].Mode, files[1].Path: files[1].Mode}
	if got["/tmp/alpha.go"] != "read" || got["/tmp/bravo.md"] != "pin" {
		t.Errorf("unexpected files: %+v", got)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if code != 0 {
		t.Fatalf("context list (default): exit %d", code)
	}
	if !strings.Contains(stdout, "read\t/tmp/alpha.go") ||
		!strings.Contains(stdout, "pin\t/tmp/bravo.md") {
		t.Errorf("default tsv missing rows: %q", stdout)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--format", "yaml"); code != 2 {
		t.Errorf("--format yaml: want exit 2, got %d", code)
	}
}

func TestCLI_ContextShowTextJSONAndBinarySummary(t *testing.T) {
	requested := map[string]int{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/s1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		path := r.URL.Query().Get("path")
		requested[path]++
		switch path {
		case "docs/readme.md":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"file": gact.ContextFileContent{
					Path:        "docs/readme.md",
					DisplayPath: "docs/readme.md",
					Size:        22,
					MediaType:   "text/markdown; charset=utf-8",
					Encoding:    "base64",
					Data:        base64.StdEncoding.EncodeToString([]byte("# Readme\n\nCLI preview\n")),
				},
			})
		case "plots/waveform.png":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"file": gact.ContextFileContent{
					Path:      "plots/waveform.png",
					Size:      8,
					MediaType: "image/png",
					Encoding:  "base64",
					Data:      base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
				},
			})
		default:
			http.Error(w, `{"error":{"code":"not_found","message":"missing"}}`, http.StatusNotFound)
		}
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "docs/readme.md")
	if code != 0 {
		t.Fatalf("context show text exit %d stderr=%s", code, stderr)
	}
	for _, want := range []string{"path: docs/readme.md", "media_type: text/markdown; charset=utf-8", "preview:", "# Readme", "CLI preview"} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("context show text missing %q:\n%s", want, stdout)
		}
	}
	if strings.Contains(stdout, base64.StdEncoding.EncodeToString([]byte("# Readme\n\nCLI preview\n"))) {
		t.Fatalf("context show text should not print raw base64:\n%s", stdout)
	}

	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "docs/readme.md", "--format", "json")
	if code != 0 {
		t.Fatalf("context show json exit %d stderr=%s", code, stderr)
	}
	var content gact.ContextFileContent
	if err := json.Unmarshal([]byte(stdout), &content); err != nil {
		t.Fatalf("parse context show json: %v\nraw=%s", err, stdout)
	}
	if content.Path != "docs/readme.md" || content.Data == "" {
		t.Fatalf("unexpected context show json: %+v", content)
	}

	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "plots/waveform.png")
	if code != 0 {
		t.Fatalf("context show binary exit %d stderr=%s", code, stderr)
	}
	if !strings.Contains(stdout, "preview: binary content not rendered") {
		t.Fatalf("binary context show should summarize preview:\n%s", stdout)
	}
	if strings.Contains(stdout, "iVBOR") {
		t.Fatalf("binary context show should not dump base64:\n%s", stdout)
	}
	if requested["docs/readme.md"] != 2 || requested["plots/waveform.png"] != 1 {
		t.Fatalf("unexpected request counts: %#v", requested)
	}
}

func TestCLI_ContextShowSurfacesBackendError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"code":"not_found","message":"context file missing"}}`, http.StatusNotFound)
	}))
	defer srv.Close()
	bin := buildGact(t)

	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "missing.txt")
	if code != 1 {
		t.Fatalf("context show missing exit = %d, want 1", code)
	}
	if !strings.Contains(stderr, "context file missing") {
		t.Fatalf("context show should surface backend error, stderr=%q", stderr)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "missing.txt", "--format", "yaml"); code != 2 {
		t.Fatalf("context show bad format exit = %d, want 2", code)
	}
}

func TestCLI_ContextUploadPostsLocalFileAndPrintsContextRow(t *testing.T) {
	tmp := t.TempDir()
	localPath := filepath.Join(tmp, "report.txt")
	if err := os.WriteFile(localPath, []byte("hello attachment\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/attachments" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode upload body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/report.txt",
			Mode:     "pin",
			Size:     17,
			Uploaded: true,
		})
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--mode", "pin")
	if code != 0 {
		t.Fatalf("context upload exit %d stderr=%s", code, stderr)
	}
	if got["filename"] != "report.txt" || got["mode"] != "pin" || got["mime_type"] != "text/plain; charset=utf-8" {
		t.Fatalf("upload metadata = %#v", got)
	}
	if got["file"] != base64.StdEncoding.EncodeToString([]byte("hello attachment\n")) {
		t.Fatalf("upload file = %#v", got["file"])
	}
	if strings.TrimSpace(stdout) != "pin\t.clio/attachments/s1/report.txt" {
		t.Fatalf("context upload stdout = %q", stdout)
	}
}

func TestCLI_ContextUploadJSONAndFailures(t *testing.T) {
	tmp := t.TempDir()
	localPath := filepath.Join(tmp, "plot.bin")
	if err := os.WriteFile(localPath, []byte{0x00, 0x01, 0x02}, 0o644); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/plot.bin",
			Mode:     "read",
			Size:     3,
			Uploaded: true,
		})
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--format", "json")
	if code != 0 {
		t.Fatalf("context upload json exit %d stderr=%s", code, stderr)
	}
	var cf gact.ContextFile
	if err := json.Unmarshal([]byte(stdout), &cf); err != nil {
		t.Fatalf("parse upload json: %v\nraw=%s", err, stdout)
	}
	if !cf.Uploaded || cf.Path != ".clio/attachments/s1/plot.bin" {
		t.Fatalf("upload json = %+v", cf)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--mode", "bad"); code != 2 {
		t.Fatalf("bad mode exit = %d, want 2", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--format", "yaml"); code != 2 {
		t.Fatalf("bad format exit = %d, want 2", code)
	}
	if _, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", filepath.Join(tmp, "missing.txt")); code != 1 ||
		!(strings.Contains(stderr, "no such file") || strings.Contains(stderr, "cannot find the file")) {
		t.Fatalf("missing file code=%d stderr=%q", code, stderr)
	}

	rejectSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"code":"upload_failed","message":"attachment rejected"}}`, http.StatusBadRequest)
	}))
	defer rejectSrv.Close()
	if _, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": rejectSrv.URL},
		"context", "upload", "s1", localPath); code != 1 || !strings.Contains(stderr, "attachment rejected") {
		t.Fatalf("backend reject code=%d stderr=%q", code, stderr)
	}
}

// TestCLI_ContextRoundTrip covers add, list, and remove for context files.
func TestCLI_ContextRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "context-target")

	stdout, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if code != 0 {
		t.Fatalf("list (empty): exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty list, got: %q", stdout)
	}

	for _, f := range []string{"main.go", "README.md"} {
		_, _, code := runGact(t, bin,
			map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, f)
		if code != 0 {
			t.Fatalf("add %s: exit %d", f, code)
		}
	}

	stdout, _, _ = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if !strings.Contains(stdout, "main.go") || !strings.Contains(stdout, "README.md") {
		t.Errorf("list missing entries: %q", stdout)
	}

	_, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "rm", sid, "main.go")
	if code != 0 {
		t.Fatalf("rm: exit %d", code)
	}

	stdout, _, _ = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if strings.Contains(stdout, "main.go") {
		t.Errorf("main.go should be removed: %q", stdout)
	}
	if !strings.Contains(stdout, "README.md") {
		t.Errorf("README.md should remain: %q", stdout)
	}
}
