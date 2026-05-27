package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.12 Providers / Models ----------------------------------------------

func TestProviders(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	{
		rec := do(t, h, http.MethodGet, "/v1/providers", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/anthropic", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
		var got gact.Provider
		mustDecode(t, rec, &got)
		if got.ID != "anthropic" {
			t.Errorf("id = %q", got.ID)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/anthropic/models", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("models: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing provider: %d", rec.Code)
		}
		rec2 := do(t, h, http.MethodGet, "/v1/providers/nope/models", nil)
		if rec2.Code != http.StatusNotFound {
			t.Errorf("missing models: %d", rec2.Code)
		}
	}
}

func TestLMProviderConfig(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/providers/lm", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get lm provider: %d", rec.Code)
	}
	var got struct {
		Configured bool `json:"configured"`
		Presets    []struct {
			ID             string `json:"id"`
			SuggestedModel string `json:"suggested_model"`
		} `json:"presets"`
	}
	mustDecode(t, rec, &got)
	if !got.Configured || len(got.Presets) < 3 || got.Presets[0].ID != "anthropic" {
		t.Fatalf("unexpected lm provider info: %+v", got)
	}

	rec = do(t, h, http.MethodPut, "/v1/providers/lm", lmProviderRequest{
		Provider: "local",
		Model:    "llama3.3",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("put lm provider: %d", rec.Code)
	}
	var updated lmProviderInfo
	mustDecode(t, rec, &updated)
	if updated.Provider != "local" || updated.Model != "llama3.3" {
		t.Fatalf("updated provider = %s/%s", updated.Provider, updated.Model)
	}

	rec = do(t, h, http.MethodPut, "/v1/providers/lm", lmProviderRequest{
		Provider: "local",
		Model:    "missing",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad model should surface error, got %d", rec.Code)
	}
}

// --- §6.6 Tools ------------------------------------------------------------

func TestTools(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/tools", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	rec2 := do(t, h, http.MethodGet, "/v1/tools/bash", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("get: %d", rec2.Code)
	}
	rec3 := do(t, h, http.MethodGet, "/v1/tools/nope", nil)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("missing: %d", rec3.Code)
	}
}

// --- §6.5 Agents -----------------------------------------------------------

func TestAgents(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/agents", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	rec2 := do(t, h, http.MethodGet, "/v1/agents/default", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("get: %d", rec2.Code)
	}
	// Write API stubbed to 501.
	rec3 := do(t, h, http.MethodPost, "/v1/agents", map[string]any{"id": "x"})
	if rec3.Code != http.StatusNotImplemented {
		t.Errorf("POST: %d, want 501", rec3.Code)
	}
}

// --- §6.7 MCP --------------------------------------------------------------

func TestMcpEndpoints(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers/mcp_fake", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers/nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/reconnect", nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("reconnect: %d", rec.Code)
		}
	}
	for _, p := range []string{
		"/v1/mcp/servers/mcp_fake/tools",
		"/v1/mcp/servers/mcp_fake/resources",
		"/v1/mcp/servers/mcp_fake/resource_templates",
		"/v1/mcp/servers/mcp_fake/prompts",
	} {
		rec := do(t, h, http.MethodGet, p, nil)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s: %d", p, rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/resources/read", map[string]any{
			"uri": "file:///docs/welcome.md",
		})
		if rec.Code != http.StatusOK {
			t.Errorf("read: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/resources/subscribe", map[string]any{
			"uri": "file:///docs/welcome.md",
		})
		if rec.Code != http.StatusNoContent {
			t.Errorf("subscribe: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/prompts/get", map[string]any{
			"name": "summarize", "arguments": map[string]any{"text": "hi"},
		})
		if rec.Code != http.StatusOK {
			t.Errorf("prompts/get: %d", rec.Code)
		}
	}
}

// --- §6.13 Commands --------------------------------------------------------

func TestCommands(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/commands", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	// /clear now actually wipes messages — seed some first so the
	// count-in-response is meaningful.
	for i := 0; i < 3; i++ {
		_, _ = srv.Store().AppendMessage(gact.Message{
			SessionID: sid, Role: gact.RoleUser,
			Parts: []gact.Part{gact.NewTextPart("hi")},
		})
	}
	rec2 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/%2Fclear", nil)
	if rec2.Code != http.StatusOK {
		t.Errorf("/clear: %d", rec2.Code)
	}
	// Listing messages should now return an empty slice.
	rec2b := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages", nil)
	if !strings.Contains(rec2b.Body.String(), `"messages":[]`) && !strings.Contains(rec2b.Body.String(), `"messages":null`) {
		t.Errorf("messages after /clear: %s", rec2b.Body.String())
	}

	// /help is a side-effecting command that emits an assistant note.
	// 204 is fine; ensure the assistant note landed in the store.
	rec3 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/%2Fhelp", nil)
	if rec3.Code != http.StatusNoContent {
		t.Errorf("/help: %d", rec3.Code)
	}
	rec3b := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages", nil)
	if !strings.Contains(rec3b.Body.String(), "GACT slash commands") {
		t.Errorf("help note missing: %s", rec3b.Body.String())
	}

	// Unknown command.
	rec4 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/nope", nil)
	if rec4.Code != http.StatusNotFound {
		t.Errorf("unknown: %d", rec4.Code)
	}
}

// --- §6.16 Metrics ---------------------------------------------------------

func TestMetrics(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()
	_, _ = srv.Store().AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser, Parts: []gact.Part{gact.NewTextPart("x")},
	})

	rec := do(t, h, http.MethodGet, "/v1/metrics", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics: %d", rec.Code)
	}
	var m gact.Metrics
	mustDecode(t, rec, &m)
	if m.Sessions.Total < 1 {
		t.Errorf("sessions.total = %d", m.Sessions.Total)
	}
	if m.Messages.Total < 1 {
		t.Errorf("messages.total = %d", m.Messages.Total)
	}
}

// --- §6.9 Files / context --------------------------------------------------

func TestContextFiles(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// add
	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: "main.go", Mode: "edit",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: %d", rec.Code)
	}

	// list
	rec2 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/files", nil)
	var listBody struct {
		Files []gact.ContextFile `json:"files"`
	}
	mustDecode(t, rec2, &listBody)
	if len(listBody.Files) != 1 || listBody.Files[0].Path != "main.go" {
		t.Errorf("list = %+v", listBody)
	}

	// patch
	rec3 := do(t, h, http.MethodPatch, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: "main.go", Mode: "read",
	})
	if rec3.Code != http.StatusOK {
		t.Errorf("patch: %d", rec3.Code)
	}
	// patch missing
	rec3b := do(t, h, http.MethodPatch, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: "nope.go", Mode: "read",
	})
	if rec3b.Code != http.StatusNotFound {
		t.Errorf("patch missing: %d", rec3b.Code)
	}

	// delete
	rec4 := do(t, h, http.MethodDelete, "/v1/sessions/"+sid+"/context/files", contextFileRequest{Path: "main.go"})
	if rec4.Code != http.StatusNoContent {
		t.Errorf("delete: %d", rec4.Code)
	}

	// delete missing
	rec5 := do(t, h, http.MethodDelete, "/v1/sessions/"+sid+"/context/files", contextFileRequest{Path: "nope.go"})
	if rec5.Code != http.StatusNotFound {
		t.Errorf("delete missing: %d", rec5.Code)
	}
}

func TestWorkspaceFiles(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("files: %d", rec.Code)
	}

	rec2 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files/read?path=main.go", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("read: %d", rec2.Code)
	}
	if rec2.Body.Len() == 0 {
		t.Errorf("read returned empty body")
	}

	rec3 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files/read", nil)
	if rec3.Code != http.StatusBadRequest {
		t.Errorf("read missing path: %d", rec3.Code)
	}

	rec4 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/repo_map", nil)
	if rec4.Code != http.StatusOK {
		t.Errorf("repo_map: %d", rec4.Code)
	}
}

// --- §6.10 Diffs -----------------------------------------------------------

func TestDiffs(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// Seed an assistant message with a file_diff part.
	before := "old\n"
	after := "new\n"
	msg, _ := srv.Store().AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{
			gact.NewFileDiffPart("a.go", &before, &after, "go"),
		},
	})

	// session diffs
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/diffs", nil)
		var body struct {
			Diffs []gact.FileDiff `json:"diffs"`
		}
		mustDecode(t, rec, &body)
		if len(body.Diffs) != 1 || body.Diffs[0].Path != "a.go" {
			t.Errorf("diffs: %+v", body)
		}
	}

	// per-message diffs
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/"+msg.ID+"/diffs", nil)
		if rec.Code != http.StatusOK {
			t.Errorf("msg diffs: %d", rec.Code)
		}
	}

	// apply
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/diffs/apply", applyRejectRequest{Paths: []string{"a.go"}})
		if rec.Code != http.StatusOK {
			t.Errorf("apply: %d", rec.Code)
		}
	}

	// reject
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/diffs/reject", applyRejectRequest{Paths: []string{"a.go"}})
		if rec.Code != http.StatusOK {
			t.Errorf("reject: %d", rec.Code)
		}
	}

	// undo (deletes 1 message)
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/undo", undoRequest{Count: 1})
		if rec.Code != http.StatusOK {
			t.Errorf("undo: %d", rec.Code)
		}
	}

	_ = store.SessionFilter{} // pull store import if otherwise unused
}

// TestWorkspaceFiles_WalkMode covers T3: with WalkWorkspaceFiles=true
// and a real directory as the workspace root, the handler returns
// entries discovered on disk instead of the static demo list.
func TestWorkspaceFiles_WalkMode(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "alpha.go"), []byte("package x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "nested", "beta.md"), []byte("# hi"), 0o644); err != nil {
		t.Fatal(err)
	}

	st := store.New()
	ws, err := st.CreateWorkspace(gact.Workspace{ID: "ws_real", Name: "real", RootPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	srv := NewWithStore(Config{WalkWorkspaceFiles: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/workspaces/"+ws.ID+"/files", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "alpha.go") {
		t.Errorf("walk didn't surface alpha.go: %s", body)
	}
	if !strings.Contains(body, "nested/beta.md") {
		t.Errorf("walk didn't surface nested/beta.md: %s", body)
	}
	// Static demo entry must NOT appear — walk wins when enabled.
	if strings.Contains(body, "docs/architecture.md") {
		t.Errorf("static-demo entry bled into walk output: %s", body)
	}
}
