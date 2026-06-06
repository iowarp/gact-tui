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

func TestOperatorErrorMessageStripsKnownAgentLifecyclePrefixes(t *testing.T) {
	err := &client.Error{Status: 409, Code: "agent_create_failed", Message: "agent create failed: workspace registry rejected this id"}
	if got := operatorErrorMessage(err); got != "workspace registry rejected this id" {
		t.Fatalf("operator error = %q", got)
	}
}

func TestOperatorErrorMessageStripsKnownExpertPackLifecyclePrefixes(t *testing.T) {
	err := &client.Error{Status: 502, Code: "install_failed", Message: "expert pack install failed: manifest clio-pack.yaml was not found"}
	if got := operatorErrorMessage(err); got != "manifest clio-pack.yaml was not found" {
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

func TestAgentWriteHintsUseStructuredOperatorError(t *testing.T) {
	a := New("http://unused")
	err := &client.Error{Status: 409, Code: "agent_create_failed", Message: "workspace registry rejected this id"}

	_, _ = a.Update(agentWriteDoneMsg{mode: agentWriteModeClone, err: err})

	if got := a.transientHint; got != "agent write failed: workspace registry rejected this id" {
		t.Fatalf("agent write hint = %q", got)
	}
}
