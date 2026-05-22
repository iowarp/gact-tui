package client

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestErrorPreservesStructuredDetails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{
			"error": {
				"error": "agent_not_available",
				"message": "No agent is ready.",
				"details": {"agent_status": "starting"}
			}
		}`))
	}))
	defer srv.Close()

	c := New(srv.URL)
	_, err := c.PostMessage(context.Background(), "sess_x", PostMessageRequest{})
	if err == nil {
		t.Fatal("PostMessage error = nil")
	}

	var backendErr *Error
	if !errors.As(err, &backendErr) {
		t.Fatalf("PostMessage error = %T, want *Error", err)
	}
	if backendErr.Code != "agent_not_available" {
		t.Fatalf("code = %q, want agent_not_available", backendErr.Code)
	}
	if backendErr.Details["agent_status"] != "starting" {
		t.Fatalf("details[agent_status] = %#v, want starting", backendErr.Details["agent_status"])
	}
}
