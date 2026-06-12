package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMcpReconnectRequestShape(t *testing.T) {
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.EscapedPath()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := New(srv.URL).McpReconnect(t.Context(), "mcp docs"); err != nil {
		t.Fatalf("McpReconnect: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/v1/mcp/servers/mcp%20docs/reconnect" {
		t.Fatalf("request = %s %s, want POST escaped reconnect path", gotMethod, gotPath)
	}
}

func TestMcpHandshakeUsesScopedEndpoint(t *testing.T) {
	var gotPath, gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		gotQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(McpHandshakeResponse{Servers: []McpHandshakeServer{{
			Name:       "earthscope",
			Reachable:  true,
			State:      "ready",
			Transport:  "stdio",
			ToolsCount: 2,
			Tools:      []string{"discover", "stage"},
		}}})
	}))
	defer srv.Close()

	resp, err := New(srv.URL).McpHandshake(t.Context(), RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})
	if err != nil {
		t.Fatalf("McpHandshake: %v", err)
	}
	if gotPath != "/v1/mcp/handshake" || gotQuery != "session_id=s1&workspace_id=ws1" {
		t.Fatalf("request = %s?%s", gotPath, gotQuery)
	}
	if len(resp.Servers) != 1 || !resp.Servers[0].Reachable || resp.Servers[0].ToolsCount != 2 {
		t.Fatalf("handshake response = %#v", resp)
	}
}
