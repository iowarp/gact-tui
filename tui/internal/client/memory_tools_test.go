package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestMemoryToolClientMethodsUseSessionEndpoints(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		switch r.URL.Path {
		case "/v1/sessions/s1/memory/tools/search-sessions":
			var req gact.MemoryToolSearchSessionsRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query != "pressure dataset" {
				t.Fatalf("search request = %#v err=%v", req, err)
			}
			_ = json.NewEncoder(w).Encode(gact.MemoryToolSearchSessionsResponse{
				Tool: "memory_search_sessions", Query: req.Query,
				Metadata: map[string]any{"policy_decision": "allow_same_session"},
			})
		case "/v1/sessions/s1/memory/tools/read-session-summary":
			_ = json.NewEncoder(w).Encode(gact.MemoryToolReadSessionSummaryResponse{
				Tool:    "memory_read_session_summary",
				Summary: map[string]any{"message_count": 2},
			})
		case "/v1/sessions/s1/memory/tools/read-context-frame":
			var req gact.MemoryToolReadContextFrameRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FrameID != "ctx_1" {
				t.Fatalf("frame request = %#v err=%v", req, err)
			}
			_ = json.NewEncoder(w).Encode(gact.MemoryToolReadContextFrameResponse{
				Tool:  "memory_read_context_frame",
				Frame: map[string]any{"id": req.FrameID},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	if _, err := c.MemoryToolSearchSessions(t.Context(), "s1", gact.MemoryToolSearchSessionsRequest{Query: "pressure dataset"}); err != nil {
		t.Fatalf("MemoryToolSearchSessions: %v", err)
	}
	if _, err := c.MemoryToolReadSessionSummary(t.Context(), "s1", gact.MemoryToolReadSessionSummaryRequest{}); err != nil {
		t.Fatalf("MemoryToolReadSessionSummary: %v", err)
	}
	if _, err := c.MemoryToolReadContextFrame(t.Context(), "s1", gact.MemoryToolReadContextFrameRequest{FrameID: "ctx_1"}); err != nil {
		t.Fatalf("MemoryToolReadContextFrame: %v", err)
	}

	want := []string{
		"POST /v1/sessions/s1/memory/tools/search-sessions",
		"POST /v1/sessions/s1/memory/tools/read-session-summary",
		"POST /v1/sessions/s1/memory/tools/read-context-frame",
	}
	if len(paths) != len(want) {
		t.Fatalf("paths = %v, want %v", paths, want)
	}
	for i := range want {
		if paths[i] != want[i] {
			t.Fatalf("path[%d] = %q, want %q (all=%v)", i, paths[i], want[i], paths)
		}
	}
}
