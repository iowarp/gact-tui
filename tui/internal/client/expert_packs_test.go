package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestListExpertPacksIncludesBlueprintKindPackRows(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.EscapedPath() {
		case "/v1/expert-packs":
			_ = json.NewEncoder(w).Encode(map[string]any{"expert_packs": []gact.ExpertPackDefinition{}})
		case "/v1/agent-blueprints":
			_ = json.NewEncoder(w).Encode(map[string]any{"agent_blueprints": []gact.AgentBlueprintDefinition{{
				ID:      "workflow",
				Title:   "Workflow",
				Kind:    "blueprint",
				Enabled: true,
			}, {
				ID:             "toolkit",
				Title:          "Toolkit Pack",
				Kind:           "pack",
				Scope:          "workspace",
				Version:        "0.1.0",
				DefinitionPath: "/workspace/.clio/agent-blueprints/toolkit/AGENT.md",
				Enabled:        true,
			}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	packs, err := New(srv.URL).ListExpertPacks(t.Context(), RuntimeScope{WorkspaceID: "ws1"})
	if err != nil {
		t.Fatalf("ListExpertPacks: %v", err)
	}
	if len(packs) != 1 {
		t.Fatalf("packs = %#v, want one kind=pack row", packs)
	}
	got := packs[0]
	if got.ID != "toolkit" || got.Title != "Toolkit Pack" || got.Scope != "workspace" || got.Version != "0.1.0" {
		t.Fatalf("pack row = %#v", got)
	}
}
