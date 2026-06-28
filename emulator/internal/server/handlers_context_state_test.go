package server

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func seedContextSession(t *testing.T, s *Server) string {
	t.Helper()
	ws, err := s.store.CreateWorkspace(gact.Workspace{Name: "ctx", RootPath: t.TempDir()})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	sess, err := s.store.CreateSession(gact.Session{WorkspaceID: ws.ID, Title: "context"})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	for _, m := range []gact.Message{
		{SessionID: sess.ID, Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "please analyze the dataset and summarize"}}},
		{SessionID: sess.ID, Role: gact.RoleAssistant, Parts: []gact.Part{
			{Type: gact.PartTypeThinking, Text: "I should call the analysis tool first"},
			{Type: gact.PartTypeToolCall, Text: "analyze(dataset)"},
		}},
		{SessionID: sess.ID, Role: gact.RoleTool, Parts: []gact.Part{{Type: gact.PartTypeToolResult, Text: "rows=1000 cols=12 summary=ok"}}},
	} {
		if _, err := s.store.AppendMessage(m); err != nil {
			t.Fatalf("append message: %v", err)
		}
	}
	return sess.ID
}

func TestContextStateBucketsAndFullness(t *testing.T) {
	s := New(Config{})
	sid := seedContextSession(t, s)
	h := s.Handler()

	rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/state?scope=coder", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("context state: %d %s", rec.Code, rec.Body.String())
	}
	var st map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&st); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if st["scope"] != "coder" {
		t.Fatalf("scope = %v, want coder", st["scope"])
	}
	if st["window_tokens"].(float64) <= 0 {
		t.Fatalf("window_tokens should be >0")
	}
	cats, ok := st["categories"].(map[string]any)
	if !ok || len(cats) == 0 {
		t.Fatalf("categories missing: %#v", st["categories"])
	}
	for _, want := range []string{"system", "messages", "tools", "framing"} {
		if _, present := cats[want]; !present {
			t.Fatalf("categories missing %q: %#v", want, cats)
		}
	}
	// used_pct (model-grounded) must exceed pct_used (attributed only) because
	// of the framing overhead.
	if st["used_pct"].(float64) <= st["pct_used"].(float64) {
		t.Fatalf("used_pct %v should exceed pct_used %v", st["used_pct"], st["pct_used"])
	}
	if st["autocompact_pct"].(float64) != 0.85 {
		t.Fatalf("autocompact_pct = %v, want 0.85", st["autocompact_pct"])
	}
}

func TestContextCompactCollapsesWorkingSet(t *testing.T) {
	s := New(Config{})
	sid := seedContextSession(t, s)
	h := s.Handler()

	pre := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/state", nil)
	var preState map[string]any
	_ = json.NewDecoder(pre.Body).Decode(&preState)
	preBlocks := preState["live_block_count"].(float64)

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/context/compact", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("compact: %d %s", rec.Code, rec.Body.String())
	}
	var post map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&post); err != nil {
		t.Fatalf("decode compact: %v", err)
	}
	cats := post["categories"].(map[string]any)
	if _, ok := cats["summary"]; !ok {
		t.Fatalf("post-compaction should have a summary bucket: %#v", cats)
	}
	if post["live_block_count"].(float64) >= preBlocks {
		t.Fatalf("compaction should reduce live_block_count: pre=%v post=%v", preBlocks, post["live_block_count"])
	}
}

func TestContextStateUnknownSession404(t *testing.T) {
	s := New(Config{})
	h := s.Handler()
	rec := do(t, h, http.MethodGet, "/v1/sessions/does-not-exist/context/state", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown session state = %d, want 404 (%s)", rec.Code, rec.Body.String())
	}
}
