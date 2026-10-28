package ui

import (
	"errors"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestOperatorErrorMessageUsesStructuredClientMessage(t *testing.T) {
	err := &client.Error{Status: 502, Code: "mcp_reconnect_failed", Message: "probe failed: connection refused"}
	if got := operatorErrorMessage(err); got != "probe failed: connection refused" {
		t.Fatalf("operator error = %q", got)
	}
}

func TestOperatorErrorMessageStripsKnownCancelPrefix(t *testing.T) {
	err := &client.Error{Status: 502, Code: "cancel_failed", Message: "cancel failed: runtime supervisor did not acknowledge the request"}
	if got := operatorErrorMessage(err); got != "runtime supervisor did not acknowledge the request" {
		t.Fatalf("operator error = %q", got)
	}
}

func TestOperatorErrorMessageStripsKnownSessionCreatePrefix(t *testing.T) {
	err := &client.Error{Status: 502, Code: "session_create_failed", Message: "session create failed: workspace registry is temporarily unavailable"}
	if got := operatorErrorMessage(err); got != "workspace registry is temporarily unavailable" {
		t.Fatalf("operator error = %q", got)
	}
}

func TestOperatorErrorMessageStripsKnownContextAddPrefix(t *testing.T) {
	err := &client.Error{Status: 502, Code: "context_add_failed", Message: "context add failed: workspace file index is temporarily unavailable"}
	if got := operatorErrorMessage(err); got != "workspace file index is temporarily unavailable" {
		t.Fatalf("operator error = %q", got)
	}
}

func TestOperatorErrorMessageKeepsPlainErrors(t *testing.T) {
	err := errors.New("disk full")
	if got := operatorErrorMessage(err); got != "disk full" {
		t.Fatalf("operator error = %q", got)
	}
}
