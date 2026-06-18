package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSessionSetupCreateBindsBlueprintAndExpertPack(t *testing.T) {
	var createdWorkspace, boundBlueprint, boundPack string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/sessions":
			if r.Method != http.MethodPost {
				t.Fatalf("sessions method = %s", r.Method)
			}
			var req client.CreateSessionRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode create session: %v", err)
			}
			createdWorkspace = req.WorkspaceID
			_ = json.NewEncoder(w).Encode(gact.Session{
				ID:          "sess_1",
				WorkspaceID: req.WorkspaceID,
				Title:       req.Title,
				Agent:       gact.AgentRef{ID: "default"},
				Metadata:    map[string]any{},
			})
		case "/v1/sessions/sess_1/agent-blueprint":
			if r.Method != http.MethodPost {
				t.Fatalf("agent-blueprint method = %s", r.Method)
			}
			var req gact.SetSessionAgentBlueprintRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode blueprint bind: %v", err)
			}
			boundBlueprint = req.BlueprintID
			_ = json.NewEncoder(w).Encode(gact.SessionAgentBlueprintState{
				SessionID:              "sess_1",
				WorkspaceID:            "ws1",
				ActiveAgentBlueprintID: req.BlueprintID,
			})
		case "/v1/sessions/sess_1/expert-pack":
			if r.Method != http.MethodPost {
				t.Fatalf("expert-pack method = %s", r.Method)
			}
			var req gact.SetSessionExpertPackRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode expert-pack bind: %v", err)
			}
			boundPack = req.PackID
			_ = json.NewEncoder(w).Encode(gact.SessionExpertPackState{
				SessionID:          "sess_1",
				WorkspaceID:        "ws1",
				ActiveExpertPackID: req.PackID,
			})
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	msg := createSessionWithSemanticsCmd(client.New(srv.URL), "ws1", sessionSetupSelection{
		BlueprintID: "earthscope-gnss-region",
		PackID:      "ndp-tools",
	})()
	created, ok := msg.(sessionCreatedMsg)
	if !ok {
		t.Fatalf("message = %T, want sessionCreatedMsg", msg)
	}
	if created.semanticWarning != "" {
		t.Fatalf("semanticWarning = %q", created.semanticWarning)
	}
	if createdWorkspace != "ws1" || boundBlueprint != "earthscope-gnss-region" || boundPack != "ndp-tools" {
		t.Fatalf("bindings = workspace %q blueprint %q pack %q", createdWorkspace, boundBlueprint, boundPack)
	}
	if got := created.session.Metadata["active_agent_blueprint_id"]; got != "earthscope-gnss-region" {
		t.Fatalf("session active_agent_blueprint_id = %v", got)
	}
	if got := created.session.Metadata["active_expert_pack_id"]; got != "ndp-tools" {
		t.Fatalf("session active_expert_pack_id = %v", got)
	}
}

func TestSessionSetupFiltersPackKindFromBlueprintChoices(t *testing.T) {
	got := filterSessionSetupBlueprints([]gact.AgentBlueprintDefinition{
		{ID: "workflow", Kind: "blueprint"},
		{ID: "legacy-pack", Kind: "pack"},
		{ID: "plain"},
	})
	if len(got) != 2 || got[0].ID != "workflow" || got[1].ID != "plain" {
		t.Fatalf("filtered blueprints = %#v", got)
	}
}
