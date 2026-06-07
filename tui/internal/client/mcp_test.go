package client

import (
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
