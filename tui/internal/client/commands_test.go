package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestCommandClientEndpoints(t *testing.T) {
	var gotQuery string
	var gotRunPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/commands":
			gotQuery = r.URL.RawQuery
			_ = json.NewEncoder(w).Encode(map[string]any{
				"commands": []gact.Command{{ID: "/compact", Title: "Compact"}},
			})
		case r.Method == http.MethodPost:
			gotRunPath = r.URL.EscapedPath()
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	commands, err := c.ListCommandsScoped(t.Context(), CommandFilter{
		RuntimeScope: RuntimeScope{WorkspaceID: "ws 1", SessionID: "s/1"},
		AgentID:      "main",
		Planner:      true,
	})
	if err != nil || len(commands) != 1 || commands[0].ID != "/compact" {
		t.Fatalf("ListCommandsScoped: commands=%#v err=%v", commands, err)
	}
	if gotQuery != "agent_id=main&planner=true&session_id=s%2F1&workspace_id=ws+1" {
		t.Fatalf("query = %q", gotQuery)
	}
	if err := c.RunCommand(t.Context(), "s1", "/compact"); err != nil {
		t.Fatalf("RunCommand: %v", err)
	}
	if gotRunPath != "/v1/sessions/s1/commands/%2Fcompact" {
		t.Fatalf("run path = %q", gotRunPath)
	}
}
