package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentBlueprintClientMethodsUseCLIOEndpoints(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		switch r.URL.Path {
		case "/v1/agent-blueprints":
			_ = json.NewEncoder(w).Encode(map[string]any{"agent_blueprints": []gact.AgentBlueprintDefinition{{ID: "bp1", Enabled: true}}})
		case "/v1/agent-blueprints/sources":
			if r.Method == http.MethodPost {
				var req gact.AgentBlueprintSourceRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Fatalf("decode source request: %v", err)
				}
				if req.Source != "https://github.com/iowarp/data-semantics-agents.git" || !req.Refresh {
					t.Fatalf("source request = %#v", req)
				}
				w.WriteHeader(http.StatusCreated)
				_ = json.NewEncoder(w).Encode(map[string]any{"source": gact.AgentBlueprintSource{ID: "data-semantics-agents", Name: "Data Semantics Agents", Source: req.Source}})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sources": []gact.AgentBlueprintSource{{ID: "src1", Name: "Data Semantics Agents"}}})
		case "/v1/agent-blueprints/sources/src1/refresh":
			_ = json.NewEncoder(w).Encode(map[string]any{"source": gact.AgentBlueprintSource{ID: "src1", Name: "Data Semantics Agents", Status: "ready"}})
		case "/v1/agent-blueprints/sources/src1":
			w.WriteHeader(http.StatusNoContent)
		case "/v1/agent-blueprints/bp1":
			_ = json.NewEncoder(w).Encode(gact.AgentBlueprintDetail{AgentBlueprint: gact.AgentBlueprintDefinition{ID: "bp1", Enabled: true}})
		case "/v1/agent-blueprints/validate":
			_ = json.NewEncoder(w).Encode(gact.AgentBlueprintValidationResult{Enabled: true})
		case "/v1/agent-blueprints/install":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"installed": []any{}})
		case "/v1/agent-blueprints/bp1/update":
			_ = json.NewEncoder(w).Encode(map[string]any{"updated": map[string]any{"id": "bp1"}})
		case "/v1/agent-blueprints/bp1/mcp/earthscope/enable":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "agent_blueprint_mcp_bp1_earthscope"})
		case "/v1/agent-blueprints/bp1/hooks/pre_message/enable":
			var req gact.AgentBlueprintHookEnableRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode hook enable request: %v", err)
			}
			if !req.Trust {
				t.Fatalf("hook enable request should send explicit trust: %#v", req)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "agent_blueprint_hook_bp1_pre_message"})
		case "/v1/sessions/s1/agent-blueprint":
			if r.Method == http.MethodPost {
				_ = json.NewEncoder(w).Encode(gact.SessionAgentBlueprintState{SessionID: "s1", ActiveAgentBlueprintID: "bp1"})
				return
			}
			_ = json.NewEncoder(w).Encode(gact.SessionAgentBlueprintState{SessionID: "s1"})
		case "/v1/sessions/s1/agent-overlay":
			_ = json.NewEncoder(w).Encode(gact.SessionAgentOverlayResponse{SessionID: "s1", AgentOverlay: map[string]any{"agents": map[string]any{}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	scope := RuntimeScope{WorkspaceID: "ws1"}
	if _, err := c.ListAgentBlueprints(t.Context(), scope); err != nil {
		t.Fatalf("ListAgentBlueprints: %v", err)
	}
	if _, err := c.ListAgentBlueprintSources(t.Context()); err != nil {
		t.Fatalf("ListAgentBlueprintSources: %v", err)
	}
	if got, err := c.AddAgentBlueprintSource(t.Context(), gact.AgentBlueprintSourceRequest{Source: "https://github.com/iowarp/data-semantics-agents.git", Refresh: true}); err != nil || got.ID != "data-semantics-agents" {
		t.Fatalf("AddAgentBlueprintSource: got=%#v err=%v", got, err)
	}
	if _, err := c.RefreshAgentBlueprintSource(t.Context(), "src1"); err != nil {
		t.Fatalf("RefreshAgentBlueprintSource: %v", err)
	}
	if err := c.DeleteAgentBlueprintSource(t.Context(), "src1"); err != nil {
		t.Fatalf("DeleteAgentBlueprintSource: %v", err)
	}
	if _, err := c.GetAgentBlueprint(t.Context(), "bp1", scope); err != nil {
		t.Fatalf("GetAgentBlueprint: %v", err)
	}
	if _, err := c.ValidateAgentBlueprint(t.Context(), gact.AgentBlueprintValidateRequest{Path: "/tmp/bp"}); err != nil {
		t.Fatalf("ValidateAgentBlueprint: %v", err)
	}
	if _, err := c.InstallAgentBlueprint(t.Context(), gact.AgentBlueprintInstallRequest{Source: "/tmp/market"}); err != nil {
		t.Fatalf("InstallAgentBlueprint: %v", err)
	}
	if _, err := c.UpdateAgentBlueprint(t.Context(), "bp1", gact.AgentBlueprintUpdateRequest{}); err != nil {
		t.Fatalf("UpdateAgentBlueprint: %v", err)
	}
	if _, err := c.EnableAgentBlueprintMCP(t.Context(), "bp1", "earthscope", gact.AgentBlueprintMCPEnableRequest{}); err != nil {
		t.Fatalf("EnableAgentBlueprintMCP: %v", err)
	}
	if _, err := c.EnableAgentBlueprintHook(t.Context(), "bp1", "pre_message", gact.AgentBlueprintHookEnableRequest{Trust: true}); err != nil {
		t.Fatalf("EnableAgentBlueprintHook: %v", err)
	}
	if _, err := c.GetSessionAgentBlueprint(t.Context(), "s1"); err != nil {
		t.Fatalf("GetSessionAgentBlueprint: %v", err)
	}
	if _, err := c.SetSessionAgentBlueprint(t.Context(), "s1", gact.SetSessionAgentBlueprintRequest{BlueprintID: "bp1"}); err != nil {
		t.Fatalf("SetSessionAgentBlueprint: %v", err)
	}
	if _, err := c.GetSessionAgentOverlay(t.Context(), "s1"); err != nil {
		t.Fatalf("GetSessionAgentOverlay: %v", err)
	}
	if _, err := c.PutSessionAgentOverlay(t.Context(), "s1", map[string]any{"agents": map[string]any{}}); err != nil {
		t.Fatalf("PutSessionAgentOverlay: %v", err)
	}

	want := []string{
		"GET /v1/agent-blueprints",
		"GET /v1/agent-blueprints/sources",
		"POST /v1/agent-blueprints/sources",
		"POST /v1/agent-blueprints/sources/src1/refresh",
		"DELETE /v1/agent-blueprints/sources/src1",
		"GET /v1/agent-blueprints/bp1",
		"POST /v1/agent-blueprints/validate",
		"POST /v1/agent-blueprints/install",
		"POST /v1/agent-blueprints/bp1/update",
		"POST /v1/agent-blueprints/bp1/mcp/earthscope/enable",
		"POST /v1/agent-blueprints/bp1/hooks/pre_message/enable",
		"GET /v1/sessions/s1/agent-blueprint",
		"POST /v1/sessions/s1/agent-blueprint",
		"GET /v1/sessions/s1/agent-overlay",
		"PUT /v1/sessions/s1/agent-overlay",
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
