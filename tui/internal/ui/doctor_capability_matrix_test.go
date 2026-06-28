package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestCapabilityMatrixDocCoversDoctorRows(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	doc := string(raw)
	if !strings.Contains(doc, "# GACT TUI 1.0 Capability Matrix") {
		t.Fatal("capability matrix should be labeled as the active 1.0 release gate")
	}
	if strings.Contains(doc, "0.9 status") ||
		strings.Contains(doc, "CLIO 0.9") ||
		strings.Contains(doc, "standalone 0.9") {
		t.Fatal("capability matrix still contains stale 0.9 release-gate wording")
	}
	for _, row := range doctorCapabilityRows(gact.Capabilities{}) {
		if !strings.Contains(doc, "`"+row.name+"`") {
			t.Fatalf("capability matrix missing backend field %q", row.name)
		}
	}
}

func TestCapabilityMatrixDocMatchesDoctorSupportClasses(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	docSupport := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || !strings.Contains(line, "`") {
			continue
		}
		cols := strings.Split(line, "|")
		if len(cols) < 5 {
			continue
		}
		field := strings.Trim(strings.TrimSpace(cols[2]), "`")
		support := strings.TrimSpace(cols[3])
		if field != "" && support != "" && field != "Backend field" {
			docSupport[field] = support
		}
	}
	for _, row := range doctorCapabilityRows(gact.Capabilities{}) {
		want := capUISupportPlainLabel(row.ui)
		if want == "not surfaced" {
			want = "none"
		}
		got, ok := docSupport[row.name]
		if !ok {
			t.Fatalf("capability matrix missing support class for %q", row.name)
		}
		if got != want {
			t.Fatalf("capability matrix support for %q = %q, want Doctor support %q", row.name, got, want)
		}
	}
}

func TestCapabilityMatrixDocNonFullRowsCarryDisposition(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || !strings.Contains(line, "`") {
			continue
		}
		cols := strings.Split(line, "|")
		if len(cols) < 5 {
			continue
		}
		field := strings.Trim(strings.TrimSpace(cols[2]), "`")
		support := strings.TrimSpace(cols[3])
		status := strings.ToLower(strings.TrimSpace(cols[4]))
		if field == "" || field == "Backend field" {
			continue
		}
		switch support {
		case "partial", "gated", "none":
			if !hasCapabilityDisposition(status) {
				t.Fatalf("capability matrix %s row %q needs issue/proof/deferred/non-goal disposition: %q", support, field, strings.TrimSpace(cols[4]))
			}
		}
	}
}

func hasCapabilityDisposition(status string) bool {
	for _, marker := range []string{"#", "proof", "non-goal", "defer"} {
		if strings.Contains(status, marker) {
			return true
		}
	}
	return false
}

func capabilityMatrixPath() string {
	return filepath.Join("..", "..", "..", "docs", "TUI_ONE_ZERO_CAPABILITY_MATRIX.md")
}
