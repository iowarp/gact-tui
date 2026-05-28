package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestRuntimeScopeCatalogQueries(t *testing.T) {
	type seen struct {
		path  string
		query map[string]string
	}
	var got []seen
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		row := seen{path: r.URL.EscapedPath(), query: map[string]string{}}
		for key, values := range r.URL.Query() {
			if len(values) > 0 {
				row.query[key] = values[0]
			}
		}
		got = append(got, row)
		switch r.URL.EscapedPath() {
		case "/v1/agents":
			_ = json.NewEncoder(w).Encode(map[string]any{"agents": []gact.AgentDef{{ID: "a1", Title: "Agent"}}})
		case "/v1/agents/a1":
			_ = json.NewEncoder(w).Encode(gact.AgentDef{ID: "a1", Title: "Agent"})
		case "/v1/commands":
			_ = json.NewEncoder(w).Encode(map[string]any{"commands": []gact.Command{{ID: "/c", Title: "Command"}}})
		case "/v1/prompts":
			_ = json.NewEncoder(w).Encode(map[string]any{"prompts": []gact.PromptDefinition{{ID: "p1", Title: "Prompt"}}})
		case "/v1/prompts/p1":
			if r.Method == http.MethodPut {
				_ = json.NewEncoder(w).Encode(map[string]any{"prompt": gact.PromptDefinition{ID: "p1", Title: "Prompt"}})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"prompt": gact.ResolvedPrompt{ID: "p1", Profile: "heavy", Text: "body"}})
		case "/v1/prompts/p1/render":
			var req gact.PromptRenderRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode render: %v", err)
			}
			if req.SessionID != "s1" || req.WorkspaceID != "ws1" || req.Profile != "heavy" {
				t.Fatalf("render request = %+v", req)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"prompt": gact.ResolvedPrompt{ID: "p1", Profile: "heavy", Text: "rendered"}})
		case "/v1/prompts/p1/validate":
			var req gact.PromptValidateRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode validate: %v", err)
			}
			if req.SessionID != "s1" || req.WorkspaceID != "ws1" || req.Profile != "heavy" {
				t.Fatalf("validate request = %+v", req)
			}
			_ = json.NewEncoder(w).Encode(gact.PromptValidationResult{Enabled: true, Prompt: gact.PromptDefinition{ID: "p1"}})
		case "/v1/prompts/reload":
			var req map[string]string
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode reload: %v", err)
			}
			if req["session_id"] != "s1" || req["workspace_id"] != "ws1" {
				t.Fatalf("reload request = %+v", req)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"reload": gact.PromptReloadResult{PromptCount: 1, PromptIDs: []string{"p1"}}})
		case "/v1/memory/stats":
			_ = json.NewEncoder(w).Encode(gact.MemoryStats{})
		case "/v1/sessions/s1/context/frames":
			_ = json.NewEncoder(w).Encode(map[string]any{"frames": []map[string]any{{"id": "f1"}}})
		case "/v1/sessions/s1/context/frames/frame%2Fone":
			_ = json.NewEncoder(w).Encode(map[string]any{"frame": map[string]any{"id": "frame/one"}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	scope := RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"}
	if _, err := c.ListAgentsScoped(t.Context(), scope); err != nil {
		t.Fatalf("ListAgentsScoped: %v", err)
	}
	if _, err := c.GetAgentScoped(t.Context(), "a1", scope); err != nil {
		t.Fatalf("GetAgentScoped: %v", err)
	}
	if _, err := c.ListCommandsScoped(t.Context(), CommandFilter{RuntimeScope: scope, AgentID: "a1", Planner: true}); err != nil {
		t.Fatalf("ListCommandsScoped: %v", err)
	}
	if _, err := c.ListPromptsScoped(t.Context(), scope); err != nil {
		t.Fatalf("ListPromptsScoped: %v", err)
	}
	if _, err := c.GetPromptScoped(t.Context(), "p1", "heavy", scope); err != nil {
		t.Fatalf("GetPromptScoped: %v", err)
	}
	if _, err := c.SavePromptScoped(t.Context(), "p1", gact.PromptSaveRequest{Text: "body"}, scope); err != nil {
		t.Fatalf("SavePromptScoped: %v", err)
	}
	if _, err := c.RenderPromptScoped(t.Context(), "p1", "heavy", scope); err != nil {
		t.Fatalf("RenderPromptScoped: %v", err)
	}
	if _, err := c.ValidatePromptScoped(t.Context(), "p1", "heavy", "", scope); err != nil {
		t.Fatalf("ValidatePromptScoped: %v", err)
	}
	if _, err := c.ReloadPrompts(t.Context(), scope); err != nil {
		t.Fatalf("ReloadPrompts: %v", err)
	}
	if _, err := c.MemoryStatsScoped(t.Context(), scope); err != nil {
		t.Fatalf("MemoryStatsScoped: %v", err)
	}
	if _, err := c.ListContextFramesScoped(t.Context(), scope, 5); err != nil {
		t.Fatalf("ListContextFramesScoped: %v", err)
	}
	if _, err := c.GetContextFrameScoped(t.Context(), scope, "frame/one"); err != nil {
		t.Fatalf("GetContextFrameScoped: %v", err)
	}

	for _, row := range got {
		if row.path == "/v1/prompts/p1/render" || row.path == "/v1/prompts/p1/validate" || row.path == "/v1/prompts/reload" {
			continue
		}
		if row.query["workspace_id"] != "ws1" {
			t.Fatalf("%s workspace_id = %q, want ws1 (query=%v)", row.path, row.query["workspace_id"], row.query)
		}
		if row.path == "/v1/sessions/s1/context/frames" || row.path == "/v1/sessions/s1/context/frames/frame%2Fone" {
			if row.query["session_id"] != "" {
				t.Fatalf("frame routes should not duplicate session_id query: %v", row.query)
			}
			if row.path == "/v1/sessions/s1/context/frames" && row.query["limit"] != "5" {
				t.Fatalf("frame limit = %q, want 5", row.query["limit"])
			}
			continue
		}
		if row.query["session_id"] != "s1" {
			t.Fatalf("%s session_id = %q, want s1 (query=%v)", row.path, row.query["session_id"], row.query)
		}
		if row.path == "/v1/commands" {
			if row.query["planner"] != "true" || row.query["agent_id"] != "a1" {
				t.Fatalf("command policy query = %v, want planner=true agent_id=a1", row.query)
			}
		}
	}
}
