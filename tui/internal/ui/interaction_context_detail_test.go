package ui

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestContextFileDetailLoadsCLIOContentPreview(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/sess_1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if got := r.URL.Query().Get("path"); got != "docs/readme.md" {
			t.Fatalf("query path = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"file": gact.ContextFileContent{
				Path:        "docs/readme.md",
				DisplayPath: "docs/readme.md",
				Size:        26,
				MediaType:   "text/markdown; charset=utf-8",
				Encoding:    "base64",
				Data:        base64.StdEncoding.EncodeToString([]byte("# Readme\n\nPreview body.\n")),
			},
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.caps.Capabilities.XClioFilesContent = true
	a.session.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read", Size: 26, Language: "markdown"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:file:docs/readme.md")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("context detail should dispatch content preview load")
	}
	if !strings.Contains(a.detail.ref.fullText, "preview: loading") {
		t.Fatalf("initial detail should show loading preview:\n%s", a.detail.ref.fullText)
	}

	model, _ = a.Update(cmd())
	a = model.(*App)
	for _, want := range []string{
		"Content",
		"media type: text/markdown; charset=utf-8",
		"encoding: base64",
		"preview:",
		"# Readme",
		"Preview body.",
	} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("enriched context detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
	for _, raw := range []string{"media_type:", "display_path:", "session_use:", "parent_session_id:", "latest_activity:"} {
		if strings.Contains(a.detail.ref.fullText, raw) {
			t.Fatalf("enriched context detail should avoid raw label %q:\n%s", raw, a.detail.ref.fullText)
		}
	}
}

func TestContextFileDetailProbesContentWhenCapabilityMissing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/sess_1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"file": gact.ContextFileContent{
				Path:      "notes/result.txt",
				Size:      19,
				MediaType: "text/plain; charset=utf-8",
				Encoding:  "base64",
				Data:      base64.StdEncoding.EncodeToString([]byte("preview from CLIO\n")),
			},
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "notes/result.txt", Mode: "read", Size: 19, Language: "text"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:file:notes/result.txt")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("context detail should probe content endpoint even when capability flag is absent")
	}
	if !strings.Contains(a.detail.ref.fullText, "x_clio_files_content not advertised; probing endpoint") {
		t.Fatalf("initial detail should explain endpoint probe:\n%s", a.detail.ref.fullText)
	}

	model, _ = a.Update(cmd())
	a = model.(*App)
	if strings.Contains(a.detail.ref.fullText, "unavailable") {
		t.Fatalf("successful probe should not leave unavailable text:\n%s", a.detail.ref.fullText)
	}
	for _, want := range []string{"media type: text/plain; charset=utf-8", "preview from CLIO"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("probed context detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
	if strings.Contains(a.detail.ref.fullText, "media_type:") {
		t.Fatalf("probed context detail should avoid raw media label:\n%s", a.detail.ref.fullText)
	}
}

func TestContextFileDetailProbeSurfacesBackendError(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.session.sessions = []gact.Session{{ID: "sess_1"}}
	a.session.selected = 0
	rows := a.contextFiles.detailRowsWithContent(
		gact.ContextFile{Path: "missing.txt", Mode: "read"},
		gact.ContextFileContent{},
		errors.New("context file not found"),
	)
	out := strings.Join(rows, "\n")
	if !strings.Contains(out, "preview_error: context file not found") {
		t.Fatalf("context detail should surface backend error:\n%s", out)
	}
	if strings.Contains(out, "unavailable") {
		t.Fatalf("backend error should not be hidden behind unavailable text:\n%s", out)
	}
}

func TestContextFileDetailSummarizesBinaryContent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.session.caps.Capabilities.XClioFilesContent = true
	rows := a.contextFiles.detailRowsWithContent(
		gact.ContextFile{Path: "plots/waveform.png", Mode: "read"},
		gact.ContextFileContent{
			Path:      "plots/waveform.png",
			Size:      8,
			MediaType: "image/png",
			Encoding:  "base64",
			Data:      base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
		},
		nil,
	)
	out := strings.Join(rows, "\n")
	if !strings.Contains(out, "binary content not rendered in terminal detail") {
		t.Fatalf("binary context detail should summarize content:\n%s", out)
	}
	if strings.Contains(out, "iVBOR") {
		t.Fatalf("binary context detail should not dump base64:\n%s", out)
	}
}

func TestContextFileDetailPreviewsCommonApplicationTextTypes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.session.caps.Capabilities.XClioFilesContent = true
	for _, tc := range []struct {
		name      string
		mediaType string
		path      string
		body      string
	}{
		{name: "javascript", mediaType: "application/javascript", path: "scripts/run.js", body: "console.log('ok')\n"},
		{name: "shell", mediaType: "application/x-sh", path: "scripts/run.sh", body: "#!/bin/sh\necho ok\n"},
		{name: "python", mediaType: "application/x-python", path: "tools/run.py", body: "print('ok')\n"},
		{name: "vendor json", mediaType: "application/vnd.clio.context+json", path: "trace.json", body: "{\"ok\":true}\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows := a.contextFiles.detailRowsWithContent(
				gact.ContextFile{Path: tc.path, Mode: "read"},
				gact.ContextFileContent{
					Path:      tc.path,
					Size:      int64(len(tc.body)),
					MediaType: tc.mediaType,
					Encoding:  "base64",
					Data:      base64.StdEncoding.EncodeToString([]byte(tc.body)),
				},
				nil,
			)
			out := strings.Join(rows, "\n")
			if !strings.Contains(out, "preview:") {
				t.Fatalf("text application media type should render preview:\n%s", out)
			}
			for _, line := range strings.Split(strings.TrimSpace(tc.body), "\n") {
				if strings.TrimSpace(line) != "" && !strings.Contains(out, line) {
					t.Fatalf("text application media type preview missing %q:\n%s", line, out)
				}
			}
			if strings.Contains(out, "binary content not rendered") {
				t.Fatalf("text application media type should not be summarized as binary:\n%s", out)
			}
		})
	}
}
