package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthProviderUsesCLIOProviderAuthEndpoint(t *testing.T) {
	var gotPath string
	var gotReq ProviderAuthRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.EscapedPath()
		if err := json.NewDecoder(r.Body).Decode(&gotReq); err != nil {
			t.Fatalf("decode auth request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(ProviderAuthResponse{
			ProviderID:      "argonne_sophia",
			IsAuthenticated: true,
		})
	}))
	defer srv.Close()

	resp, err := New(srv.URL).AuthProvider(t.Context(), "argonne_sophia", ProviderAuthRequest{Force: true})
	if err != nil {
		t.Fatalf("AuthProvider: %v", err)
	}
	if gotPath != "POST /v1/providers/argonne_sophia/auth" {
		t.Fatalf("path = %q, want provider auth endpoint", gotPath)
	}
	if !gotReq.Force {
		t.Fatalf("force refresh flag was not sent: %#v", gotReq)
	}
	if resp.ProviderID != "argonne_sophia" || !resp.IsAuthenticated {
		t.Fatalf("auth response = %#v", resp)
	}
}
