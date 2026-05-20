package client

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRunCommandDecodesV02ErrorTaxonomy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"error":"command_error","message":"cache stats failed"}}`))
	}))
	defer srv.Close()

	err := New(srv.URL).RunCommand(context.Background(), "sess_1", "/cache-stats")

	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("RunCommand error = %T %v, want *Error", err, err)
	}
	if apiErr.Status != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", apiErr.Status, http.StatusInternalServerError)
	}
	if apiErr.Code != "command_error" {
		t.Fatalf("code = %q, want command_error", apiErr.Code)
	}
	if apiErr.Message != "cache stats failed" {
		t.Fatalf("message = %q, want cache stats failed", apiErr.Message)
	}
}
