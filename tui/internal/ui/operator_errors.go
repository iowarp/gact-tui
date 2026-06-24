package ui

// operator_errors.go formats operator-facing error and failure-hint messages.

import (
	"errors"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func operatorErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	var clientErr *client.Error
	if errors.As(err, &clientErr) {
		if msg := strings.TrimSpace(clientErr.Message); msg != "" {
			return stripOperatorErrorPrefix(msg)
		}
		if code := strings.TrimSpace(clientErr.Code); code != "" {
			return code
		}
	}
	return err.Error()
}

func stripOperatorErrorPrefix(msg string) string {
	lower := strings.ToLower(msg)
	for _, prefix := range []string{
		"agent create failed:",
		"agent extraction failed:",
		"agent edit failed:",
		"agent delete failed:",
		"expert pack install failed:",
		"expert pack update failed:",
		"expert pack delete failed:",
		"auth failed:",
		"cancel failed:",
		"session create failed:",
		"context add failed:",
	} {
		if strings.HasPrefix(lower, prefix) {
			return strings.TrimSpace(msg[len(prefix):])
		}
	}
	return msg
}

func operatorFailureHint(subject, action string, err error) string {
	prefix := strings.TrimSpace(subject + " " + operatorActionVerb(action) + " failed")
	msg := operatorErrorMessage(err)
	if msg == "" {
		return prefix
	}
	if strings.HasPrefix(strings.ToLower(msg), strings.ToLower(prefix)+":") {
		return msg
	}
	return prefix + ": " + msg
}

func operatorActionVerb(action string) string {
	switch strings.TrimSpace(strings.ToLower(action)) {
	case "updated":
		return "update"
	case "deleted":
		return "delete"
	case "installed":
		return "install"
	case "refreshed":
		return "refresh"
	default:
		return strings.TrimSpace(action)
	}
}
