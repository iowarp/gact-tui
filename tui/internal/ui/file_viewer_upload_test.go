package ui

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestFileViewerDetailUploadActionUploadsAttachment(t *testing.T) {
	root := seedFileViewerTree(t)
	var uploadBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/attachments" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&uploadBody); err != nil {
			t.Fatalf("decode upload body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/README.md",
			Mode:     "read",
			Size:     7,
			Uploaded: true,
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.caps.Capabilities.AttachmentsUpload = true
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeSel = 1 // README.md
	a.fileViewer.activateSelection()
	if !a.detail.visible || a.detail.ref == nil || a.detail.ref.localPath == "" {
		t.Fatalf("expected file detail with local path, detail=%#v", a.detail.ref)
	}
	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:detail:upload"); !ok {
		t.Fatal("advertised attachment support should render upload button target")
	}

	model, cmd := a.detail.handleKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("upload action should dispatch a command")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		if len(batch) != 2 {
			t.Fatalf("upload action batch length = %d, want hint + upload", len(batch))
		}
		msg = batch[1]()
	}
	uploaded, ok := msg.(contextFileUploadedMsg)
	if !ok {
		t.Fatalf("upload command returned %T, want contextFileUploadedMsg", msg)
	}
	if uploaded.err != nil {
		t.Fatalf("upload failed: %v", uploaded.err)
	}
	if uploadBody["filename"] != "README.md" || uploadBody["mode"] != "read" {
		t.Fatalf("upload body = %#v", uploadBody)
	}
	if uploadBody["file"] != base64.StdEncoding.EncodeToString([]byte("# demo\n")) {
		t.Fatalf("upload file = %#v", uploadBody["file"])
	}

	model, _ = a.Update(uploaded)
	a = model.(*App)
	if len(a.session.contextFiles) != 1 || !a.session.contextFiles[0].Uploaded {
		t.Fatalf("context files after upload = %#v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "uploaded .clio/attachments/s1/README.md to context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestFileViewerDetailUploadRequiresCapability(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{messageID: "files", localPath: "/tmp/report.txt"}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:detail:upload"); ok {
		t.Fatal("upload button should be hidden when attachments_upload is not advertised")
	}
	_, cmd := a.detail.handleKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	if cmd == nil {
		t.Fatal("unsupported upload should still schedule hint expiry")
	}
	if a.transientHint != "attachment upload unsupported by this backend" {
		t.Fatalf("hint = %q", a.transientHint)
	}
}
