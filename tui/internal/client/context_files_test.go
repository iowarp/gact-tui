package client

import (
	"encoding/base64"
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

func TestUploadAttachmentRequestShape(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1/sessions/s1/attachments" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode upload body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/report.txt",
			Mode:     "read",
			Size:     11,
			Uploaded: true,
		})
	}))
	defer srv.Close()

	cf, err := New(srv.URL).UploadAttachment(t.Context(), "s1", "report.txt", "text/plain", "read", []byte("hello world"))
	if err != nil {
		t.Fatalf("UploadAttachment: %v", err)
	}
	if got["filename"] != "report.txt" || got["mime_type"] != "text/plain" || got["mode"] != "read" {
		t.Fatalf("upload body metadata = %#v", got)
	}
	if got["file"] != base64.StdEncoding.EncodeToString([]byte("hello world")) {
		t.Fatalf("upload file = %#v", got["file"])
	}
	if !cf.Uploaded || cf.Path != ".clio/attachments/s1/report.txt" {
		t.Fatalf("context file = %+v", cf)
	}
}
