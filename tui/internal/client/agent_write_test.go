package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentWriteClientMethodsUseCLIOEndpoints(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		switch r.URL.Path {
		case "/v1/agents":
			if r.Method != http.MethodPost {
				http.NotFound(w, r)
				return
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(gact.AgentDef{ID: "user-agent", Source: "user", Title: "User Agent"})
		case "/v1/agents/user-agent":
			switch r.Method {
			case http.MethodPut:
				_ = json.NewEncoder(w).Encode(gact.AgentDef{ID: "user-agent", Source: "user", Title: "Updated Agent"})
			case http.MethodDelete:
				w.WriteHeader(http.StatusNoContent)
			default:
				http.NotFound(w, r)
			}
		case "/v1/agents/extract":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(gact.AgentDef{ID: "extracted", Source: "user", Title: "Extracted"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	if got, err := c.CreateAgent(t.Context(), gact.AgentDef{ID: "user-agent", Title: "User Agent"}); err != nil {
		t.Fatalf("CreateAgent: %v", err)
	} else if got.ID != "user-agent" {
		t.Fatalf("CreateAgent ID = %q", got.ID)
	}
	if got, err := c.UpdateAgent(t.Context(), "user-agent", gact.AgentDef{Title: "Updated Agent"}); err != nil {
		t.Fatalf("UpdateAgent: %v", err)
	} else if got.Title != "Updated Agent" {
		t.Fatalf("UpdateAgent title = %q", got.Title)
	}
	if err := c.DeleteAgent(t.Context(), "user-agent"); err != nil {
		t.Fatalf("DeleteAgent: %v", err)
	}
	if got, err := c.ExtractAgent(t.Context(), gact.AgentExtractRequest{SessionIDs: []string{"s1"}, AgentID: "extracted"}); err != nil {
		t.Fatalf("ExtractAgent: %v", err)
	} else if got.ID != "extracted" {
		t.Fatalf("ExtractAgent ID = %q", got.ID)
	}

	want := []string{
		"POST /v1/agents",
		"PUT /v1/agents/user-agent",
		"DELETE /v1/agents/user-agent",
		"POST /v1/agents/extract",
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
