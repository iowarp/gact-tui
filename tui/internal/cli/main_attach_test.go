package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func allAlive(_, _ string) bool { return true }
func allDead(_, _ string) bool  { return false }

func specificDead(deadSIDs ...string) func(string, string) bool {
	dead := map[string]bool{}
	for _, s := range deadSIDs {
		dead[s] = true
	}
	return func(_, sid string) bool { return !dead[sid] }
}

// TestCLI_AttachPrintOnly_ExplicitSid verifies `gact attach <sid>
// --print-only` resolves and prints the selected session id without launching
// the TUI.
func TestCLI_AttachPrintOnly_ExplicitSid(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, nil,
		"attach", "sess_abc123def456", "--print-only")
	if code != 0 {
		t.Fatalf("attach --print-only: exit %d (want 0)", code)
	}
	if got := strings.TrimSpace(stdout); got != "sess_abc123def456" {
		t.Errorf("stdout = %q, want 'sess_abc123def456'", got)
	}
}

func TestCLI_AttachPrintOnly_NoArgsReadsRegistry(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "print-only-target")

	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"print-only-target","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		sid, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	stdout, stderr, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND":       url,
		"GACT_DETACHED_PATH": regPath,
	}, "attach", "--print-only")
	if code != 0 {
		t.Fatalf("attach --print-only no args: exit %d stderr=%q", code, stderr)
	}
	if got := strings.TrimSpace(stdout); got != sid {
		t.Errorf("stdout = %q, want %q", got, sid)
	}
}

func TestDefaultAttachTarget_PicksMostRecentForBackend(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[
		{"session_id":"sess_old","title":"old","backend":"http://localhost:7777","detached_at":"2026-04-19T07:00:00Z"},
		{"session_id":"sess_new","title":"new","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"},
		{"session_id":"sess_other","title":"other","backend":"http://other:9999","detached_at":"2026-04-20T08:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := defaultAttachTargetWithProbe(allAlive)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "sess_new" {
		t.Errorf("got %q, want sess_new", got)
	}
}

func TestDefaultAttachTarget_NoMatchReturnsHelpfulError(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[{"session_id":"sess_a","backend":"http://other:9999","detached_at":"2026-04-20T07:00:00Z"}]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := defaultAttachTargetWithProbe(allAlive)
	if err == nil {
		t.Fatal("expected error when no detach matches the current backend")
	}
	if !strings.Contains(err.Error(), "no detached sessions") ||
		!strings.Contains(err.Error(), "http://localhost:7777") {
		t.Errorf("error should name the backend; got %q", err.Error())
	}
}

func TestDefaultAttachTarget_MissingRegistryIsHandled(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "never-existed.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	_, err := defaultAttachTargetWithProbe(allAlive)
	if err == nil {
		t.Fatal("expected error when registry is empty/missing")
	}
	if !strings.Contains(err.Error(), "no detached sessions") {
		t.Errorf("error should be the no-match message, got %q", err.Error())
	}
}

func TestDefaultAttachTarget_SkipsDeadCandidates(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[
		{"session_id":"sess_dead_top","backend":"http://localhost:7777","detached_at":"2026-04-20T08:00:00Z"},
		{"session_id":"sess_dead_mid","backend":"http://localhost:7777","detached_at":"2026-04-20T07:30:00Z"},
		{"session_id":"sess_alive","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := defaultAttachTargetWithProbe(specificDead("sess_dead_top", "sess_dead_mid"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "sess_alive" {
		t.Errorf("got %q, want sess_alive", got)
	}
}

func TestDefaultAttachTarget_AllDeadReturnsHelpfulError(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[
		{"session_id":"sess_a","backend":"http://localhost:7777","detached_at":"2026-04-20T08:00:00Z"},
		{"session_id":"sess_b","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := defaultAttachTargetWithProbe(allDead)
	if err == nil {
		t.Fatal("expected error when every candidate is dead")
	}
	if !strings.Contains(err.Error(), "none are still alive") ||
		!strings.Contains(err.Error(), "gact detached --probe") {
		t.Errorf("error should point to --probe for cleanup; got %q", err.Error())
	}
}
