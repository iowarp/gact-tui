package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestCreateWorkspaceRequestShape(t *testing.T) {
	var got CreateWorkspaceRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1/workspaces" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode workspace body: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(gact.Workspace{
			ID:       "ws_new",
			Name:     "demo",
			RootPath: "/tmp/demo",
		})
	}))
	defer srv.Close()

	ws, err := New(srv.URL).CreateWorkspace(t.Context(), CreateWorkspaceRequest{
		Name:     "demo",
		RootPath: "/tmp/demo",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if got.Name != "demo" || got.RootPath != "/tmp/demo" {
		t.Fatalf("workspace body = %+v", got)
	}
	if ws.ID != "ws_new" || ws.RootPath != "/tmp/demo" {
		t.Fatalf("workspace = %+v", ws)
	}
}
