package ui

// display_helpers.go provides small shared display formatters (optional time, short context path).

import (
	"strings"
	"time"
)

func formatOptionalTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func shortContextPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "(unknown)"
	}
	parts := strings.Split(path, "/")
	if len(parts) <= 2 {
		return path
	}
	return "…/" + strings.Join(parts[len(parts)-2:], "/")
}
