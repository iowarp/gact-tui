package client

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func sampleContextStateJSON() map[string]any {
	return map[string]any{
		"session_id":       "s1",
		"scope":            "analyst",
		"as_of":            1_700_000_000_000,
		"window_tokens":    200_000,
		"live_tokens":      12_000,
		"pct_used":         0.06,
		"used_tokens":      15_500,
		"used_pct":         0.0775,
		"autocompact_pct":  0.85,
		"live_block_count": 7,
		"tokens_by_kind":   map[string]int{"message": 8_000, "tool_call": 4_000},
		"categories":       map[string]int{"messages": 8_000, "tool_calls": 4_000, "framing": 3_500},
		"segments":         []map[string]any{{"id": "seg1", "kind": "message", "tokens": 8_000}},
		"render_text":      "Context: 15.5k / 200k",
		"render_keys":      map[string]any{"pct": "7.8%"},
	}
}

func TestGetContextStateScopeQuery(t *testing.T) {
	var gotPath, gotScope, gotSession string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		gotPath = r.URL.Path
		gotScope = r.URL.Query().Get("scope")
		gotSession = r.URL.Query().Get("session_id")
		_ = json.NewEncoder(w).Encode(sampleContextStateJSON())
	}))
	defer srv.Close()

	st, err := New(srv.URL).GetContextState(t.Context(), "s1", "analyst")
	if err != nil {
		t.Fatalf("GetContextState: %v", err)
	}
	if gotPath != "/v1/sessions/s1/context/state" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotScope != "analyst" {
		t.Fatalf("scope query = %q, want analyst", gotScope)
	}
	if gotSession != "" {
		t.Fatalf("session_id query should be empty (already in path), got %q", gotSession)
	}
	// Nullable fields decode to non-nil pointers when present.
	if st.UsedTokens == nil || *st.UsedTokens != 15_500 {
		t.Fatalf("used_tokens = %v, want 15500", st.UsedTokens)
	}
	if st.UsedPct == nil || *st.UsedPct < 0.0774 || *st.UsedPct > 0.0776 {
		t.Fatalf("used_pct = %v, want ~0.0775", st.UsedPct)
	}
	if st.AutocompactPct == nil || *st.AutocompactPct != 0.85 {
		t.Fatalf("autocompact_pct = %v, want 0.85", st.AutocompactPct)
	}
	if st.Categories["framing"] != 3_500 {
		t.Fatalf("framing category = %d, want 3500", st.Categories["framing"])
	}
	if st.LiveBlockCount != 7 {
		t.Fatalf("live_block_count = %d, want 7", st.LiveBlockCount)
	}
	if len(st.Segments) != 1 || st.Segments[0].Kind != "message" {
		t.Fatalf("segments = %+v", st.Segments)
	}
}

func TestGetContextStateOmitsEmptyScope(t *testing.T) {
	var gotRawQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRawQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(sampleContextStateJSON())
	}))
	defer srv.Close()

	if _, err := New(srv.URL).GetContextState(t.Context(), "s1", ""); err != nil {
		t.Fatalf("GetContextState: %v", err)
	}
	if gotRawQuery != "" {
		t.Fatalf("expected no query when scope empty, got %q", gotRawQuery)
	}
}

func TestCompactContextRequestShape(t *testing.T) {
	var gotMethod, gotPath, gotScope string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotScope = r.URL.Query().Get("scope")
		_ = json.NewEncoder(w).Encode(sampleContextStateJSON())
	}))
	defer srv.Close()

	st, err := New(srv.URL).CompactContext(t.Context(), "s1", "analyst")
	if err != nil {
		t.Fatalf("CompactContext: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method = %s, want POST", gotMethod)
	}
	if gotPath != "/v1/sessions/s1/context/compact" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotScope != "analyst" {
		t.Fatalf("scope query = %q, want analyst", gotScope)
	}
	if st.SessionID != "s1" {
		t.Fatalf("state session = %q", st.SessionID)
	}
}

func TestCompactContextFlatErrorEnvelope(t *testing.T) {
	cases := []struct {
		status int
		reason string
	}{
		{http.StatusConflict, "nothing_to_compact"},
		{http.StatusServiceUnavailable, "compaction_unavailable"},
		{http.StatusNotFound, "session_not_found"},
	}
	for _, tc := range cases {
		t.Run(tc.reason, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				// Flat envelope: `error` is a bare string, not the §14 object.
				_ = json.NewEncoder(w).Encode(map[string]string{"error": tc.reason})
			}))
			defer srv.Close()

			_, err := New(srv.URL).CompactContext(t.Context(), "s1", "")
			if err == nil {
				t.Fatalf("expected error for status %d", tc.status)
			}
			var apiErr *Error
			if !errors.As(err, &apiErr) {
				t.Fatalf("error type = %T, want *Error", err)
			}
			if apiErr.Status != tc.status {
				t.Fatalf("status = %d, want %d", apiErr.Status, tc.status)
			}
			if apiErr.Code != tc.reason {
				t.Fatalf("code = %q, want %q", apiErr.Code, tc.reason)
			}
		})
	}
}

func TestContextStateScopedCarriesWorkspace(t *testing.T) {
	var gotWorkspace, gotScope string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotWorkspace = r.URL.Query().Get("workspace_id")
		gotScope = r.URL.Query().Get("scope")
		_ = json.NewEncoder(w).Encode(sampleContextStateJSON())
	}))
	defer srv.Close()

	scope := RuntimeScope{SessionID: "s1", WorkspaceID: "ws1", Scope: "writer"}
	if _, err := New(srv.URL).GetContextStateScoped(t.Context(), scope); err != nil {
		t.Fatalf("GetContextStateScoped: %v", err)
	}
	if gotWorkspace != "ws1" {
		t.Fatalf("workspace_id = %q, want ws1", gotWorkspace)
	}
	if gotScope != "writer" {
		t.Fatalf("scope = %q, want writer", gotScope)
	}
}
