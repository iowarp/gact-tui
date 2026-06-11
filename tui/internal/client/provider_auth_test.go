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

func TestLMProviderWaitAndHandshakeEndpoints(t *testing.T) {
	seen := map[string]bool{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen[r.Method+" "+r.URL.EscapedPath()] = true
		switch r.URL.EscapedPath() {
		case "/v1/providers/lm/wait":
			if r.URL.Query().Get("timeout") != "7.5" {
				t.Fatalf("wait timeout query = %q", r.URL.RawQuery)
			}
			_ = json.NewEncoder(w).Encode(LMProviderInfo{
				Configured:     true,
				Provider:       "argonne_sophia",
				Model:          "openai/gpt-oss-120b",
				State:          "ready",
				ChosenContext:  131072,
				ContextWindow:  131072,
				IsReasoning:    true,
				NativeToolCall: true,
			})
		case "/v1/providers/argonne_sophia/handshake":
			if r.URL.Query().Get("api_base") != "https://example.test/v1" || r.URL.Query().Get("refresh") != "true" {
				t.Fatalf("handshake query = %q", r.URL.RawQuery)
			}
			_ = json.NewEncoder(w).Encode(ProviderHandshakeResponse{
				Source:       "live",
				Connectivity: "ok",
				Auth:         "ok",
				ProviderID:   "argonne_sophia",
			})
		default:
			t.Fatalf("unexpected path %s", r.URL.String())
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	info, err := c.WaitLMProvider(t.Context(), 7.5)
	if err != nil {
		t.Fatalf("WaitLMProvider: %v", err)
	}
	if info == nil || !info.IsReasoning || !info.NativeToolCall || info.ChosenContext != 131072 {
		t.Fatalf("wait info = %#v", info)
	}
	handshake, err := c.ProviderHandshake(t.Context(), "argonne_sophia", "https://example.test/v1", true)
	if err != nil {
		t.Fatalf("ProviderHandshake: %v", err)
	}
	if handshake.Source != "live" || handshake.Connectivity != "ok" || handshake.Auth != "ok" {
		t.Fatalf("handshake = %#v", handshake)
	}
	if !seen["GET /v1/providers/lm/wait"] || !seen["GET /v1/providers/argonne_sophia/handshake"] {
		t.Fatalf("missing endpoint calls: %#v", seen)
	}
}
