package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestContextFileContentRequestShape(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.URL.Path != "/v1/sessions/s1/context/files/content" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		gotPath = r.URL.Query().Get("path")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"file": gact.ContextFileContent{
				Path:        "docs/readme.md",
				DisplayPath: "docs/readme.md",
				Size:        12,
				MediaType:   "text/markdown; charset=utf-8",
				Encoding:    "base64",
				Data:        "SGVsbG8gd29ybGQ=",
			},
		})
	}))
	defer srv.Close()

	content, err := New(srv.URL).ContextFileContent(t.Context(), "s1", "docs/read me.md")
	if err != nil {
		t.Fatalf("ContextFileContent: %v", err)
	}
	if gotPath != "docs/read me.md" {
		t.Fatalf("query path = %q", gotPath)
	}
	if content.Path != "docs/readme.md" || content.MediaType != "text/markdown; charset=utf-8" || content.Data == "" {
		t.Fatalf("content = %+v", content)
	}
}
