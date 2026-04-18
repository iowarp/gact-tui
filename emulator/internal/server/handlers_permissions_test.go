package server

import (
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestPermissionHandlers(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	// Seed two permissions directly via the perms store.
	p1 := srv.Permissions().Create(gact.PermissionRequest{SessionID: "sess_a", Summary: "ok"})
	p2 := srv.Permissions().Create(gact.PermissionRequest{SessionID: "sess_b", Summary: "ok"})
	_, _ = p2, p1 // silence unused if test is trimmed

	// list all
	{
		rec := do(t, h, http.MethodGet, "/v1/permissions", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
		var body ListPermissionsResponse
		mustDecode(t, rec, &body)
		if len(body.Permissions) != 2 {
			t.Errorf("list count = %d, want 2", len(body.Permissions))
		}
	}

	// list filtered by session_id
	{
		rec := do(t, h, http.MethodGet, "/v1/permissions?session_id=sess_a", nil)
		var body ListPermissionsResponse
		mustDecode(t, rec, &body)
		if len(body.Permissions) != 1 {
			t.Errorf("filter sess_a: %d, want 1", len(body.Permissions))
		}
	}

	// list pending only
	{
		rec := do(t, h, http.MethodGet, "/v1/permissions?status=pending", nil)
		var body ListPermissionsResponse
		mustDecode(t, rec, &body)
		if len(body.Permissions) != 2 {
			t.Errorf("pending: %d, want 2", len(body.Permissions))
		}
	}

	// get one
	{
		rec := do(t, h, http.MethodGet, "/v1/permissions/"+p1.ID, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
		var got store.PermissionRequest
		mustDecode(t, rec, &got)
		if got.ID != p1.ID {
			t.Errorf("get returned wrong ID")
		}
	}

	// get missing
	{
		rec := do(t, h, http.MethodGet, "/v1/permissions/perm_nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing: %d", rec.Code)
		}
	}

	// respond — bad action
	{
		rec := do(t, h, http.MethodPost, "/v1/permissions/"+p1.ID, PermissionResponseRequest{Action: "garbage"})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("bad action: %d", rec.Code)
		}
	}

	// respond — allow
	{
		rec := do(t, h, http.MethodPost, "/v1/permissions/"+p1.ID, PermissionResponseRequest{Action: store.PermAllow})
		if rec.Code != http.StatusNoContent {
			t.Errorf("respond: %d %s", rec.Code, rec.Body.String())
		}
	}

	// respond — already resolved
	{
		rec := do(t, h, http.MethodPost, "/v1/permissions/"+p1.ID, PermissionResponseRequest{Action: store.PermDeny})
		if rec.Code != http.StatusNotFound {
			t.Errorf("double resolve: %d", rec.Code)
		}
	}

	// respond — missing
	{
		rec := do(t, h, http.MethodPost, "/v1/permissions/perm_nope", PermissionResponseRequest{Action: store.PermAllow})
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing: %d", rec.Code)
		}
	}
}
