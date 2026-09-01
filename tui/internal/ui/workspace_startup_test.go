package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSelectStartupWorkspaceID(t *testing.T) {
	workspaces := []gact.Workspace{
		{ID: "ws_default", Name: "default", RootPath: "/tmp/default"},
		{ID: "ws_analysis", Name: "analysis", RootPath: "/tmp/gact-analysis"},
	}
	for _, tc := range []struct {
		name     string
		selector string
		want     string
	}{
		{name: "empty falls back to first", selector: "", want: "ws_default"},
		{name: "id", selector: "ws_analysis", want: "ws_analysis"},
		{name: "name", selector: "analysis", want: "ws_analysis"},
		{name: "root", selector: "/tmp/gact-analysis", want: "ws_analysis"},
		{name: "root cleaned", selector: "/tmp/gact-analysis/.", want: "ws_analysis"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := selectStartupWorkspaceID(workspaces, tc.selector)
			if err != nil {
				t.Fatalf("selectStartupWorkspaceID: %v", err)
			}
			if got != tc.want {
				t.Fatalf("workspace id = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSelectStartupWorkspaceIDRejectsMissingOrAmbiguous(t *testing.T) {
	_, err := selectStartupWorkspaceID([]gact.Workspace{
		{ID: "ws_a", Name: "analysis", RootPath: "/tmp/a"},
		{ID: "ws_b", Name: "analysis", RootPath: "/tmp/b"},
	}, "analysis")
	if err == nil || !strings.Contains(err.Error(), "ambiguous") {
		t.Fatalf("ambiguous selector err = %v", err)
	}
	_, err = selectStartupWorkspaceID([]gact.Workspace{{ID: "ws_a", Name: "analysis"}}, "missing")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("missing selector err = %v", err)
	}
}

func TestConnectCmdUsesInitialWorkspaceSelector(t *testing.T) {
	var sessionsWorkspace string
	var commandsWorkspace string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/capabilities":
			writeJSON(t, w, gact.Capabilities{
				Capabilities: gact.CapabilityFlags{Workspaces: true, Sessions: true},
			})
		case "/v1/workspaces":
			writeJSON(t, w, map[string]any{"workspaces": []gact.Workspace{
				{ID: "ws_default", Name: "default", RootPath: "/tmp/default"},
				{ID: "ws_analysis", Name: "analysis", RootPath: "/tmp/gact-analysis"},
			}})
		case "/v1/sessions":
			sessionsWorkspace = r.URL.Query().Get("workspace_id")
			writeJSON(t, w, map[string]any{"sessions": []gact.Session{{
				ID: "sess_analysis", Title: "analysis session", WorkspaceID: sessionsWorkspace,
			}}})
		case "/v1/commands":
			commandsWorkspace = r.URL.Query().Get("workspace_id")
			writeJSON(t, w, map[string]any{"commands": []gact.Command{}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.SetInitialWorkspace("analysis")
	msg := a.connection.connectCmd()()
	connected, ok := msg.(connectedMsg)
	if !ok {
		t.Fatalf("connect message = %T %#v, want connectedMsg", msg, msg)
	}
	if connected.wsID != "ws_analysis" {
		t.Fatalf("connected workspace = %q, want ws_analysis", connected.wsID)
	}
	if sessionsWorkspace != "ws_analysis" {
		t.Fatalf("sessions workspace query = %q, want ws_analysis", sessionsWorkspace)
	}
	if commandsWorkspace != "ws_analysis" {
		t.Fatalf("commands workspace query = %q, want ws_analysis", commandsWorkspace)
	}
}

func TestConnectCmdSurfacesUnknownInitialWorkspace(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/capabilities":
			writeJSON(t, w, gact.Capabilities{
				Capabilities: gact.CapabilityFlags{Workspaces: true, Sessions: true},
			})
		case "/v1/workspaces":
			writeJSON(t, w, map[string]any{"workspaces": []gact.Workspace{{
				ID: "ws_default", Name: "default", RootPath: "/tmp/default",
			}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.SetInitialWorkspace("missing")
	msg := a.connection.connectCmd()()
	got, ok := msg.(errMsg)
	if !ok {
		t.Fatalf("connect message = %T %#v, want errMsg", msg, msg)
	}
	if got.stage != "workspaces" || !strings.Contains(got.err.Error(), "missing") {
		t.Fatalf("errMsg = %#v", got)
	}
}

func TestConnectCmdReconnectUsesCurrentWorkspace(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.SetInitialWorkspace("analysis")
	a.session.wsID = "ws_visual"
	if got := strings.TrimSpace(a.connection.connectWorkspaceSelector()); got != "ws_visual" {
		t.Fatalf("connect selector = %q, want current workspace", got)
	}
	a.session.wsID = ""
	if got := strings.TrimSpace(a.connection.connectWorkspaceSelector()); got != "analysis" {
		t.Fatalf("connect selector = %q, want initial workspace", got)
	}
}

func writeJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}
