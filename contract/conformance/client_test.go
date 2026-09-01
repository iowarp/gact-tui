package conformance

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConformClientNegotiatesGACTV3(t *testing.T) {
	t.Helper()

	var observed []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed = append(observed, r.Header.Get("X-GACT-Version"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	client := &conformClient{baseURL: server.URL, http: server.Client()}
	if _, _, err := client.get(context.Background(), "/v1/capabilities"); err != nil {
		t.Fatalf("GET request failed: %v", err)
	}
	if _, _, err := client.postJSON(context.Background(), "/v1/sessions", map[string]any{}); err != nil {
		t.Fatalf("POST request failed: %v", err)
	}

	if len(observed) != 2 {
		t.Fatalf("observed %d requests, want 2", len(observed))
	}
	for index, version := range observed {
		if version != "0.3" {
			t.Errorf("request %d X-GACT-Version = %q, want %q", index, version, "0.3")
		}
	}
}
