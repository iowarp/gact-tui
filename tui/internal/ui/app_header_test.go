package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// HHH1: connected deployment labels should replace raw backend URLs.
func TestRenderHeader_DeploymentLabel(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.BackendLabel = "myclio (clio)"
	a.width = 200
	got := a.chrome.renderHeader()
	if !strings.Contains(got, "myclio (clio)") {
		t.Errorf("expected deployment label in header, got: %q", got)
	}
	if strings.Contains(got, "http://test.local") {
		t.Errorf("raw backend URL should be hidden when deployment label is available: %q", got)
	}
}

func TestRenderHeader_GlobalLMWinsOverStaleSessionModel(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.lmProviderInfo = &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		Model:      "qwopus3.5-9b-v3",
	}
	a.width = 200
	got := a.chrome.renderHeader()
	if !strings.Contains(got, "model: lm_studio/qwopus3.5-9b-v3") {
		t.Errorf("expected global LM model label in header, got: %q", got)
	}
	if strings.Contains(got, "claude-opus-4-7") {
		t.Errorf("stale per-session model should not appear when global LM is configured: %q", got)
	}
	if strings.Count(got, "model:") != 1 {
		t.Errorf("expected exactly one model label, got: %q", got)
	}
	if strings.Contains(got, "agent: default") {
		t.Errorf("default agent label should be suppressed, got: %q", got)
	}
	if !strings.Contains(got, "workspace: default") {
		t.Errorf("workspace label should be spelled out, got: %q", got)
	}
}

func TestRenderHeader_WorkspaceRootPathVisible(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_1", Title: "demo", Status: gact.StatusIdle},
	}, nil)
	a.session.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha", RootPath: "/tmp/alpha"},
		{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo"},
	}
	a.session.wsID = "ws_b"
	a.width = 200

	got := a.chrome.renderHeader()
	if !strings.Contains(got, "workspace: bravo @ /tmp/bravo") {
		t.Fatalf("workspace header should include active root path, got: %q", got)
	}
}

func TestRenderHeader_HistoricalSessionWithoutModelDoesNotBorrowCurrentLM(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "persisted trace", Status: gact.StatusIdle,
			MessageCount: 4,
		},
	}, nil)
	a.lmProviderInfo = &client.LMProviderInfo{
		Configured: true,
		Provider:   "argonne",
		Model:      "gpt-oss-120b",
	}
	a.width = 200

	got := a.chrome.renderHeader()
	if strings.Contains(got, "model:") {
		t.Fatalf("historical session without recorded model should not borrow current backend model: %q", got)
	}
}

func TestRenderHeader_NonDefaultAgentAndRouting(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Agent:       gact.AgentRef{ID: "analysis", Mode: "review"},
			RoutingMode: "experts",
		},
	}, nil)
	a.width = 200
	got := a.chrome.renderHeader()
	if !strings.Contains(got, "agent: analysis (review)") {
		t.Errorf("expected non-default agent label in header, got: %q", got)
	}
	if !strings.Contains(got, "routing: experts") {
		t.Errorf("expected routing label in header, got: %q", got)
	}
}

// HHH1 narrow-window guard: model/agent get dropped, but session label
// still wins over them - header should never panic on tight widths.
func TestRenderHeader_NarrowDropsOptional(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.width = 50
	got := a.chrome.renderHeader()
	if !strings.Contains(got, "GACT") {
		t.Errorf("required GACT badge missing in narrow header: %q", got)
	}
}
