package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSessionSetupCreateRunsTheChosenAgent(t *testing.T) {
	var requests []client.CreateSessionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/sessions" || r.Method != http.MethodPost {
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
		var req client.CreateSessionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode create session: %v", err)
		}
		requests = append(requests, req)
		_ = json.NewEncoder(w).Encode(gact.Session{
			ID:          "sess_1",
			WorkspaceID: req.WorkspaceID,
			Title:       req.Title,
			Agent:       gact.AgentRef{ID: "standard"},
			Metadata:    map[string]any{"agent_ref": "user/my-analyst"},
		})
	}))
	defer srv.Close()

	msg := createSessionWithAgentCmd(client.New(srv.URL), "ws1", "user/my-analyst")()
	created, ok := msg.(sessionCreatedMsg)
	if !ok {
		t.Fatalf("message = %T, want sessionCreatedMsg", msg)
	}
	if got := created.session.Metadata["agent_ref"]; got != "user/my-analyst" {
		t.Fatalf("session agent_ref = %v", got)
	}
	_ = createSessionWithAgentCmd(client.New(srv.URL), "ws1", "")()
	if len(requests) != 2 {
		t.Fatalf("requests = %d, want 2", len(requests))
	}
	if requests[0].WorkspaceID != "ws1" || requests[0].Agent == nil || requests[0].Agent.ID != "user/my-analyst" {
		t.Fatalf("chosen agent request = %+v", requests[0])
	}
	if requests[1].Agent != nil {
		t.Fatalf("backend-default request should name no agent, got %+v", requests[1].Agent)
	}
}

func TestSessionSetupRendersInstalledAgentsAndButtons(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.session.setupOpen = true
	a.session.setup = &sessionSetupState{
		agents: []gact.PluginAgent{
			{Ref: "clio/standard", ID: "standard", Name: "CLIO", Kind: "agent"},
			{Ref: "user/my-analyst", ID: "my-analyst", Name: "My analyst", Kind: "user"},
		},
	}

	out := a.session.viewSetup()
	for _, want := range []string{"Agent", "backend default", "CLIO  clio/standard", "My analyst  user/my-analyst (yours)", "start session", "cancel"} {
		if !strings.Contains(out, want) {
			t.Fatalf("new-session setup missing %q:\n%s", want, out)
		}
	}
	for _, old := range []string{"Workflow blueprint", "Expert pack"} {
		if strings.Contains(out, old) {
			t.Fatalf("new-session setup still shows removed section %q:\n%s", old, out)
		}
	}
}

func TestSessionSetupMouseSelectsAgentRow(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.session.setupOpen = true
	a.session.setup = &sessionSetupState{
		agents: []gact.PluginAgent{{Ref: "clio/standard", ID: "standard", Name: "CLIO"}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "session-setup:agent:1")
	if !ok {
		t.Fatal("missing agent row hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("agent row click should not dispatch backend command")
	}
	if a.session.setup.agentSel != 1 || a.session.setupSelectedAgentRef() != "clio/standard" {
		t.Fatalf("agent click selection = %d (%q)", a.session.setup.agentSel, a.session.setupSelectedAgentRef())
	}
}

func TestSessionSetupSeedsTheDefaultAgent(t *testing.T) {
	a := New("http://example.test")
	a.DefaultAgentRef = "user/my-analyst"
	a.session.setup = &sessionSetupState{}
	a.session.handleSetupLoaded(sessionSetupLoadedMsg{agents: []gact.PluginAgent{
		{Ref: "clio/standard", ID: "standard"},
		{Ref: "user/my-analyst", ID: "my-analyst"},
	}})
	if got := a.session.setupSelectedAgentRef(); got != "user/my-analyst" {
		t.Fatalf("seeded agent = %q, want user/my-analyst", got)
	}
}

func TestSessionSetupEnterRunsPrimaryInsteadOfCyclingSelection(t *testing.T) {
	a := New("http://example.test")
	a.stage = StageReady
	a.width, a.height = 120, 36
	a.session.setupOpen = true
	a.session.setup = &sessionSetupState{
		agentSel: 1,
		agents:   []gact.PluginAgent{{Ref: "clio/standard", ID: "standard", Name: "CLIO"}},
	}

	_, cmd := a.session.handleSetupKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter should dispatch primary new-session action")
	}
	if a.session.setupOpen {
		t.Fatal("Enter primary action should close setup modal")
	}
	if a.session.setup != nil {
		t.Fatal("setup state should clear after primary action")
	}
}
