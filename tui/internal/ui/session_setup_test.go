package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

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

func TestSessionSetupRendersSeparatedWorkflowSectionsAndButtons(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.sessionSetupOpen = true
	a.sessionSetup = &sessionSetupState{
		blueprints: []gact.AgentBlueprintDefinition{{
			ID:          "earthscope-gnss-region",
			Title:       "EarthScope GNSS",
			Description: "GNSS benchmark workflow",
		}},
		packs: []gact.ExpertPackDefinition{{
			ID:          "ndp-tools",
			Title:       "NDP tools",
			Description: "NDP tools",
		}},
	}

	out := a.viewSessionSetup()
	for _, want := range []string{"Workflow blueprint", "Expert pack", "EarthScope GNSS", "NDP tools", "start session", "cancel"} {
		if !strings.Contains(out, want) {
			t.Fatalf("new-session setup missing %q:\n%s", want, out)
		}
	}
	for _, old := range []string{"←/→ change", "Start session  [Enter]"} {
		if strings.Contains(out, old) {
			t.Fatalf("new-session setup still looks like old row cycler %q:\n%s", old, out)
		}
	}
}

func TestSessionSetupMouseSelectsBlueprintAndExpertPackRows(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.sessionSetupOpen = true
	a.sessionSetup = &sessionSetupState{
		blueprints: []gact.AgentBlueprintDefinition{{ID: "earthscope-gnss-region", Title: "EarthScope GNSS"}},
		packs:      []gact.ExpertPackDefinition{{ID: "ndp-tools", Title: "NDP tools"}},
	}

	_ = a.View()
	blueprintTarget, ok := findHitTargetForTest(a, "session-setup:blueprint:1")
	if !ok {
		t.Fatal("missing blueprint row hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      blueprintTarget.rect.x,
		Y:      blueprintTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("blueprint row click should not dispatch backend command")
	}
	if a.sessionSetup.blueprintSel != 1 || a.sessionSetup.row != 0 {
		t.Fatalf("blueprint click selection = row %d sel %d", a.sessionSetup.row, a.sessionSetup.blueprintSel)
	}

	_ = a.View()
	packTarget, ok := findHitTargetForTest(a, "session-setup:pack:1")
	if !ok {
		t.Fatal("missing expert-pack row hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      packTarget.rect.x,
		Y:      packTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("expert-pack row click should not dispatch backend command")
	}
	if a.sessionSetup.packSel != 1 || a.sessionSetup.row != 1 {
		t.Fatalf("pack click selection = row %d sel %d", a.sessionSetup.row, a.sessionSetup.packSel)
	}
}

func TestSessionSetupEnterRunsPrimaryInsteadOfCyclingSelection(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.sessionSetupOpen = true
	a.sessionSetup = &sessionSetupState{
		row:          0,
		blueprintSel: 1,
		blueprints:   []gact.AgentBlueprintDefinition{{ID: "earthscope-gnss-region", Title: "EarthScope GNSS"}},
		packs:        []gact.ExpertPackDefinition{{ID: "ndp-tools", Title: "NDP tools"}},
	}

	_, cmd := a.handleSessionSetupKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter should dispatch primary new-session action")
	}
	if a.sessionSetupOpen {
		t.Fatal("Enter primary action should close setup modal")
	}
	if a.sessionSetup != nil {
		t.Fatal("setup state should clear after primary action")
	}
}
